import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { ContractProposalForm, type ContractProposalDraft } from "../forms";

export const metadata = { title: "Nova proposta" };

const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const br = (v: { toString(): string }) => Number(v.toString()).toLocaleString("pt-BR", { maximumFractionDigits: 2, useGrouping: false });

export default async function NewContractProposal({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ de?: string }> }) {
  await requirePermission("contracts:write");
  const { id } = await params;
  const { de } = await searchParams;
  const c = await db.contract.findUnique({ where: { id }, include: { client: { select: { tradeName: true, legalName: true } } } });
  if (!c) notFound();
  const contacts = await db.contact.findMany({ where: { clientId: c.clientId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  // "Nova versão": o usuário escolheu copiar uma proposta existente deste contrato.
  const base = de ? await db.commercialProposal.findFirst({ where: { id: de, contractId: id }, include: { items: { orderBy: { order: "asc" } } } }) : null;
  const draft: ContractProposalDraft | undefined = base ? {
    title: base.title, object: base.object, scope: txt(base.scope), contactId: base.contactId, validUntil: null, deadline: txt(base.deadline),
    paymentTerms: txt(base.paymentTerms), conditions: txt(base.conditions), assumptions: txt(base.assumptions), exclusions: txt(base.exclusions),
    responsibilities: txt(base.responsibilities), notes: "", discount: Number(base.discountAmount) ? br(base.discountAmount) : "",
    items: base.items.map((i) => ({ title: i.title, description: txt(i.description), quantity: br(i.quantity), unit: i.unit, unitPrice: br(i.unitPrice) })),
  } : undefined;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ href: `/contratos/${id}`, label: `Contrato ${c.number}` }}
        title={base ? `Nova versão da proposta ${base.number}` : "Nova proposta"}
        subtitle={`${c.client.tradeName ?? c.client.legalName} · contrato ${c.number}`}
      />
      {base && <p className="mb-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">Conteúdo copiado da versão {base.version} ({base.number}). Ao gerar, a versão anterior fica como “substituída”, mas continua no histórico.</p>}
      <ContractProposalForm contractId={id} contacts={contacts.map((x) => ({ value: x.id, label: x.name }))} draft={draft} replacesId={base?.id} />
    </div>
  );
}
