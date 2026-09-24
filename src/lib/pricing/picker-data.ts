import "server-only";
import { db } from "@/lib/db";
import { CONDITION, INTERVENTION_TYPES, RISK_LEVEL, labelOf } from "@/lib/catalogs";
import type { PickerTree } from "@/components/pricing/tree-picker";
import { SERVICE_CODES } from "./registry";
import type { ServiceCode } from "./types";

/** Árvores ativas da propriedade (ou do cliente) para seleção no item do orçamento. */
export async function pickerTrees(where: { propertyId?: string | null; clientId: string }): Promise<PickerTree[]> {
  const rows = await db.tree.findMany({
    where: { status: "ATIVA", ...(where.propertyId ? { propertyId: where.propertyId } : { property: { clientId: where.clientId } }) },
    orderBy: { code: "asc" },
    take: 20_000,
    select: {
      id: true, code: true, currentHeight: true, currentCondition: true, currentRisk: true, sectorId: true,
      species: { select: { popularName: true } }, sector: { select: { name: true } },
      interventions: { where: { status: "RECOMENDADA" }, select: { type: true } },
    },
  });
  return rows.map((t) => ({
    id: t.id, code: t.code, species: t.species?.popularName ?? null, sectorId: t.sectorId, sector: t.sector?.name ?? null,
    height: t.currentHeight, condition: t.currentCondition, conditionLabel: t.currentCondition ? CONDITION[t.currentCondition] : null,
    risk: t.currentRisk, riskLabel: t.currentRisk ? RISK_LEVEL[t.currentRisk] : null,
    recommended: [...new Set(t.interventions.map((i) => i.type))].map((type) => ({ type, label: labelOf(INTERVENTION_TYPES, type) })),
  }));
}

/** Serviços ativos no catálogo (PricingService) e implementados no motor. */
export async function activeServices(): Promise<ServiceCode[]> {
  const rows = await db.pricingService.findMany({ where: { active: true }, orderBy: { order: "asc" }, select: { code: true } });
  const codes = rows.map((r) => r.code).filter((c): c is ServiceCode => (SERVICE_CODES as string[]).includes(c));
  return codes.length ? codes : SERVICE_CODES;
}
