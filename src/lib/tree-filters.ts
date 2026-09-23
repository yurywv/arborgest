import "server-only";
import type { Prisma } from "@prisma/client";
import { ci, spGet, type SP } from "./query";
import { clientOptions, propertyOptions, sectorOptions, speciesOptions } from "./options";

export const PENDING_INTERVENTION = ["RECOMENDADA", "PROGRAMADA", "EM_EXECUCAO"] as const;

/** Filtros compartilhados por lista de exemplares, mapa e relatórios. */
export function treeWhere(sp: SP): Prisma.TreeWhereInput {
  const q = spGet(sp, "q");
  const clientId = spGet(sp, "cliente");
  const propertyId = spGet(sp, "propriedade");
  const sectorId = spGet(sp, "setor");
  const speciesId = spGet(sp, "especie");
  const status = spGet(sp, "status");
  const condition = spGet(sp, "condicao");
  const risk = spGet(sp, "risco");
  const pending = spGet(sp, "pendente");
  const insp = spGet(sp, "inspecao");
  const now = new Date();
  const in30 = new Date(Date.now() + 30 * 86_400_000);

  const and: Prisma.TreeWhereInput[] = [];
  if (q) {
    and.push({
      OR: [
        { code: ci(q) },
        { address: ci(q) },
        { physicalRef: ci(q) },
        { species: { OR: [{ popularName: ci(q) }, { scientificName: ci(q) }] } },
        { property: { OR: [{ name: ci(q) }, { client: { OR: [{ legalName: ci(q) }, { tradeName: ci(q) }] } }] } },
      ],
    });
  }
  if (clientId) and.push({ property: { clientId } });
  if (propertyId) and.push({ propertyId });
  if (sectorId) and.push({ sectorId });
  if (speciesId) and.push({ speciesId });
  if (status) and.push({ status: status as never });
  if (condition) and.push(condition === "SEM" ? { currentCondition: null } : { currentCondition: condition as never });
  if (risk) and.push(risk === "SEM" ? { currentRisk: null } : { currentRisk: risk as never });
  if (pending === "sim") and.push({ interventions: { some: { status: { in: [...PENDING_INTERVENTION] } } } });
  if (insp === "vencida") and.push({ status: "ATIVA", nextInspectionAt: { lt: now } });
  if (insp === "30dias") and.push({ status: "ATIVA", nextInspectionAt: { gte: now, lte: in30 } });
  if (insp === "sem") and.push({ lastInspectionAt: null });
  return and.length ? { AND: and } : {};
}

export async function treeFilterOptions() {
  const [clients, properties, sectors, species] = await Promise.all([clientOptions(), propertyOptions(), sectorOptions(), speciesOptions({ usedOnly: true })]);
  return { clients, properties, sectors, species };
}
