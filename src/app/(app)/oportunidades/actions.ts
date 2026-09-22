"use server";

import { z } from "zod";
import { OpportunityStage } from "@prisma/client";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { enumVals, formObject, keysOf, optDate, optEnum, optId, optInt, optNum, optStr, reqEnum, reqStr, runAction, finish } from "@/lib/actions";
import { OPPORTUNITY_SOURCES, SERVICES, STAGE_DEFAULT_PROBABILITY } from "@/lib/catalogs";
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
  const res = await runAction(async () => {
    const user = await assertPermission("opportunities:write");
    const d = schema.parse(formObject(fd));
    const data = { ...d, probability: d.probability ?? STAGE_DEFAULT_PROBABILITY[d.stage] };
    const o = id ? await db.opportunity.update({ where: { id }, data }) : await db.opportunity.create({ data });
    await audit(user.id, id ? "UPDATE" : "CREATE", "Opportunity", o.id, o.description);
  });
  return finish(res, "/oportunidades");
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
