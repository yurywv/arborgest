import { notFound } from "next/navigation";
import { FileDown, CopyPlus, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { mailConfigured } from "@/lib/mail";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { fmtBRL } from "@/lib/pricing/decimal";
import { PROPOSAL_STATUS, PROPOSAL_STATUS_TONE } from "@/lib/pricing/labels";
import { Badge, Card, DataList, LinkButton, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { DocumentList } from "@/components/files/panels";
import { DocumentUploader } from "@/components/files/uploaders";
import { DecideContractProposalForm, SendContractProposalForm } from "../forms";
import { deleteContractProposal } from "../actions";

export const metadata = { title: "Proposta" };

export default async function ContractProposalPage({ params }: { params: Promise<{ id: string; pid: string }> }) {
  const user = await requirePermission("contracts:read");
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(user.permissions, p);
  const { id, pid } = await params;
  const p = await db.commercialProposal.findFirst({
    where: { id: pid, contractId: id },
    include: {
      items: { orderBy: { order: "asc" } }, contact: true, createdBy: { select: { name: true } }, contract: { select: { number: true, clientId: true } },
      documents: { orderBy: { createdAt: "desc" }, include: { uploadedBy: { select: { name: true } }, proposal: { select: { number: true } } } },
    },
  });
  if (!p || !p.contract) notFound();
  const open = ["EMITIDA", "ENVIADA"].includes(p.status);
  const canWrite = can("contracts:write");
  const pdf = `/api/propostas/${p.id}/pdf`;
  return (
    <>
      <PageHeader
        back={{ href: `/contratos/${id}`, label: `Contrato ${p.contract.number}` }}
        title={`Proposta ${p.number}`}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Badge tone={PROPOSAL_STATUS_TONE[p.status]}>{PROPOSAL_STATUS[p.status]}</Badge><span>versão {p.version}</span></span>}
        actions={
          <>
            <a href={pdf} target="_blank" rel="noopener noreferrer" className="btn btn-primary"><FileDown className="size-4" /> PDF</a>
            {canWrite && <LinkButton href={`/contratos/${id}/propostas/nova?de=${p.id}`} icon={CopyPlus}>Nova versão</LinkButton>}
            {canWrite && !p.sentAt && !["ENVIADA", "ACEITA"].includes(p.status) && (
              <ActionButton action={deleteContractProposal.bind(null, id, p.id)} confirm={`Excluir a proposta ${p.number}?`} variant="danger-ghost" redirectTo={`/contratos/${id}`}>
                <Trash2 className="size-4" /> Excluir
              </ActionButton>
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title={p.title}>
            <DataList items={[
              ["Data", fmtDate(p.date)],
              ["Válida até", fmtDate(p.validUntil)],
              ["Aos cuidados de", p.contact?.name],
              ["Emitida por", p.createdBy?.name],
              ["Enviada", p.sentAt ? `${fmtDateTime(p.sentAt)}${p.sentTo ? ` · ${p.sentTo}` : ""}` : null],
              ["Aceite", p.acceptedAt ? `${fmtDateTime(p.acceptedAt)} · ${p.acceptedBy ?? ""}` : null],
            ]} />
            <div className="mt-4 space-y-3 text-sm">
              <div><p className="text-xs font-medium text-stone-500">Objeto</p><p className="whitespace-pre-line">{p.object}</p></div>
              {p.scope && <div><p className="text-xs font-medium text-stone-500">Escopo</p><p className="whitespace-pre-line">{p.scope}</p></div>}
            </div>
          </Card>
          <Card title="Serviços e valores">
            <ul className="divide-y divide-stone-100 text-sm">
              {p.items.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0"><p className="font-medium">{i.title}</p>{i.description && <p className="whitespace-pre-line text-xs text-stone-500">{i.description}</p>}
                    <p className="text-xs text-stone-500">{Number(i.quantity).toLocaleString("pt-BR")} {i.unit} × {fmtBRL(i.unitPrice.toString())}</p></div>
                  <span className="shrink-0 font-semibold tabular-nums">{fmtBRL(i.total.toString())}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-1 border-t border-stone-100 pt-3 text-sm">
              {Number(p.discountAmount) > 0 && <><p className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{fmtBRL(p.subtotal.toString())}</span></p>
                <p className="flex justify-between"><span>Desconto</span><span className="tabular-nums">- {fmtBRL(p.discountAmount.toString())}</span></p></>}
              <p className="flex justify-between text-base font-semibold"><span>Total</span><span className="tabular-nums">{fmtBRL(p.total.toString())}</span></p>
            </div>
          </Card>
          {[["Prazo de execução", p.deadline], ["Forma de pagamento", p.paymentTerms], ["Condições comerciais", p.conditions], ["Premissas", p.assumptions],
            ["Exclusões", p.exclusions], ["Responsabilidades", p.responsibilities], ["Observações", p.notes]].some(([, v]) => v) && (
            <Card title="Condições">
              <div className="space-y-3 text-sm">
                {([["Prazo de execução", p.deadline], ["Forma de pagamento", p.paymentTerms], ["Condições comerciais", p.conditions], ["Premissas", p.assumptions],
                  ["Exclusões", p.exclusions], ["Responsabilidades", p.responsibilities], ["Observações", p.notes]] as const).filter(([, v]) => v).map(([k, v]) => (
                  <div key={k}><p className="text-xs font-medium text-stone-500">{k}</p><p className="whitespace-pre-line">{v}</p></div>
                ))}
              </div>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          {canWrite && open && <Card title="Enviar ao cliente"><SendContractProposalForm contractId={id} proposalId={p.id} smtp={await mailConfigured()} /></Card>}
          {canWrite && open && <Card title="Resultado"><DecideContractProposalForm contractId={id} proposalId={p.id} /></Card>}
          <Card title="Documentos da proposta">
            {can("files:write") && <div className="mb-3"><DocumentUploader refs={{ contractId: id, clientId: p.contract.clientId, proposalId: p.id }} /></div>}
            <DocumentList docs={p.documents} canDelete={can("files:delete")} />
          </Card>
        </div>
      </div>
    </>
  );
}
