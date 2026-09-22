import "server-only";
import { db } from "./db";
import { PENDING_INTERVENTION } from "./tree-filters";

export async function dashboardData() {
  const now = new Date();
  const in30 = new Date(Date.now() + 30 * 86_400_000);
  const [
    clients, properties, trees, activeTrees, inspections, bySpecies, byCondition, byRisk, byStatus,
    pendingInterventions, openWorkOrders, overdue, next30, priorityInterventions, upcoming, lateWorkOrders, expiringContracts,
  ] = await Promise.all([
    db.client.count({ where: { status: { not: "INATIVO" } } }),
    db.property.count({ where: { active: true } }),
    db.tree.count(),
    db.tree.count({ where: { status: "ATIVA" } }),
    db.inspection.count(),
    db.tree.groupBy({ by: ["speciesId"], _count: true, orderBy: { _count: { speciesId: "desc" } }, take: 10 }),
    db.tree.groupBy({ by: ["currentCondition"], _count: true, where: { status: "ATIVA" } }),
    db.tree.groupBy({ by: ["currentRisk"], _count: true, where: { status: "ATIVA" } }),
    db.tree.groupBy({ by: ["status"], _count: true }),
    db.intervention.count({ where: { status: { in: [...PENDING_INTERVENTION] } } }),
    db.workOrder.count({ where: { status: { in: ["ABERTA", "PROGRAMADA", "EM_EXECUCAO"] } } }),
    db.tree.count({ where: { status: "ATIVA", nextInspectionAt: { lt: now } } }),
    db.tree.count({ where: { status: "ATIVA", nextInspectionAt: { gte: now, lte: in30 } } }),
    db.intervention.findMany({
      where: { status: { in: [...PENDING_INTERVENTION] }, priority: { in: ["URGENTE", "ALTA"] } },
      orderBy: [{ priority: "desc" }, { recommendedAt: "asc" }],
      take: 8,
      include: { tree: { select: { code: true, species: { select: { popularName: true } }, property: { select: { name: true } } } } },
    }),
    db.tree.findMany({
      where: { status: "ATIVA", nextInspectionAt: { lte: in30 } },
      orderBy: { nextInspectionAt: "asc" },
      take: 8,
      select: { code: true, nextInspectionAt: true, currentCondition: true, species: { select: { popularName: true } }, property: { select: { name: true } } },
    }),
    db.workOrder.count({ where: { status: { in: ["ABERTA", "PROGRAMADA", "EM_EXECUCAO"] }, scheduledAt: { lt: now } } }),
    db.contract.count({ where: { status: "ATIVO", endDate: { gte: now, lte: new Date(Date.now() + 60 * 86_400_000) } } }),
  ]);
  const speciesNames = await db.species.findMany({
    where: { id: { in: bySpecies.map((s) => s.speciesId).filter(Boolean) as string[] } },
    select: { id: true, popularName: true },
  });
  const nameOf = new Map(speciesNames.map((s) => [s.id, s.popularName]));
  return {
    counts: { clients, properties, trees, activeTrees, inspections, pendingInterventions, openWorkOrders, overdue, next30, lateWorkOrders, expiringContracts },
    bySpecies: bySpecies.map((s) => ({ key: s.speciesId, label: s.speciesId ? nameOf.get(s.speciesId) ?? "—" : "Não identificada", value: s._count })),
    byCondition: byCondition.map((c) => ({ key: c.currentCondition, value: c._count })),
    byRisk: byRisk.map((r) => ({ key: r.currentRisk, value: r._count })),
    byStatus: byStatus.map((s) => ({ key: s.status, value: s._count })),
    priorityInterventions,
    upcoming,
  };
}
