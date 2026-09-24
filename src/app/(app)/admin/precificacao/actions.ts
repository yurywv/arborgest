"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { runAction, UserError } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";
import { diffParams, parseParams } from "@/lib/pricing/params-schema";
import { publishParamsVersion } from "@/lib/pricing/store-core";
import { getActiveVersion, paramsOf, pricingAudit } from "@/lib/pricing/server";
import { PROPOSAL_TEXT_DEFAULTS, type ProposalTextKey } from "@/lib/pricing/proposal-texts";

/** Publica nova versão de parâmetros. Nunca altera versões anteriores (orçamentos antigos não mudam). */
export async function publishParams(json: string, description: string, v2Validation: { confirmed: boolean; note: string } | null): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("pricing:params");
    const desc = z.string().trim().min(5, "Descreva o motivo da alteração (mínimo 5 caracteres).").max(500).parse(description);
    const params = parseParams(JSON.parse(json));
    const active = await getActiveVersion();
    const current = paramsOf(active);
    const changes = diffParams(current, params);
    if (!changes.length) throw new UserError("Nenhum parâmetro foi alterado.");

    let v2Note: string | null = null;
    if (params.engineVersion === "V2_ARBORENT" && current.engineVersion !== "V2_ARBORENT") {
      if (!v2Validation?.confirmed || v2Validation.note.trim().length < 10)
        throw new UserError("Para ativar o motor v2 confirme a validação administrativa e descreva a análise do comparativo (mínimo 10 caracteres).");
      v2Note = v2Validation.note.trim();
    }
    const version = await db.$transaction(async (tx) => {
      const v = await publishParamsVersion(tx, params, { description: desc, userId: user.id, v2ValidatedNote: v2Note });
      await pricingAudit(tx, user.id, "PARAMETROS", "PricingParameterVersion", v.id, {
        field: `versão ${active.label} → ${v.label}`,
        previousValue: Object.fromEntries(changes.map((c) => [c.path, c.from])),
        newValue: Object.fromEntries(changes.map((c) => [c.path, c.to])),
        justification: desc,
      });
      return v;
    });
    await audit(user.id, "UPDATE", "PricingParameterVersion", version.id, `versão ${version.label}: ${changes.length} alteração(ões)`);
    return { ok: true, message: `Versão ${version.label} publicada (${changes.length} alteração(ões)). Orçamentos existentes mantêm a versão com que foram calculados.` };
  });
}

export async function saveProposalTexts(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("pricing:params");
    for (const k of Object.keys(PROPOSAL_TEXT_DEFAULTS) as ProposalTextKey[]) {
      const v = String(fd.get(k) ?? "").trim().slice(0, 4000);
      await db.setting.upsert({ where: { key: k }, create: { key: k, value: v }, update: { value: v } });
    }
    await pricingAudit(db, user.id, "TEXTOS_PROPOSTA", "Setting", null, { justification: "Textos padrão da proposta atualizados" });
    return { ok: true, message: "Textos padrão salvos." };
  });
}

export async function toggleService(code: string, active: boolean): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("pricing:params");
    const s = await db.pricingService.update({ where: { code }, data: { active } });
    await pricingAudit(db, user.id, "SERVICO", "PricingService", s.id, { field: "active", previousValue: !active, newValue: active });
  });
}
