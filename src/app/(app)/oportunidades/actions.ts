"use server";

import { z } from "zod";
import { OpportunityStage } from "@prisma/client";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { enumVals, formObject, keysOf, optDate, optEnum, optId, optInt, optNum, optStr, reqDate, reqEnum, reqStr, runAction, finish, UserError } from "@/lib/actions";
import { OPPORTUNITY_ACTIVITY_TYPES, OPPORTUNITY_SOURCES, SERVICES, STAGE_DEFAULT_PROBABILITY, labelOf } from "@/lib/catalogs";
import { hasPermission } from "@/lib/auth/permissions";
import type { ActionState } from "@/lib/action-state";

const schema = z.object({
  clientId: reqStr("Cliente", 40),
  description: reqStr("Descrição", 300),
  service: optEnum(keysOf(SERVICES)),
  estimatedValue: optNum({ min: 0 }),
  stage: reqEnum(enumVals(OpportunityStage), "Estágio"),
  probability: optInt({ min: 0, max: 100 }),
  ownerId: optId(),
  expectedDate: optDate(),
  source: optEnum(keysOf(OPPORTUNITY_SOURCES)),
  notes: optStr(4000),
});

export async function saveOpportunity(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  let savedId = id;
  const res = await runAction(async () => {
    const user = await assertPermission("opportunities:write");
    const d = schema.parse(formObject(fd));
    const data = { ...d, probability: d.probability ?? STAGE_DEFAULT_PROBABILITY[d.stage] };
    const o = id ? await db.opportunity.update({ where: { id }, data }) : await db.opportunity.create({ data });
    savedId = o.id;
    await audit(user.id, id ? "UPDATE" : "CREATE", "Opportunity", o.id, o.description);
  });
  return finish(res, `/oportunidades/${savedId}`);
}

export async function moveOpportunity(id: string, stage: OpportunityStage): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("opportunities:write");
    if (!enumVals(OpportunityStage).includes(stage)) throw new Error("Estágio inválido");
    await db.opportunity.update({ where: { id }, data: { stage, probability: STAGE_DEFAULT_PROBABILITY[stage] } });
    await audit(user.id, "UPDATE", "Opportunity", id, `estágio → ${stage}`);
  });
}

export async function deleteOpportunity(id: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("opportunities:delete");
    await db.opportunity.delete({ where: { id } });
    await audit(user.id, "DELETE", "Opportunity", id);
  });
}

const activity = z.object({
  type: reqEnum(keysOf(OPPORTUNITY_ACTIVITY_TYPES) as [string, ...string[]], "Ação"),
  occurredAt: reqDate("Data e hora"),
  contactId: optId(),
  description: reqStr("Descrição", 4000),
});

/** Registra uma ação junto ao cliente no log da oportunidade. */
export async function addOpportunityActivity(opportunityId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("opportunities:write");
    const d = activity.parse(formObject(fd));
    const opp = await db.opportunity.findUniqueOrThrow({ where: { id: opportunityId }, select: { clientId: true } });
    if (d.contactId) {
      const c = await db.contact.findUnique({ where: { id: d.contactId }, select: { clientId: true } });
      if (c?.clientId !== opp.clientId) throw new UserError("O contato não pertence ao cliente da oportunidade.");
    }
    if (d.occurredAt.getTime() > Date.now() + 5 * 60_000) return { ok: false, message: "A data da ação não pode estar no futuro.", errors: { occurredAt: "Data futura." } };
    const a = await db.opportunityActivity.create({ data: { ...d, opportunityId, userId: user.id } });
    await audit(user.id, "CREATE", "OpportunityActivity", a.id, `${labelOf(OPPORTUNITY_ACTIVITY_TYPES, d.type)} — oportunidade ${opportunityId}`);
    return { ok: true, message: "Ação registrada." };
  });
}

/** Remove um registro do log (autor ou quem pode excluir oportunidades). Registros automáticos não são removidos. */
export async function deleteOpportunityActivity(id: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("opportunities:write");
    const a = await db.opportunityActivity.findUniqueOrThrow({ where: { id } });
    if (a.automatic) throw new UserError("Registros automáticos do sistema não podem ser excluídos.");
    if (a.userId !== user.id && !hasPermission(user.permissions, "opportunities:delete")) throw new UserError("Somente o autor pode excluir este registro.");
    await db.opportunityActivity.delete({ where: { id } });
    await audit(user.id, "DELETE", "OpportunityActivity", id, `${labelOf(OPPORTUNITY_ACTIVITY_TYPES, a.type)}: ${a.description.slice(0, 120)}`);
  });
}
