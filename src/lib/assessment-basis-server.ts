import "server-only";
import { db } from "./db";
import { planInterventions } from "./assessment-basis";

export type BasisTarget = "opportunity" | "estimate";

const inspSelect = {
  id: true, treeId: true, inspectedAt: true, generalCondition: true, phytoCondition: true, phytoSeverity: true, priority: true, recommendation: true,
  tree: { select: { id: true, code: true, status: true, species: { select: { popularName: true } }, property: { select: { name: true } } } },
} as const;
const riskSelect = {
  id: true, treeId: true, assessedAt: true, riskRating: true, recommendedAction: true,
  tree: { select: { id: true, code: true, status: true, species: { select: { popularName: true } }, property: { select: { name: true } } } },
} as const;

/** Inspeções e avaliações de risco vinculadas + plano de intervenções derivado. */
export async function loadBasis(target: BasisTarget, id: string) {
  const where = target === "opportunity" ? { opportunities: { some: { id } } } : { pricingEstimates: { some: { id } } };
  const [inspections, risks] = await Promise.all([
    db.inspection.findMany({ where, select: inspSelect, orderBy: { inspectedAt: "desc" } }),
    db.riskAssessment.findMany({ where, select: riskSelect, orderBy: { assessedAt: "desc" } }),
  ]);
  const trees = new Map<string, { id: string; code: string; label: string; status: string }>();
  for (const x of [...inspections, ...risks])
    trees.set(x.tree.id, { id: x.tree.id, code: x.tree.code, status: x.tree.status, label: `${x.tree.code}${x.tree.species ? ` · ${x.tree.species.popularName}` : ""} · ${x.tree.property.name}` });
  const plan = planInterventions(
    [...trees.values()],
    inspections.map((i) => ({ ...i, date: i.inspectedAt })),
    risks.map((r) => ({ ...r, date: r.assessedAt })),
  );
  return { inspections, risks, plan };
}

/** Registros do cliente (e da propriedade, se houver) ainda não vinculados, para o seletor. */
export async function availableBasis(target: BasisTarget, id: string, clientId: string, propertyId?: string | null) {
  const treeWhere = { property: { clientId, ...(propertyId && { id: propertyId }) } };
  const notLinked = target === "opportunity" ? { opportunities: { none: { id } } } : { pricingEstimates: { none: { id } } };
  const [inspections, risks] = await Promise.all([
    db.inspection.findMany({ where: { tree: treeWhere, ...notLinked }, select: inspSelect, orderBy: { inspectedAt: "desc" }, take: 300 }),
    db.riskAssessment.findMany({ where: { tree: treeWhere, ...notLinked }, select: riskSelect, orderBy: { assessedAt: "desc" }, take: 300 }),
  ]);
  return { inspections, risks };
}
