"use server";

import { z } from "zod";
import { Priority, WorkOrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { nextWorkOrderNumber } from "@/lib/counters";
import { enumVals, fieldError, formObject, keysOf, optDate, optEnum, optId, optNum, optStr, reqEnum, reqStr, runAction, UserError, finish } from "@/lib/actions";
import { INTERVENTION_TYPES, SERVICES, WORK_ORDER_ORIGIN } from "@/lib/catalogs";
import type { ActionState } from "@/lib/action-state";

const schema = z.object({
  clientId: reqStr("Cliente", 40),
  origin: reqEnum(keysOf(WORK_ORDER_ORIGIN), "Origem (proposta ou serviço avulso)"),
  proposalId: optId(),
  propertyId: optId(),
  treeIds: z.array(z.string().max(40)).max(1000),
  service: reqEnum(keysOf(SERVICES), "Serviço"),
  description: optStr(4000),
  priority: reqEnum(enumVals(Priority), "Prioridade"),
  scheduledAt: optDate(),
  executedAt: optDate(),
  teamId: optId(),
  responsibleId: optId(),
  status: reqEnum(enumVals(WorkOrderStatus), "Status"),
  cost: optNum({ min: 0 }),
  notes: optStr(4000),
  interventionType: optEnum(keysOf(INTERVENTION_TYPES)),
});

export async function saveWorkOrder(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  let savedId = id;
  const res = await runAction(async () => {
    const user = await assertPermission("workorders:write");
    const { treeIds, interventionType, ...d } = schema.parse(formObject(fd, ["treeIds"]));
    if (d.propertyId) {
      const p = await db.property.findUnique({ where: { id: d.propertyId } });
      if (p?.clientId !== d.clientId) return fieldError("propertyId", "A propriedade não pertence ao cliente.");
    }
    if (d.origin === "PROPOSTA") {
      if (!d.proposalId) return fieldError("proposalId", "Selecione a proposta.");
      const prop = await db.commercialProposal.findUnique({ where: { id: d.proposalId }, select: { clientId: true, status: true } });
      if (!prop || prop.clientId !== d.clientId) return fieldError("proposalId", "A proposta não pertence ao cliente.");
      const prev = id ? await db.workOrder.findUnique({ where: { id }, select: { proposalId: true } }) : null;
      if (!["EMITIDA", "ENVIADA", "ACEITA"].includes(prop.status) && prev?.proposalId !== d.proposalId)
        return fieldError("proposalId", "A proposta está cancelada, recusada ou substituída.");
    } else d.proposalId = null;
    // Garante que as árvores pertencem ao cliente (e à propriedade, se informada).
    const trees = treeIds.length
      ? await db.tree.findMany({ where: { id: { in: treeIds }, property: { clientId: d.clientId }, ...(d.propertyId && { propertyId: d.propertyId }) }, select: { id: true } })
      : [];
    if (trees.length !== treeIds.length) throw new UserError("Há árvores selecionadas que não pertencem ao cliente/propriedade.");
    if (d.status === "CONCLUIDA" && !d.executedAt) d.executedAt = new Date();
    if (d.status === "PROGRAMADA" && !d.scheduledAt) return fieldError("scheduledAt", "Informe a data prevista.");

    const wo = await db.$transaction(async (tx) => {
      const w = id
        ? await tx.workOrder.update({ where: { id }, data: { ...d, trees: { set: trees } } })
        : await tx.workOrder.create({ data: { ...d, number: await nextWorkOrderNumber(), trees: { connect: trees } } });
      if (!id && interventionType) {
        await tx.intervention.createMany({
          data: trees.map((t) => ({
            treeId: t.id, workOrderId: w.id, type: interventionType, priority: d.priority, scheduledAt: d.scheduledAt,
            teamId: d.teamId, responsibleId: d.responsibleId, status: d.scheduledAt ? "PROGRAMADA" : "RECOMENDADA", recommendedAt: new Date(),
            description: `Gerada pela OS ${w.number}`,
          })),
        });
      }
      return w;
    });
    savedId = wo.id;
    await audit(user.id, id ? "UPDATE" : "CREATE", "WorkOrder", wo.id, wo.number);
  });
  return finish(res, `/ordens-servico/${savedId}`);
}

export async function setWorkOrderStatus(id: string, status: WorkOrderStatus): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("workorders:write");
    if (!enumVals(WorkOrderStatus).includes(status)) throw new UserError("Status inválido.");
    const wo = await db.workOrder.findUniqueOrThrow({ where: { id } });
    await db.$transaction(async (tx) => {
      await tx.workOrder.update({
        where: { id },
        data: { status, ...(status === "CONCLUIDA" && !wo.executedAt && { executedAt: new Date() }), ...(status === "PROGRAMADA" && !wo.scheduledAt && { scheduledAt: new Date(Date.now() + 7 * 86_400_000) }) },
      });
      // Concluir/cancelar a OS propaga para as intervenções vinculadas ainda abertas.
      if (status === "CONCLUIDA" || status === "CANCELADA" || status === "EM_EXECUCAO") {
        await tx.intervention.updateMany({
          where: { workOrderId: id, status: { in: ["RECOMENDADA", "PROGRAMADA", ...(status === "EM_EXECUCAO" ? [] : ["EM_EXECUCAO" as const])] } },
          data: { status, ...(status === "CONCLUIDA" && { executedAt: new Date() }) },
        });
      }
    });
    await audit(user.id, "UPDATE", "WorkOrder", id, `status → ${status}`);
  });
}

export async function deleteWorkOrder(id: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("workorders:delete");
    const w = await db.workOrder.delete({ where: { id } });
    await audit(user.id, "DELETE", "WorkOrder", id, w.number);
  });
}
