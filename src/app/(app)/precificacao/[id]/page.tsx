import Link from "next/link";
import { notFound } from "next/navigation";
import { Copy, FileDown, FilePlus2, GitBranch, Plus, ScrollText, Send, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { clientOptions, userOptions } from "@/lib/options";
import { mailConfigured } from "@/lib/mail";
import { type DecimalT, dec, fmtBRL, fmtPct } from "@/lib/pricing/decimal";
import { APPROVAL_LABEL, COMMISSION_BASE_LABEL, grantableLevel, levelCovers, type ApprovalLevelCode, type CommissionBase } from "@/lib/pricing/policy";
import { APPROVAL_STATUS, AUDIT_ACTION, ESTIMATE_STATUS, ESTIMATE_STATUS_TONE, OVERRIDE_TYPE, PROPOSAL_STATUS } from "@/lib/pricing/labels";
import { SERVICES } from "@/lib/pricing/registry";
import { ENGINE_LABEL, type ServiceCode } from "@/lib/pricing/types";
import { EDITABLE_STATUSES, calcResultOf, expireEstimates, getActiveVersion, paramsOf } from "@/lib/pricing/server";
import { estimateFormOptions } from "@/lib/pricing/options";
import { ActionButton } from "@/components/form";
import { Badge, Card, DataList, EmptyState, LinkButton, PageHeader, TabLinks } from "@/components/ui";
import { createContractFromEstimate, deleteEstimate, deleteItem, duplicateEstimate, requestApproval } from "../actions";
import { AdjustItem, ApprovalDecision, CommissionForm, DiscountForm, EstimateMarginForm, RepriceButton, StatusButton, WorkOrderForm } from "./controls";
import { ProposalForm, SendProposalForm } from "./proposta/forms";
import { EstimateForm } from "../estimate-form";

export const metadata = { title: "Orçamento" };

export default async function EstimatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string; p?: string }> }) {
  const user = await requirePermission("pricing:read");
  const can = (p: Permission) => hasPermission(user.permissions, p);
  const costs = can("pricing:costs");
  const { id } = await params;
  const { aba = "resumo" } = await searchParams;
  await expireEstimates();
  const e = await db.pricingEstimate.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, legalName: true, tradeName: true } },
      contact: { select: { name: true, email: true } },
      property: { select: { id: true, name: true } },
      opportunity: { select: { id: true, description: true, stage: true } },
      commercialOwner: { select: { name: true } },
      technicalOwner: { select: { name: true } },
      createdBy: { select: { name: true } },
      parameterVersion: true,
      parent: { select: { id: true, number: true } },
      revisions: { select: { id: true, number: true } },
      items: { orderBy: { order: "asc" }, include: { currentCalculation: { select: { id: true, createdAt: true } }, _count: { select: { trees: true } } } },
      approvals: { orderBy: { requestedAt: "desc" }, include: { requestedBy: { select: { name: true } }, decidedBy: { select: { name: true } } } },
      proposals: { orderBy: { version: "desc" }, include: { contact: { select: { email: true } } } },
      contracts: { select: { id: true, number: true } },
      workOrders: { select: { id: true, number: true, status: true } },
    },
  });
  if (!e) notFound();
  const params_ = paramsOf(e.parameterVersion);
  const active = await getActiveVersion();
  const editable = (EDITABLE_STATUSES as readonly string[]).includes(e.status);
  const tax = dec(e.taxRate.toString());
  const revenue = dec(e.negotiatedTotal.toString());
  const cost = dec(e.operationalCostTotal.toString());
  const taxes = revenue.mul(tax);
  const result = revenue.minus(taxes).minus(cost);
  const commission = dec(e.commissionAmount.toString());
  const commissionLabel = e.commissionPercent && e.commissionBase
    ? `${fmtPct(e.commissionPercent.toString())} sobre ${COMMISSION_BASE_LABEL[e.commissionBase as CommissionBase].toLowerCase()}` : null;
  const pendingApproval = e.approvals.find((a) => a.status === "PENDENTE");
  const myLevel = grantableLevel(user.permissions);
  const bySvc = Object.entries(e.items.reduce<Record<string, { calc: DecimalT; neg: DecimalT; qty: number }>>((acc, i) => {
    const a = (acc[i.serviceCode] ??= { calc: dec(0), neg: dec(0), qty: 0 });
    a.calc = a.calc.plus(dec(i.calculatedPrice.toString())); a.neg = a.neg.plus(dec(i.negotiatedPrice.toString())); a.qty += i.quantity;
    return acc;
  }, {}));
  const svcName = (c: string) => SERVICES[c as ServiceCode]?.name ?? c;
  const flow = params_.approval.fluxoObrigatorio;
  const canProposal = e.items.length > 0 && (flow ? ["APROVADO_INTERNAMENTE", "ENVIADO_CLIENTE", "EM_NEGOCIACAO"] : ["EM_ELABORACAO", "APROVADO_INTERNAMENTE", "ENVIADO_CLIENTE", "EM_NEGOCIACAO"]).includes(e.status);
  const currentProposal = e.proposals.find((p) => ["EMITIDA", "ENVIADA", "ACEITA"].includes(p.status));
  const defaultMarginPct = dec(params_.general.margem).mul(100).toString().replace(".", ",");

  return (
    <>
      <PageHeader
        back={{ href: "/precificacao", label: "Precificação" }}
        title={<>Orçamento {e.number}</>}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={ESTIMATE_STATUS_TONE[e.status]}>{ESTIMATE_STATUS[e.status]}</Badge>
            <Link className="link" href={`/clientes/${e.client.id}`}>{e.client.tradeName ?? e.client.legalName}</Link>
            {e.property && <>· <Link className="link" href={`/propriedades/${e.property.id}`}>{e.property.name}</Link></>}
            <span>· parâmetros v{e.parameterVersion.label}</span>
          </span>
        }
        actions={<>
          {can("pricing:write") && editable && <LinkButton href={`/precificacao/${e.id}/item`} variant="primary" icon={Plus}>Adicionar serviço</LinkButton>}
          {can("pricing:write") && <ActionButton action={duplicateEstimate.bind(null, e.id, "copy")} confirm="Criar um novo orçamento com os mesmos itens (recalculados com os parâmetros vigentes)?"><Copy className="size-4" /> Duplicar</ActionButton>}
          {can("pricing:write") && e.status !== "ACEITO" && <ActionButton action={duplicateEstimate.bind(null, e.id, "revision")} confirm="Criar uma revisão deste orçamento? O atual será cancelado (substituído)."><GitBranch className="size-4" /> Revisão</ActionButton>}
          {can("pricing:write") && !e.contracts.length && !e.workOrders.length && !e.proposals.some((p) => ["ENVIADA", "ACEITA"].includes(p.status)) &&
            <ActionButton action={deleteEstimate.bind(null, e.id)} confirm="Excluir este orçamento? A exclusão fica registrada na auditoria." redirectTo="/precificacao" variant="danger-ghost"><Trash2 className="size-4" /> Excluir</ActionButton>}
        </>}
      />

      <TabLinks active={aba} baseHref={`/precificacao/${e.id}`} tabs={[
        { key: "resumo", label: "Resumo", count: e.items.length },
        { key: "proposta", label: "Proposta", count: e.proposals.length },
        { key: "historico", label: "Histórico" },
        ...(can("pricing:write") && editable ? [{ key: "dados", label: "Dados" }] : []),
      ]} />

      {aba === "resumo" && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            {["ACEITO", "RECUSADO", "CANCELADO", "EXPIRADO"].includes(e.status) && can("pricing:write") && (
              <div role="status" className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                Orçamento <b>{ESTIMATE_STATUS[e.status].toLowerCase()}</b>. Ele continua editável: ao incluir, alterar ou excluir itens e valores,
                volta para <b>Em elaboração</b> e a alteração fica registrada no histórico.
              </div>
            )}
            {e.parameterVersionId !== active.id && editable && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <span>Este orçamento foi calculado com os parâmetros v{e.parameterVersion.label}. A versão vigente é a v{active.label}. Os valores <b>não</b> mudam automaticamente.</span>
                {can("pricing:write") && <RepriceButton id={e.id} from={e.parameterVersion.label} to={active.label} />}
              </div>
            )}

            <Card title="Serviços" bodyClassName="p-0">
              {e.items.length === 0 ? (
                <div className="p-4"><EmptyState title="Nenhum serviço" description="Adicione os serviços do orçamento. Nos serviços por árvore é possível selecionar os exemplares da propriedade."
                  action={can("pricing:write") && editable && <LinkButton href={`/precificacao/${e.id}/item`} variant="primary" icon={Plus}>Adicionar serviço</LinkButton>} /></div>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {e.items.map((i) => {
                    const changed = !dec(i.calculatedPrice.toString()).eq(dec(i.negotiatedPrice.toString()));
                    return (
                      <li key={i.id} className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold">{svcName(i.serviceCode)} <span className="font-normal text-stone-500">· {i.quantity} {i.quantity === 1 ? SERVICES[i.serviceCode as ServiceCode]?.unit ?? "un" : SERVICES[i.serviceCode as ServiceCode]?.unitPlural ?? "un"}{i._count.trees ? " selecionadas" : ""}</span></div>
                            {i.description && <div className="text-sm text-stone-600">{i.description}</div>}
                            <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                              {costs && <Badge>Custo {fmtBRL(i.operationalCost.toString())}</Badge>}
                              {costs && <Badge tone={Number(i.effectiveMargin) >= Number(params_.approval.margemComercial) - 1e-4 ? "green" : Number(i.effectiveMargin) >= Number(params_.approval.margemGerencial) ? "yellow" : "red"}>Margem {fmtPct(i.effectiveMargin.toString())}</Badge>}
                              {i.marginOverride && <Badge tone="violet">Margem ajustada {fmtPct(i.marginOverride.toString())}</Badge>}
                              {costs && !i.marginOverride && !i.priceOverride && e.marginOverride && <Badge tone="violet">Margem do orçamento {fmtPct(e.marginOverride.toString())}</Badge>}
                              {Number(i.extraCost) > 0 && <Badge tone="violet">+ {fmtBRL(i.extraCost.toString())} custo</Badge>}
                              {i.priceOverride && <Badge tone="violet">Preço definido manualmente</Badge>}
                            </div>
                          </div>
                          <div className="text-right">
                            {changed && <div className="text-xs text-stone-400 line-through">{fmtBRL(i.calculatedPrice.toString())}</div>}
                            <div className="text-lg font-bold tabular-nums">{fmtBRL(i.negotiatedPrice.toString())}</div>
                            <div className="text-xs text-stone-500">{fmtBRL(dec(i.negotiatedPrice.toString()).div(i.quantity || 1).toString())}/{SERVICES[i.serviceCode as ServiceCode]?.unit ?? "un"}</div>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {can("pricing:write") && editable && <LinkButton size="sm" variant="ghost" href={`/precificacao/${e.id}/item?item=${i.id}`}>Editar</LinkButton>}
                          {can("pricing:negotiate") && editable && <AdjustItem estimateId={e.id} itemId={i.id} marginOverride={i.marginOverride?.toString() ?? null} extraCost={i.extraCost.toString()} priceOverride={i.priceOverride?.toString() ?? null} />}
                          {i.currentCalculation && (costs || can("pricing:write")) && <LinkButton size="sm" variant="ghost" icon={ScrollText} href={`/precificacao/calculos/${i.currentCalculation.id}`}>Memória de cálculo</LinkButton>}
                          {can("pricing:write") && editable && <ActionButton size="sm" variant="danger-ghost" action={deleteItem.bind(null, e.id, i.id)} confirm="Remover este item?">Remover</ActionButton>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {e.items.length > 0 && (
              <Card title="Totais">
                <table className="table">
                  <tbody>
                    {bySvc.map(([code, v]) => (
                      <tr key={code}><td>Subtotal {SERVICES[code as ServiceCode]?.shortName ?? code} <span className="text-xs text-stone-500">({v.qty} árv.)</span></td>
                        <td className="text-right tabular-nums">{fmtBRL(v.neg.toString())}</td></tr>
                    ))}
                    <tr><td className="text-stone-500">Preço calculado (motor)</td><td className="text-right text-stone-500 tabular-nums">{fmtBRL(e.calculatedTotal.toString())}</td></tr>
                    {Number(e.discountAmount) > 0 && <tr><td>Desconto {e.discountType === "PERCENT" ? `(${fmtPct(e.discountValue!.toString())})` : ""}</td><td className="text-right text-red-700 tabular-nums">− {fmtBRL(e.discountAmount.toString())}</td></tr>}
                    <tr className="text-base"><td className="font-bold">TOTAL DA PROPOSTA</td><td data-testid="total-proposta" className="text-right font-bold tabular-nums">{fmtBRL(e.negotiatedTotal.toString())}</td></tr>
                  </tbody>
                </table>
              </Card>
            )}

            {e.approvals.length > 0 && (
              <Card title="Aprovações internas">
                <ul className="space-y-3">
                  {e.approvals.map((a) => (
                    <li key={a.id} className="rounded-xl border border-stone-100 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>Alçada <b>{APPROVAL_LABEL[a.level as ApprovalLevelCode]}</b> · margem {fmtPct(a.marginAtRequest.toString())} · {fmtBRL(a.totalAtRequest.toString())}</span>
                        <Badge tone={a.status === "APROVADO" ? "green" : a.status === "PENDENTE" ? "yellow" : a.status === "REJEITADO" ? "red" : "gray"}>{APPROVAL_STATUS[a.status]}</Badge>
                      </div>
                      <div className="text-xs text-stone-500">Solicitado por {a.requestedBy?.name ?? "—"} em {fmtDateTime(a.requestedAt)}
                        {a.decidedAt && <> · decidido por {a.decidedBy?.name ?? "—"} em {fmtDateTime(a.decidedAt)}</>}</div>
                      {a.comment && <p className="mt-1 text-stone-700">“{a.comment}”</p>}
                      {a.status === "PENDENTE" && levelCovers(myLevel, a.level as ApprovalLevelCode) && <div className="mt-2"><ApprovalDecision approvalId={a.id} /></div>}
                      {a.status === "PENDENTE" && !levelCovers(myLevel, a.level as ApprovalLevelCode) && <p className="mt-1 text-xs text-stone-500">Aguardando usuário com alçada {APPROVAL_LABEL[a.level as ApprovalLevelCode].toLowerCase()}.</p>}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          <aside className="space-y-4">
            <Card title="Fluxo">
              <div className="space-y-2 text-sm">
                <p className="text-stone-600">
                  {e.requiredApproval ? <>Alçada exigida: <b>{APPROVAL_LABEL[e.requiredApproval as ApprovalLevelCode]}</b></> : "Adicione serviços para calcular a alçada."}
                  {e.approvedLevel && <> · aprovado ({APPROVAL_LABEL[e.approvedLevel as ApprovalLevelCode].toLowerCase()}) em {fmtDate(e.approvedAt)}</>}
                  {!flow && <><br /><span className="text-xs">Fluxo de aprovação opcional (desativado nos parâmetros).</span></>}
                </p>
                <div className="flex flex-wrap gap-2">
                  {can("pricing:write") && ["RASCUNHO", "EM_ELABORACAO", "EM_NEGOCIACAO"].includes(e.status) && e.items.length > 0 && !pendingApproval && (
                    <ActionButton action={requestApproval.bind(null, e.id)} variant="primary" size="sm">
                      {levelCovers(myLevel, (e.requiredApproval ?? "COMERCIAL") as ApprovalLevelCode) || !flow ? "Aprovar orçamento" : "Solicitar aprovação"}
                    </ActionButton>
                  )}
                  {canProposal && can("pricing:write") && <LinkButton size="sm" variant={currentProposal ? "secondary" : "primary"} icon={FilePlus2} href={`/precificacao/${e.id}?aba=proposta&nova=1`}>{currentProposal ? "Nova versão da proposta" : "Gerar proposta"}</LinkButton>}
                  {can("pricing:write") && e.status === "ENVIADO_CLIENTE" && <StatusButton id={e.id} target="EM_NEGOCIACAO" label="Em negociação" prompt="Observação (opcional):" />}
                  {can("pricing:write") && ["ENVIADO_CLIENTE", "EM_NEGOCIACAO", "APROVADO_INTERNAMENTE"].includes(e.status) && <>
                    <StatusButton id={e.id} target="ACEITO" label="Cliente aceitou" variant="primary" prompt="Observação do aceite (opcional):" />
                    <StatusButton id={e.id} target="RECUSADO" label="Cliente recusou" prompt="Motivo da recusa:" required variant="danger-ghost" />
                  </>}
                  {can("pricing:write") && e.status !== "CANCELADO" && <StatusButton id={e.id} target="CANCELADO" label="Cancelar" prompt="Motivo do cancelamento:" required variant="danger-ghost" />}
                  {can("pricing:write") && ["RECUSADO", "EXPIRADO", "CANCELADO", "ACEITO"].includes(e.status) && <StatusButton id={e.id} target="EM_ELABORACAO" label="Reabrir" prompt="Motivo da reabertura:" required />}
                </div>
                {e.status === "ACEITO" && (
                  <div className="space-y-2 border-t border-stone-100 pt-3">
                    <p className="font-medium">Próximos passos</p>
                    {e.contracts.length ? <p>Contrato: {e.contracts.map((c) => <Link key={c.id} className="link" href={`/contratos/${c.id}`}>{c.number}</Link>)}</p>
                      : can("contracts:write") && <ActionButton action={createContractFromEstimate.bind(null, e.id)} size="sm" confirm="Criar contrato com o valor negociado?">Criar contrato</ActionButton>}
                    {e.workOrders.length ? <p>OS: {e.workOrders.map((w, i) => <span key={w.id}>{i > 0 && ", "}<Link className="link" href={`/ordens-servico/${w.id}`}>{w.number}</Link></span>)}</p>
                      : can("workorders:write") && <WorkOrderForm estimateId={e.id} />}
                  </div>
                )}
              </div>
            </Card>

            {costs && e.items.length > 0 && (
              <Card title="Análise interna">
                <DataList cols={1} items={[
                  ["Receita (preço negociado)", fmtBRL(revenue.toString())],
                  [`Impostos (${fmtPct(tax)})`, fmtBRL(taxes.toString())],
                  ["Custo operacional", fmtBRL(cost.toString())],
                  ["Resultado (lucro bruto)", <b key="r" className={result.lt(0) ? "text-red-700" : "text-emerald-700"}>{fmtBRL(result.toString())}</b>],
                  ["Margem original (preço calculado)", e.calculatedMargin === null ? "—" : fmtPct(e.calculatedMargin.toString())],
                  ["Margem efetiva (após ajustes/desconto)", e.effectiveMargin === null ? "—" : <b key="m">{fmtPct(e.effectiveMargin.toString())}</b>],
                  ...(commissionLabel ? [
                    [`Comissão (${commissionLabel})${e.commissionTo ? ` — ${e.commissionTo}` : ""}`, <span key="c" className="text-red-700">− {fmtBRL(commission.toString())}</span>],
                    ["Resultado após comissão", <b key="rc" className={result.minus(commission).lt(0) ? "text-red-700" : "text-emerald-700"}>{fmtBRL(result.minus(commission).toString())}</b>],
                    ["Margem após comissão (define a alçada)", <b key="mc">{fmtPct(e.marginAfterCommission?.toString() ?? 0)}</b>],
                  ] as [string, React.ReactNode][] : []),
                  ["Desconto total vs. calculado", fmtBRL(dec(e.calculatedTotal.toString()).minus(revenue).toString())],
                ]} />
                <p className="mt-3 text-[11px] text-stone-500">Margem efetiva = (receita − impostos − custo) ÷ (receita − impostos). Limites: comercial ≥ {fmtPct(params_.approval.margemComercial)}, gerencial ≥ {fmtPct(params_.approval.margemGerencial)}.</p>
              </Card>
            )}

            {can("pricing:negotiate") && editable && (
              <Card title="Margem de lucro">
                <p className="mb-3 text-sm text-stone-600">
                  Vigente: <b>{e.marginOverride ? fmtPct(e.marginOverride.toString()) : `${defaultMarginPct}% (padrão dos parâmetros)`}</b>
                  {e.marginReason && <span className="block text-xs text-stone-500">Motivo: {e.marginReason}</span>}
                </p>
                <EstimateMarginForm estimateId={e.id} current={e.marginOverride?.toString() ?? null} defaultPct={defaultMarginPct} />
              </Card>
            )}

            {can("pricing:negotiate") && editable && (
              <Card title="Comissão">
                <p className="mb-3 text-sm text-stone-600">
                  {commissionLabel ? <>Vigente: <b>{commissionLabel}</b> = {fmtBRL(commission.toString())}{e.commissionTo && <> · {e.commissionTo}</>}</> : "Sem comissão."}
                  <span className="block text-xs text-stone-500">Custo interno: não altera o preço nem aparece na proposta.</span>
                </p>
                <CommissionForm estimateId={e.id} percent={e.commissionPercent?.toString() ?? null} base={e.commissionBase} to={e.commissionTo} />
              </Card>
            )}

            {can("pricing:negotiate") && editable && e.items.length > 0 && (
              <Card title="Desconto no orçamento">
                <DiscountForm estimateId={e.id} type={e.discountType} value={e.discountValue?.toString() ?? null} reason={e.discountReason} alert={fmtPct(params_.approval.descontoAlerta)} />
              </Card>
            )}

            <Card title="Dados">
              <DataList cols={1} items={[
                ["Título", e.title],
                ["Oportunidade", e.opportunity ? <Link key="o" className="link" href={`/oportunidades/${e.opportunity.id}/editar`}>{e.opportunity.description}</Link> : null],
                ["Contato", e.contact ? `${e.contact.name}${e.contact.email ? ` · ${e.contact.email}` : ""}` : null],
                ["Data", fmtDate(e.date)],
                ["Validade", fmtDate(e.validUntil)],
                ["Responsável comercial", e.commercialOwner?.name],
                ["Responsável técnico", e.technicalOwner?.name],
                ["Parâmetros", `v${e.parameterVersion.label} — ${ENGINE_LABEL[e.parameterVersion.engineVersion]}`],
                ...(costs ? [["Margem de lucro", e.marginOverride ? `${fmtPct(e.marginOverride.toString())} (definida no orçamento)` : `${defaultMarginPct}% (padrão)`] as [string, React.ReactNode]] : []),
                ["Criado por", `${e.createdBy?.name ?? "—"} em ${fmtDateTime(e.createdAt)}`],
                ...(e.parent ? [["Revisão de", <Link key="p" className="link" href={`/precificacao/${e.parent.id}`}>{e.parent.number}</Link>] as [string, React.ReactNode]] : []),
                ...(e.revisions.length ? [["Revisões", e.revisions.map((r) => <Link key={r.id} className="link mr-2" href={`/precificacao/${r.id}`}>{r.number}</Link>)] as [string, React.ReactNode]] : []),
                ...(e.internalNotes && costs ? [["Observações internas", e.internalNotes] as [string, React.ReactNode]] : []),
                ...(e.closeReason ? [["Motivo (encerramento)", e.closeReason] as [string, React.ReactNode]] : []),
              ]} />
            </Card>
          </aside>
        </div>
      )}

      {aba === "proposta" && <ProposalTab estimate={e} canWrite={can("pricing:write")} canProposal={canProposal} />}
      {aba === "historico" && <HistoryTab estimateId={e.id} costs={costs} />}
      {aba === "dados" && can("pricing:write") && editable && <DataTab estimate={e} />}
    </>
  );
}

async function ProposalTab({ estimate: e, canWrite, canProposal }: {
  estimate: NonNullable<Awaited<ReturnType<typeof loadForTab>>>; canWrite: boolean; canProposal: boolean;
}) {
  const contacts = await db.contact.findMany({ where: { clientId: e.clientId }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } });
  // Nenhum conteúdo sugerido: a proposta começa em branco e é redigida pelo usuário.
  const draft = {
    title: "", object: "", scope: "", contactId: null, validUntil: null, deadline: "", paymentTerms: "",
    conditions: "", assumptions: "", exclusions: "", responsibilities: "", notes: "",
  };
  const smtp = await mailConfigured();
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        {e.proposals.length === 0 && !canProposal && (
          <EmptyState title="Nenhuma proposta" description={e.items.length ? "Aprove o orçamento internamente para gerar a proposta." : "Adicione serviços ao orçamento."} />
        )}
        {canWrite && canProposal && <ProposalForm estimateId={e.id} draft={draft} contacts={contacts.map((c) => ({ value: c.id, label: c.name }))} />}
      </div>
      <aside className="space-y-4">
        {e.proposals.map((p) => (
          <Card key={p.id} title={<>{p.number} <span className="font-normal text-stone-500">v{p.version}</span></>}
            actions={<Badge tone={p.status === "ACEITA" ? "green" : p.status === "ENVIADA" ? "violet" : p.status === "SUBSTITUIDA" || p.status === "CANCELADA" ? "gray" : p.status === "RECUSADA" ? "red" : "blue"}>{PROPOSAL_STATUS[p.status]}</Badge>}>
            <div className="space-y-2 text-sm">
              <p className="font-medium">{p.title}</p>
              <p>Total <b>{fmtBRL(p.total.toString())}</b> · válida até {fmtDate(p.validUntil)}</p>
              {p.sentAt && <p className="text-xs text-stone-500"><Send className="inline size-3" /> Enviada em {fmtDateTime(p.sentAt)}{p.sentTo ? ` para ${p.sentTo}` : ""}</p>}
              <a className="btn btn-secondary btn-sm" href={`/api/propostas/${p.id}/pdf`} target="_blank" rel="noopener"><FileDown className="size-4" /> PDF da proposta</a>
              {canWrite && ["EMITIDA", "ENVIADA"].includes(p.status) && (
                <details className="rounded-xl border border-stone-200 p-3" open={p.status === "EMITIDA"}>
                  <summary className="cursor-pointer text-sm font-medium">Enviar ao cliente</summary>
                  <div className="mt-3"><SendProposalForm proposalId={p.id} smtp={smtp} /></div>
                </details>
              )}
            </div>
          </Card>
        ))}
      </aside>
    </div>
  );
}

async function loadForTab(id: string) {
  return db.pricingEstimate.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, legalName: true, tradeName: true } }, contact: { select: { name: true, email: true } },
      property: { select: { id: true, name: true } }, items: true, proposals: { orderBy: { version: "desc" }, include: { contact: { select: { email: true } } } },
    },
  });
}

async function HistoryTab({ estimateId, costs }: { estimateId: string; costs: boolean }) {
  const [logs, overrides, calcs] = await Promise.all([
    db.pricingAuditLog.findMany({ where: { estimateId }, orderBy: { createdAt: "desc" }, take: 300, include: { user: { select: { name: true } } } }),
    db.pricingOverride.findMany({ where: { estimateId }, orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } }, item: { select: { serviceCode: true } } } }),
    db.pricingCalculation.findMany({ where: { estimateId }, orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } }, parameterVersion: { select: { label: true } } } }),
  ]);
  const short = (v: string | null) => (v && v.length > 160 ? v.slice(0, 160) + "…" : v);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title="Trilha de auditoria" bodyClassName="p-0">
        <ul className="divide-y divide-stone-100">
          {logs.map((l) => (
            <li key={l.id} className="px-4 py-2.5 text-sm">
              <div className="flex flex-wrap justify-between gap-2"><b>{AUDIT_ACTION[l.action] ?? l.action}</b><span className="text-xs text-stone-500">{fmtDateTime(l.createdAt)} · {l.user?.name ?? "Sistema"}</span></div>
              {(l.previousValue || l.newValue) && (costs || !["ALTERACAO_MARGEM", "CUSTO_ADICIONAL"].includes(l.action)) && (
                <div className="text-xs text-stone-600">{l.field && <>{l.field}: </>}{l.previousValue && <span className="line-through">{short(l.previousValue)}</span>} {l.newValue && <>→ {short(l.newValue)}</>}</div>
              )}
              {l.justification && <div className="text-xs text-stone-500">Justificativa: {l.justification}</div>}
            </li>
          ))}
        </ul>
      </Card>
      <div className="space-y-4">
        <Card title="Ajustes de preço e descontos" bodyClassName="p-0">
          {overrides.length === 0 ? <p className="p-4 text-sm text-stone-500">Nenhum ajuste manual.</p> : (
            <div className="overflow-x-auto"><table className="table">
              <thead><tr><th>Quando</th><th>Tipo</th><th className="text-right">Calculado</th><th className="text-right">Negociado</th><th className="text-right">Dif.</th><th>Motivo</th></tr></thead>
              <tbody>{overrides.map((o) => (
                <tr key={o.id}>
                  <td className="text-xs whitespace-nowrap">{fmtDateTime(o.createdAt)}<div className="text-stone-500">{o.user?.name}</div></td>
                  <td className="text-xs">{OVERRIDE_TYPE[o.type]}{o.item ? ` · ${SERVICES[o.item.serviceCode as ServiceCode]?.shortName ?? ""}` : ""}</td>
                  <td className="text-right text-xs tabular-nums">{o.calculatedPrice ? fmtBRL(o.calculatedPrice.toString()) : "—"}</td>
                  <td className="text-right text-xs tabular-nums">{o.negotiatedPrice ? fmtBRL(o.negotiatedPrice.toString()) : "—"}</td>
                  <td className="text-right text-xs tabular-nums">{o.difference ? fmtBRL(o.difference.toString()) : "—"}{o.discountPercent && Number(o.discountPercent) > 0 ? <div className="text-stone-500">{fmtPct(o.discountPercent.toString())}</div> : null}</td>
                  <td className="text-xs">{o.reason}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
        <Card title="Cálculos salvos (imutáveis)" bodyClassName="p-0">
          <ul className="divide-y divide-stone-100">
            {calcs.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span>{SERVICES[c.serviceCode as ServiceCode]?.shortName} · {fmtBRL(c.finalPrice.toString())} <span className="text-xs text-stone-500">v{c.parameterVersion.label} · {fmtDateTime(c.createdAt)} · {c.createdBy?.name}</span></span>
                <Link className="link text-xs" href={`/precificacao/calculos/${c.id}`}>Ver</Link>
              </li>
            ))}
            {!calcs.length && <li className="px-4 py-3 text-sm text-stone-500">Nenhum cálculo.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}

async function DataTab({ estimate }: { estimate: Parameters<typeof EstimateForm>[0]["estimate"] }) {
  const [clients, users, opts] = await Promise.all([clientOptions(), userOptions(), estimateFormOptions()]);
  return <div className="max-w-3xl"><EstimateForm estimate={estimate} clients={clients} users={users} {...opts} /></div>;
}
