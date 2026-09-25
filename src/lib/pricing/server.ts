import "server-only";
import { cache } from "react";
import type { Prisma, PricingParameterVersion } from "@prisma/client";
import { db } from "@/lib/db";
import { clientIp, type CurrentUser } from "@/lib/auth/session";
import { nextCounter } from "@/lib/counters";
import { calculate } from "./registry";
import { ensurePricingSetup } from "./store-core";
import { normalizeParams } from "./defaults";
import type { PricingParams, ServiceCode } from "./types";

type Tx = Prisma.TransactionClient;

export { ENGINE_BUILD } from "./estimate-core";

export const paramsOf = (v: Pick<PricingParameterVersion, "snapshot">) => normalizeParams(v.snapshot as unknown as PricingParams);

/** Versão de parâmetros vigente (cria a inicial se o banco ainda não tiver nenhuma). */
export const getActiveVersion = cache(async () => {
  let v = await db.pricingParameterVersion.findFirst({ where: { active: true } });
  if (!v) {
    await ensurePricingSetup(db);
    v = await db.pricingParameterVersion.findFirstOrThrow({ where: { active: true } });
  }
  return v;
});

export async function getVersion(id: string) {
  return db.pricingParameterVersion.findUniqueOrThrow({ where: { id } });
}

// ── Numeração ──
export async function nextEstimateNumber() {
  const y = new Date().getFullYear();
  return `${y}-${String(await nextCounter(`estimate:${y}`)).padStart(5, "0")}`;
}
export async function nextProposalNumber() {
  const y = new Date().getFullYear();
  return `PROP-${y}-${String(await nextCounter(`proposal:${y}`)).padStart(5, "0")}`;
}

// ── Auditoria ──
export async function pricingAudit(
  tx: Tx | typeof db,
  userId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  extra: { estimateId?: string | null; field?: string; previousValue?: unknown; newValue?: unknown; justification?: string | null } = {},
) {
  const str = (v: unknown) => (v === undefined ? null : v === null ? "—" : typeof v === "string" ? v : JSON.stringify(v));
  await tx.pricingAuditLog.create({
    data: {
      userId, action, entity, entityId, estimateId: extra.estimateId ?? null, field: extra.field ?? null,
      previousValue: str(extra.previousValue), newValue: str(extra.newValue), justification: extra.justification ?? null,
      ip: await clientIp().catch(() => null),
    },
  });
}

// Núcleo de persistência compartilhado com o seed (sem server-only).
export { buildSnapshot, calcResultOf, persistCalculation, recomputeEstimate, snapshotHash } from "./estimate-core";

/** Calcula no servidor com os parâmetros da versão informada (nunca confia no valor vindo do navegador). */
export function serverCalculate(version: PricingParameterVersion, service: ServiceCode, rawInputs: unknown) {
  const params = paramsOf(version);
  const { inputs, result } = calculate(service, rawInputs, params);
  return { params, inputs, result };
}

export const FINAL_STATUSES = ["ACEITO", "RECUSADO", "CANCELADO", "EXPIRADO"] as const;
/** Todo orçamento pode ser editado; nos status finais a edição reabre o orçamento (registrado). */
export const EDITABLE_STATUSES = ["RASCUNHO", "EM_ELABORACAO", "EM_APROVACAO_INTERNA", "APROVADO_INTERNAMENTE", "EM_NEGOCIACAO", "ENVIADO_CLIENTE", "ACEITO", "RECUSADO", "CANCELADO", "EXPIRADO"] as const;

/** Marca como EXPIRADO orçamentos em aberto com validade vencida. */
export async function expireEstimates() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = await db.pricingEstimate.findMany({
    where: { validUntil: { lt: today }, status: { in: ["RASCUNHO", "EM_ELABORACAO", "EM_APROVACAO_INTERNA", "APROVADO_INTERNAMENTE", "ENVIADO_CLIENTE", "EM_NEGOCIACAO"] } },
    select: { id: true, status: true },
  });
  for (const e of due) {
    await db.$transaction(async (tx) => {
      await tx.pricingEstimate.update({ where: { id: e.id }, data: { status: "EXPIRADO" } });
      await tx.proposalApproval.updateMany({ where: { estimateId: e.id, status: "PENDENTE" }, data: { status: "CANCELADO", comment: "Orçamento expirado" } });
      await pricingAudit(tx, null, "EXPIRACAO", "PricingEstimate", e.id, { estimateId: e.id, field: "status", previousValue: e.status, newValue: "EXPIRADO", justification: "Validade vencida" });
    });
  }
  return due.length;
}

export const canSeeCosts = (u: Pick<CurrentUser, "permissions">) => u.permissions.includes("pricing:costs");
