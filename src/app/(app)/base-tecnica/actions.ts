"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { formObject, runAction, UserError } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";
import { pricingAudit } from "@/lib/pricing/server";
import type { BasisTarget } from "@/lib/assessment-basis-server";

const ids = z.array(z.string().max(40)).max(500);

async function scopeOf(target: BasisTarget, id: string) {
  if (target === "opportunity") {
    const user = await assertPermission("opportunities:write");
    const o = await db.opportunity.findUniqueOrThrow({ where: { id }, select: { clientId: true } });
    return { user, clientId: o.clientId, propertyId: null as string | null };
  }
  const user = await assertPermission("pricing:write");
  const e = await db.pricingEstimate.findUniqueOrThrow({ where: { id }, select: { clientId: true, propertyId: true } });
  return { user, clientId: e.clientId, propertyId: e.propertyId };
}

/** Vincula inspeções/avaliações de risco (várias) à oportunidade ou ao orçamento. */
export async function linkBasis(target: BasisTarget, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user, clientId, propertyId } = await scopeOf(target, id);
    const f = formObject(fd, ["inspectionIds", "riskIds"]);
    const inspectionIds = ids.parse(f.inspectionIds ?? []);
    const riskIds = ids.parse(f.riskIds ?? []);
    if (!inspectionIds.length && !riskIds.length) throw new UserError("Selecione ao menos uma inspeção ou avaliação de risco.");
    const treeWhere = { property: { clientId, ...(propertyId && { id: propertyId }) } };
    const [ni, nr] = await Promise.all([
      db.inspection.count({ where: { id: { in: inspectionIds }, tree: treeWhere } }),
      db.riskAssessment.count({ where: { id: { in: riskIds }, tree: treeWhere } }),
    ]);
    if (ni !== new Set(inspectionIds).size || nr !== new Set(riskIds).size)
      throw new UserError(propertyId ? "Há registros de árvores fora da propriedade do orçamento." : "Há registros de árvores de outro cliente.");
    const data = { inspections: { connect: inspectionIds.map((x) => ({ id: x })) }, riskAssessments: { connect: riskIds.map((x) => ({ id: x })) } };
    const summary = `${inspectionIds.length} inspeção(ões), ${riskIds.length} avaliação(ões) de risco`;
    if (target === "opportunity") {
      await db.opportunity.update({ where: { id }, data });
      await audit(user.id, "UPDATE", "Opportunity", id, `base técnica: + ${summary}`);
    } else {
      await db.$transaction(async (tx) => {
        await tx.pricingEstimate.update({ where: { id }, data });
        await pricingAudit(tx, user.id, "BASE_TECNICA", "PricingEstimate", id, { estimateId: id, field: "baseTecnica", newValue: `+ ${summary}` });
      });
    }
    return { ok: true, message: `Vinculado: ${summary}.` };
  });
}

export async function unlinkBasis(target: BasisTarget, id: string, kind: "inspection" | "risk", recordId: string): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await scopeOf(target, id);
    const rel = kind === "inspection" ? { inspections: { disconnect: { id: recordId } } } : { riskAssessments: { disconnect: { id: recordId } } };
    const what = kind === "inspection" ? "inspeção" : "avaliação de risco";
    if (target === "opportunity") {
      await db.opportunity.update({ where: { id }, data: rel });
      await audit(user.id, "UPDATE", "Opportunity", id, `base técnica: − ${what} ${recordId}`);
    } else {
      await db.$transaction(async (tx) => {
        await tx.pricingEstimate.update({ where: { id }, data: rel });
        await pricingAudit(tx, user.id, "BASE_TECNICA", "PricingEstimate", id, { estimateId: id, field: "baseTecnica", previousValue: `${what} ${recordId}`, newValue: "removida" });
      });
    }
  });
}
