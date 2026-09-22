import "server-only";
import { db } from "./db";
import type { Option } from "./catalogs";

// Listas para selects de formulários e filtros.
export async function clientOptions(): Promise<Option[]> {
  const rows = await db.client.findMany({ select: { id: true, legalName: true, tradeName: true }, orderBy: { legalName: "asc" } });
  return rows.map((r) => ({ value: r.id, label: r.tradeName ?? r.legalName }));
}

export async function propertyOptions(clientId?: string): Promise<(Option & { clientId: string })[]> {
  const rows = await db.property.findMany({
    where: clientId ? { clientId } : undefined,
    select: { id: true, name: true, clientId: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ value: r.id, label: r.name, clientId: r.clientId }));
}

export async function sectorOptions(propertyId?: string): Promise<(Option & { propertyId: string })[]> {
  const rows = await db.sector.findMany({
    where: propertyId ? { propertyId } : undefined,
    select: { id: true, name: true, propertyId: true, property: { select: { name: true } } },
    orderBy: [{ property: { name: "asc" } }, { name: "asc" }],
  });
  return rows.map((r) => ({ value: r.id, label: propertyId ? r.name : `${r.property.name} › ${r.name}`, propertyId: r.propertyId }));
}

export async function userOptions(): Promise<Option[]> {
  const rows = await db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

export async function teamOptions(): Promise<Option[]> {
  const rows = await db.team.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

export async function speciesOptions(): Promise<Option[]> {
  const rows = await db.species.findMany({ select: { id: true, popularName: true, scientificName: true }, orderBy: { popularName: "asc" } });
  return rows.map((r) => ({ value: r.id, label: `${r.popularName} — ${r.scientificName}` }));
}

export type TreeOption = { id: string; code: string; label: string; propertyId: string; clientId: string };

/** Lista compacta de árvores para seletores (datalist). */
export async function treeOptions(where: { propertyId?: string } = {}): Promise<TreeOption[]> {
  const rows = await db.tree.findMany({
    where,
    take: 5000,
    orderBy: { code: "asc" },
    select: { id: true, code: true, propertyId: true, species: { select: { popularName: true } }, property: { select: { name: true, clientId: true } } },
  });
  return rows.map((t) => ({
    id: t.id, code: t.code, propertyId: t.propertyId, clientId: t.property.clientId,
    label: `${t.code} — ${t.species?.popularName ?? "não identificada"} — ${t.property.name}`,
  }));
}

export async function openWorkOrderOptions(): Promise<Option[]> {
  const rows = await db.workOrder.findMany({
    where: { status: { in: ["ABERTA", "PROGRAMADA", "EM_EXECUCAO"] } },
    select: { id: true, number: true, service: true, client: { select: { tradeName: true, legalName: true } } },
    orderBy: { number: "desc" },
  });
  return rows.map((w) => ({ value: w.id, label: `${w.number} — ${w.client.tradeName ?? w.client.legalName}` }));
}
