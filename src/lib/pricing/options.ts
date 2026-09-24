import "server-only";
import { db } from "@/lib/db";
import { CONTACT_TYPE, OPPORTUNITY_STAGE } from "@/lib/catalogs";

/** Listas vinculadas ao cliente para o formulário de orçamento. */
export async function estimateFormOptions() {
  const [properties, contacts, opportunities] = await Promise.all([
    db.property.findMany({ select: { id: true, name: true, clientId: true }, orderBy: { name: "asc" } }),
    db.contact.findMany({ select: { id: true, name: true, clientId: true, type: true, isPrimary: true }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }] }),
    db.opportunity.findMany({ where: { stage: { notIn: ["PERDIDA"] } }, select: { id: true, description: true, clientId: true, stage: true }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    properties: properties.map((p) => ({ value: p.id, label: p.name, clientId: p.clientId })),
    contacts: contacts.map((c) => ({ value: c.id, label: `${c.name} (${CONTACT_TYPE[c.type]}${c.isPrimary ? ", principal" : ""})`, clientId: c.clientId })),
    opportunities: opportunities.map((o) => ({ value: o.id, label: `${o.description} — ${OPPORTUNITY_STAGE[o.stage]}`, clientId: o.clientId })),
  };
}
