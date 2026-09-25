"use server";

import { auditedRun } from "@/lib/pricing/audited-action";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { UserError } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";
import { diffParams, parseParams } from "@/lib/pricing/params-schema";
import { publishParamsVersion } from "@/lib/pricing/store-core";
import { getActiveVersion, paramsOf, pricingAudit } from "@/lib/pricing/server";
import { formObject, keysOf, optStr, reqEnum, reqStr } from "@/lib/actions";
import { UFS } from "@/lib/catalogs";

/** Publica nova versão de parâmetros. Nunca altera versões anteriores (orçamentos antigos não mudam). */
export async function publishParams(json: string, description: string, v2Validation: { confirmed: boolean; note: string } | null): Promise<ActionState> {
  return auditedRun("publishParams", null, async () => {
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

export async function toggleService(code: string, active: boolean): Promise<ActionState> {
  return auditedRun("toggleService", null, async () => {
    const user = await assertPermission("pricing:params");
    const s = await db.pricingService.update({ where: { code }, data: { active } });
    await pricingAudit(db, user.id, "SERVICO", "PricingService", s.id, { field: "active", previousValue: !active, newValue: active });
  });
}

// ── Leis municipais de compensação ambiental ──
const ruleSchema = z.object({
  city: reqStr("Município", 120),
  state: reqEnum(keysOf(UFS), "UF"),
  lawReference: reqStr("Lei aplicável", 300),
  seedlingsPerTree: z.preprocess(
    (v) => (typeof v === "string" ? Number(v.trim().replace(",", ".")) : v),
    z.number({ error: "Mudas por árvore: número inválido." }).min(0, "Mudas por árvore não pode ser negativo.").max(10_000),
  ),
  freightValue: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(String(v).trim().replace(/\./g, "").replace(",", "."))),
    z.number({ error: "Frete: número inválido." }).min(0, "Frete não pode ser negativo.").nullable(),
  ),
  notes: optStr(1000),
});

export async function saveCompensationRule(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  return auditedRun("saveCompensationRule", null, async () => {
    const user = await assertPermission("pricing:params");
    const d = ruleSchema.parse(formObject(fd));
    const data = { ...d, seedlingsPerTree: String(d.seedlingsPerTree), freightValue: d.freightValue === null ? null : String(d.freightValue) };
    const before = id ? await db.compensationRule.findUniqueOrThrow({ where: { id } }) : null;
    const r = id ? await db.compensationRule.update({ where: { id }, data }) : await db.compensationRule.create({ data });
    await pricingAudit(db, user.id, id ? "LEI_MUNICIPAL_ALTERADA" : "LEI_MUNICIPAL_CRIADA", "CompensationRule", r.id, {
      field: `${r.city}/${r.state}`,
      previousValue: before ? { lei: before.lawReference, mudasPorArvore: before.seedlingsPerTree.toString(), frete: before.freightValue?.toString() ?? null } : undefined,
      newValue: { lei: r.lawReference, mudasPorArvore: r.seedlingsPerTree.toString(), frete: r.freightValue?.toString() ?? null },
    });
    return { ok: true, message: id ? "Regra municipal atualizada." : "Regra municipal cadastrada." };
  });
}

export async function toggleCompensationRule(id: string, active: boolean): Promise<ActionState> {
  return auditedRun("toggleCompensationRule", null, async () => {
    const user = await assertPermission("pricing:params");
    const r = await db.compensationRule.update({ where: { id }, data: { active } });
    await pricingAudit(db, user.id, "LEI_MUNICIPAL_ALTERADA", "CompensationRule", id, { field: "active", previousValue: !active, newValue: active, justification: `${r.city}/${r.state}` });
  });
}
