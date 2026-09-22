"use server";

import { z } from "zod";
import { InterventionStatus, Priority } from "@prisma/client";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { resolveTreeCode } from "@/lib/trees";
import { enumVals, fieldError, formObject, keysOf, optDate, optId, optNum, optStr, reqEnum, runAction, UserError, finish } from "@/lib/actions";
import { INTERVENTION_TYPES } from "@/lib/catalogs";
import type { ActionState } from "@/lib/action-state";

const schema = z.object({
  type: reqEnum(keysOf(INTERVENTION_TYPES), "Tipo"),
  description: optStr(4000),
  recommendedAt: optDate(),
  priority: reqEnum(enumVals(Priority), "Prioridade"),
  scheduledAt: optDate(),
  executedAt: optDate(),
  responsibleId: optId(),
  teamId: optId(),
  workOrderId: optId(),
  status: reqEnum(enumVals(InterventionStatus), "Status"),
  estimatedCost: optNum({ min: 0 }),
  actualCost: optNum({ min: 0 }),
  notes: optStr(4000),
});

export async function saveIntervention(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  let savedId = id;
  const res = await runAction(async () => {
    const user = await assertPermission("interventions:write");
    const tree = id ? await db.intervention.findUniqueOrThrow({ where: { id } }).then((i) => ({ id: i.treeId })) : await resolveTreeCode(fd.get("treeCode"));
    if (!tree) return fieldError("treeCode", "Árvore não encontrada.");
    const d = schema.parse(formObject(fd));
    if (d.status === "CONCLUIDA" && !d.executedAt) d.executedAt = new Date();
    if (d.status === "PROGRAMADA" && !d.scheduledAt) return fieldError("scheduledAt", "Informe a data programada.");
    const i = id ? await db.intervention.update({ where: { id }, data: d }) : await db.intervention.create({ data: { ...d, treeId: tree.id, recommendedAt: d.recommendedAt ?? new Date() } });
    savedId = i.id;
    await audit(user.id, id ? "UPDATE" : "CREATE", "Intervention", i.id, `${i.type} ${i.status}`);
  });
  return finish(res, `/intervencoes/${savedId}`);
}

/** Transições rápidas de status (botões na ficha, uso em campo). */
export async function setInterventionStatus(id: string, status: InterventionStatus): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("interventions:write");
    if (!enumVals(InterventionStatus).includes(status)) throw new UserError("Status inválido.");
    const cur = await db.intervention.findUniqueOrThrow({ where: { id } });
    await db.intervention.update({
      where: { id },
      data: {
        status,
        ...(status === "CONCLUIDA" && !cur.executedAt && { executedAt: new Date() }),
        ...(status === "PROGRAMADA" && !cur.scheduledAt && { scheduledAt: new Date(Date.now() + 7 * 86_400_000) }),
      },
    });
    await audit(user.id, "UPDATE", "Intervention", id, `status → ${status}`);
  });
}

export async function deleteIntervention(id: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("interventions:delete");
    await db.intervention.delete({ where: { id } });
    await audit(user.id, "DELETE", "Intervention", id);
  });
}
