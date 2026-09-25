import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, FilePlus2, History, Pencil, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { CONTRACT_STATUS, PERIODICITY, labelOf } from "@/lib/catalogs";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Badge, Card, DataList, LinkButton, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { DocumentList } from "@/components/files/panels";
import { DocumentUploader } from "@/components/files/uploaders";
import { fmtBRL } from "@/lib/pricing/decimal";
import { PROPOSAL_STATUS, PROPOSAL_STATUS_TONE } from "@/lib/pricing/labels";
import { deleteContract } from "../actions";

export const metadata = { title: "Contrato" };

export default async function ContractDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("contracts:read");
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(user.permissions, p);
  const { id } = await params;
  const c = await db.contract.findUnique({
    where: { id },
    include: { client: true, property: true, owner: true, pricingEstimate: { select: { id: true, number: true } }, documents: { orderBy: { createdAt: "desc" }, include: { uploadedBy: { select: { name: true } }, proposal: { select: { number: true } } } } },
  });
  if (!c) notFound();
  // Propostas emitidas no contrato + as do orçamento de origem (precificação).
  const proposals = await db.commercialProposal.findMany({
    where: { OR: [{ contractId: id }, ...(c.pricingEstimateId ? [{ estimateId: c.pricingEstimateId }] : [])] },
    orderBy: [{ date: "desc" }, { version: "desc" }],
    select: { id: true, number: true, version: true, title: true, status: true, date: true, total: true, contractId: true, estimateId: true, _count: { select: { documents: true } } },
  });
  const proposalHref = (p: (typeof proposals)[number]) => (p.contractId ? `/contratos/${id}/propostas/${p.id}` : `/precificacao/${p.estimateId}?aba=proposta&p=${p.id}`);
  return (
    <>
      <PageHeader
        back={{ href: "/contratos", label: "Contratos" }}
        title={`Contrato ${c.number}`}
        subtitle={<Badge tone={c.status === "ATIVO" ? "green" : "gray"}>{CONTRACT_STATUS[c.status]}</Badge>}
        actions={
          <>
            {can("contracts:write") && <LinkButton href={`/contratos/${id}/propostas/nova`} icon={FilePlus2} variant="primary">Nova proposta</LinkButton>}
            <LinkButton href={`/clientes/${c.clientId}?aba=historico`} icon={History}>Histórico do cliente</LinkButton>
            {can("contracts:write") && <LinkButton href={`/contratos/${id}/editar`} icon={Pencil}>Editar</LinkButton>}
            {can("contracts:delete") && (
              <ActionButton action={deleteContract.bind(null, id)} confirm="Excluir este contrato?" variant="danger-ghost" redirectTo="/contratos"><Trash2 className="size-4" /> Excluir</ActionButton>
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Dados do contrato" className="lg:col-span-2">
          <DataList items={[
            ["Cliente", <Link key="c" className="link" href={`/clientes/${c.clientId}`}>{c.client.tradeName ?? c.client.legalName}</Link>],
            ["Propriedade", c.property && <Link key="p" className="link" href={`/propriedades/${c.property.id}`}>{c.property.name}</Link>],
            ["Início", fmtDate(c.startDate)],
            ["Término", fmtDate(c.endDate)],
            ["Valor", fmtMoney(c.value)],
            ["Periodicidade", labelOf(PERIODICITY, c.periodicity)],
            ["Responsável", c.owner?.name],
            ["Cadastro", fmtDate(c.createdAt)],
            ...(c.pricingEstimate ? [["Orçamento de origem", <Link key="e" className="link" href={`/precificacao/${c.pricingEstimate.id}`}>{c.pricingEstimate.number}</Link>] as [string, React.ReactNode]] : []),
          ]} />
          <div className="mt-4 space-y-3 text-sm">
            <div><p className="text-xs font-medium text-stone-500">Objeto</p><p className="whitespace-pre-line">{c.object}</p></div>
            {c.notes && <div><p className="text-xs font-medium text-stone-500">Observações</p><p className="whitespace-pre-line">{c.notes}</p></div>}
          </div>
        </Card>
        <Card title="Propostas" className="lg:col-span-1">
          {proposals.length ? (
            <ul className="divide-y divide-stone-100" data-testid="contract-proposals">
              {proposals.map((p) => (
                <li key={p.id} className="flex items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link href={proposalHref(p)} className="link block truncate">{p.number}{p.version > 1 ? ` · v${p.version}` : ""}</Link>
                    <p className="truncate text-xs text-stone-500">{fmtDate(p.date)} · {fmtBRL(p.total.toString())}{p.estimateId ? " · da precificação" : ""}{p._count.documents ? ` · ${p._count.documents} doc.` : ""}</p>
                    <p className="truncate text-xs text-stone-600">{p.title}</p>
                  </div>
                  <Badge tone={PROPOSAL_STATUS_TONE[p.status]}>{PROPOSAL_STATUS[p.status]}</Badge>
                  <a href={`/api/propostas/${p.id}/pdf`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" aria-label={`PDF da proposta ${p.number}`}><FileDown className="size-4" /></a>
                </li>
              ))}
            </ul>
          ) : <p className="py-6 text-sm text-stone-500">Nenhuma proposta.{can("contracts:write") ? " Use “Nova proposta” para gerar o PDF para o cliente." : ""}</p>}
        </Card>
        <Card title="Documentos anexos" className="lg:col-span-3">
          {can("files:write") && <div className="mb-3"><DocumentUploader refs={{ contractId: id, clientId: c.clientId }} proposals={proposals.map((p) => ({ id: p.id, label: `${p.number}${p.version > 1 ? ` v${p.version}` : ""} — ${p.title}` }))} /></div>}
          <DocumentList docs={c.documents} canDelete={can("files:delete")} />
        </Card>
      </div>
    </>
  );
}
