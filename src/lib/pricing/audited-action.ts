import "server-only";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { runAction } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";
import { pricingAudit } from "./server";

/**
 * Executa uma ação da Precificação e registra também as tentativas recusadas (validação, regra de negócio
 * ou permissão). As ações concluídas registram seus próprios detalhes (valor anterior → novo, justificativa).
 */
export async function auditedRun(action: string, estimateId: string | null, fn: () => Promise<ActionState | void>): Promise<ActionState> {
  const res = await runAction(fn);
  if (res && !res.ok) {
    try {
      const user = await getCurrentUser();
      const exists = estimateId ? await db.pricingEstimate.findUnique({ where: { id: estimateId }, select: { id: true } }) : null;
      const detail = [res.message, ...Object.values(res.errors ?? {})].filter(Boolean).join(" — ");
      await pricingAudit(db, user?.id ?? null, "TENTATIVA_RECUSADA", "Precificacao", estimateId, {
        estimateId: exists ? estimateId : null, field: action, justification: detail.slice(0, 1000),
      });
    } catch (e) {
      console.error("[pricing-audit] falha ao registrar tentativa recusada", e);
    }
  }
  return res;
}
