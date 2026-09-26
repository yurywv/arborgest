import Link from "next/link";
import { formatAddress } from "@/lib/address";
import { notFound } from "next/navigation";
import { Pencil, Plus, Trash2, Phone, Mail, MessageCircle, Globe, FileDown } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { CLIENT_STATUS, CLIENT_TYPES, CONTRACT_STATUS, DOCUMENT_TYPES, OPPORTUNITY_STAGE, PROPERTY_TYPES, SEGMENTS, WORK_ORDER_STATUS, labelOf } from "@/lib/catalogs";
import { fmtDate, fmtMoney, formatDocument, whatsappLink } from "@/lib/format";
import { Badge, Card, ContactTypeBadge, DataList, FlowStatusBadge, LinkButton, PageHeader, TabLinks } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { DocumentList } from "@/components/files/panels";
import { DocumentUploader } from "@/components/files/uploaders";
import { deleteClient } from "../actions";
import { ESTIMATE_STATUS, ESTIMATE_STATUS_TONE, PROPOSAL_STATUS, PROPOSAL_STATUS_TONE } from "@/lib/pricing/labels";
import { fileUrl } from "@/lib/files";
import { ClientHistory, type HistoryEvent } from "./history";

export const metadata = { title: "Cliente" };

export default async function ClientDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const user = await requirePermission("clients:read");
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(user.permissions, p);
  const { id } = await params;
  const tab = (await searchParams).aba ?? "resumo";

  const c = await db.client.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { type: "asc" }, { name: "asc" }] },
      properties: { include: { _count: { select: { trees: true } } }, orderBy: { name: "asc" } },
      opportunities: { orderBy: { createdAt: "desc" }, include: { owner: { select: { name: true } } } },
      contracts: { orderBy: { startDate: "desc" } },
      pricingEstimates: { orderBy: { createdAt: "desc" }, take: 50, select: { id: true, number: true, title: true, status: true, negotiatedTotal: true, date: true } },
      workOrders: { orderBy: { createdAt: "desc" }, take: 30 },
    },
  });
  if (!c) notFound();
  // Documentos do cliente, inclusive os anexados em contratos e propostas dele.
  const documents = await db.document.findMany({
    where: { OR: [{ clientId: id }, { contract: { clientId: id } }, { proposal: { clientId: id } }] },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { name: true } }, proposal: { select: { number: true } }, contract: { select: { id: true, number: true } } },
  });
  const canPricing = can("pricing:read");
  const canContracts = can("contracts:read");
  const proposals = await db.commercialProposal.findMany({
    where: { clientId: id, OR: [...(canPricing ? [{ estimateId: { not: null } }] : []), ...(canContracts ? [{ contractId: { not: null } }] : [])] },
    orderBy: [{ date: "desc" }, { version: "desc" }],
    select: {
      id: true, number: true, version: true, title: true, status: true, date: true, total: true, sentAt: true, sentTo: true, acceptedAt: true, acceptedBy: true,
      contractId: true, estimateId: true, contract: { select: { number: true } }, estimate: { select: { number: true } },
    },
  });
  const proposalHref = (p: (typeof proposals)[number]) => (p.contractId ? `/contratos/${p.contractId}/propostas/${p.id}` : `/precificacao/${p.estimateId}?aba=proposta&p=${p.id}`);
  const treeCount = c.properties.reduce((s, p) => s + p._count.trees, 0);

  const tabs = [
    { key: "resumo", label: "Resumo" },
    { key: "propriedades", label: "Propriedades", count: c.properties.length },
    { key: "oportunidades", label: "Oportunidades", count: c.opportunities.length },
    ...(can("pricing:read") ? [{ key: "orcamentos", label: "Orçamentos", count: c.pricingEstimates.length }] : []),
    { key: "contratos", label: "Contratos", count: c.contracts.length },
    { key: "os", label: "Ordens de serviço", count: c.workOrders.length },
    { key: "documentos", label: "Documentos", count: documents.length },
    { key: "historico", label: "Histórico" },
  ];

  const emails = tab !== "historico" ? [] : await db.sentEmail.findMany({
    where: { clientId: id }, orderBy: { createdAt: "desc" }, take: 200, include: { user: { select: { name: true } } },
  });
  const history: HistoryEvent[] = tab !== "historico" ? [] : [
    ...emails.map((m): HistoryEvent => {
      const att = (m.attachments as { name: string }[] | null) ?? [];
      return {
        at: m.createdAt, kind: "email", title: `E-mail: ${m.subject}`,
        detail: [`para ${m.to}`, m.cc && `cc ${m.cc}`, att.length && `anexos: ${att.map((a) => a.name).join(", ")}`, m.user && `por ${m.user.name}`, m.error && `erro: ${m.error}`].filter(Boolean).join(" · "),
        status: m.status === "ENVIADO" ? { label: "Enviado", tone: "green" } : { label: "Falha", tone: "red" },
      };
    }),
    ...proposals.flatMap((p): HistoryEvent[] => [
      { at: p.date, kind: "proposta", title: `Proposta ${p.number}${p.version > 1 ? ` (versão ${p.version})` : ""} emitida`, detail: `${p.title} · ${fmtMoney(p.total)}${p.contract ? ` · contrato ${p.contract.number}` : p.estimate ? ` · orçamento ${p.estimate.number}` : ""}`,
        href: proposalHref(p), pdf: `/api/propostas/${p.id}/pdf`, status: { label: PROPOSAL_STATUS[p.status], tone: PROPOSAL_STATUS_TONE[p.status] } },
      ...(p.sentAt ? [{ at: p.sentAt, kind: "envio" as const, title: `Proposta ${p.number} enviada`, detail: p.sentTo ?? "Envio registrado", href: proposalHref(p) }] : []),
      ...(p.acceptedAt ? [{ at: p.acceptedAt, kind: "aceite" as const, title: `Proposta ${p.number} aceita`, detail: p.acceptedBy ?? "", href: proposalHref(p) }] : []),
    ]),
    ...(canContracts ? c.contracts.map((k): HistoryEvent => ({
      at: k.createdAt, kind: "contrato", title: `Contrato ${k.number} cadastrado`, detail: `${fmtDate(k.startDate)} a ${fmtDate(k.endDate)} · ${fmtMoney(k.value)} · ${k.object}`,
      href: `/contratos/${k.id}`, status: { label: CONTRACT_STATUS[k.status], tone: k.status === "ATIVO" ? "green" : "gray" },
    })) : []),
    ...(canPricing ? c.pricingEstimates.map((e): HistoryEvent => ({
      at: e.date, kind: "orcamento", title: `Orçamento ${e.number}`, detail: `${fmtMoney(e.negotiatedTotal)}${e.title ? ` · ${e.title}` : ""}`,
      href: `/precificacao/${e.id}`, status: { label: ESTIMATE_STATUS[e.status], tone: ESTIMATE_STATUS_TONE[e.status] },
    })) : []),
    ...documents.map((d): HistoryEvent => ({
      at: d.createdAt, kind: "documento", title: `${labelOf(DOCUMENT_TYPES, d.type)}: ${d.fileName}`,
      detail: [d.proposal && `proposta ${d.proposal.number}`, d.contract && `contrato ${d.contract.number}`, d.description, d.uploadedBy && `por ${d.uploadedBy.name}`].filter(Boolean).join(" · "),
      href: fileUrl(d.storageKey), external: true,
    })),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at));

  return (
    <>
      <PageHeader
        back={{ href: "/clientes", label: "Clientes" }}
        title={c.tradeName ?? c.legalName}
        subtitle={<span className="flex flex-wrap items-center gap-2">{c.legalName} <Badge tone={c.status === "ATIVO" ? "green" : c.status === "PROSPECT" ? "blue" : "gray"}>{CLIENT_STATUS[c.status]}</Badge></span>}
        actions={
          <>
            {can("clients:write") && <LinkButton href={`/clientes/${id}/editar`} icon={Pencil}>Editar</LinkButton>}
            {can("clients:delete") && (
              <ActionButton action={deleteClient.bind(null, id)} confirm="Excluir este cliente e seus contatos/oportunidades? Clientes com propriedades, contratos ou OS não podem ser excluídos." variant="danger-ghost" redirectTo="/clientes">
                <Trash2 className="size-4" /> Excluir
              </ActionButton>
            )}
          </>
        }
      />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="card p-3 text-center"><div className="text-xl font-bold">{c.properties.length}</div><div className="text-xs text-stone-500">Propriedades</div></div>
        <div className="card p-3 text-center"><div className="text-xl font-bold">{treeCount}</div><div className="text-xs text-stone-500">Árvores</div></div>
        <div className="card p-3 text-center"><div className="text-xl font-bold">{c.contracts.filter((k) => k.status === "ATIVO").length}</div><div className="text-xs text-stone-500">Contratos ativos</div></div>
      </div>
      <TabLinks tabs={tabs} active={tab} baseHref={`/clientes/${id}`} />

      {tab === "resumo" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Dados cadastrais" className="lg:col-span-2">
            <DataList
              items={[
                ["CPF/CNPJ", formatDocument(c.document)],
                ["Tipo", labelOf(CLIENT_TYPES, c.clientType)],
                ["Segmento", labelOf(SEGMENTS, c.segment)],
                ["Cadastro", fmtDate(c.createdAt)],
                ["Telefone", c.phone && <a className="link" href={`tel:${c.phone}`}>{c.phone}</a>],
                ["E-mail", c.email && (can("clients:write") ? <Link className="link" href={`/emails/novo?cliente=${id}&para=${encodeURIComponent(c.email)}`}>{c.email}</Link> : c.email)],
                ["Site", c.website && <a className="link" href={c.website} target="_blank" rel="noopener noreferrer"><Globe className="inline size-3.5" /> {c.website}</a>],
                ["Endereço", formatAddress({ address: c.address, number: c.addressNumber, complement: c.addressComplement, district: c.district, city: c.city, state: c.state, zipCode: c.zipCode })],
                ["Observações", c.notes],
              ]}
            />
          </Card>
          <Card
            title="Contatos"
            actions={can("clients:write") && <LinkButton size="sm" href={`/contatos/novo?clientId=${id}`} icon={Plus}>Novo</LinkButton>}
          >
            {c.contacts.length === 0 && <p className="text-sm text-stone-500">Nenhum contato.</p>}
            <ul className="space-y-3">
              {c.contacts.map((k) => (
                <li key={k.id} className="rounded-xl border border-stone-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/contatos/${k.id}/editar`} className="font-medium hover:underline">{k.name}</Link>
                    <div className="flex shrink-0 gap-1">
                      <ContactTypeBadge value={k.type} />
                      {k.isPrimary && <Badge tone="green">Principal</Badge>}
                    </div>
                  </div>
                  {k.jobTitle && <p className="text-xs text-stone-500">{k.jobTitle}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(k.mobile || k.phone) && <a href={`tel:${k.mobile ?? k.phone}`} className="btn btn-secondary btn-sm"><Phone className="size-3.5" /> Ligar</a>}
                    {k.whatsapp && <a href={whatsappLink(k.whatsapp)!} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm"><MessageCircle className="size-3.5" /> WhatsApp</a>}
                    {k.email && can("clients:write") && <Link href={`/emails/novo?contato=${k.id}`} className="btn btn-secondary btn-sm"><Mail className="size-3.5" /> E-mail</Link>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {tab === "propriedades" && (
        <Card title="Propriedades" actions={can("properties:write") && <LinkButton size="sm" href={`/propriedades/nova?clientId=${id}`} icon={Plus}>Nova propriedade</LinkButton>}>
          {c.properties.length === 0 ? <p className="text-sm text-stone-500">Nenhuma propriedade.</p> : (
            <ul className="divide-y divide-stone-100">
              {c.properties.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/propriedades/${p.id}`} className="link">{p.name}</Link>
                    <p className="truncate text-xs text-stone-500">{labelOf(PROPERTY_TYPES, p.propertyType)} · {formatAddress({ address: p.address, number: p.number, city: p.city, state: p.state })}</p>
                  </div>
                  <Badge tone="green">{p._count.trees} árvores</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "oportunidades" && (
        <Card title="Oportunidades" actions={can("opportunities:write") && <LinkButton size="sm" href={`/oportunidades/nova?clientId=${id}`} icon={Plus}>Nova</LinkButton>}>
          {c.opportunities.length === 0 ? <p className="text-sm text-stone-500">Nenhuma oportunidade.</p> : (
            <ul className="divide-y divide-stone-100">
              {c.opportunities.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/oportunidades/${o.id}/editar`} className="link">{o.description}</Link>
                    <p className="text-xs text-stone-500">{fmtMoney(o.estimatedValue)} · {o.probability}% · {o.owner?.name ?? "sem responsável"} · previsão {fmtDate(o.expectedDate)}</p>
                  </div>
                  <Badge tone={o.stage === "GANHA" ? "green" : o.stage === "PERDIDA" ? "gray" : "blue"}>{OPPORTUNITY_STAGE[o.stage]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "orcamentos" && can("pricing:read") && (
        <Card title="Orçamentos e propostas" actions={can("pricing:write") && <LinkButton size="sm" href={`/precificacao/novo?cliente=${id}`} icon={Plus}>Novo orçamento</LinkButton>}>
          {c.pricingEstimates.length === 0 ? <p className="text-sm text-stone-500">Nenhum orçamento.</p> : (
            <ul className="divide-y divide-stone-100">
              {c.pricingEstimates.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/precificacao/${e.id}`} className="link">{e.number}</Link>
                    <p className="truncate text-xs text-stone-500">{fmtDate(e.date)} · {fmtMoney(e.negotiatedTotal)}{e.title ? ` · ${e.title}` : ""}</p>
                  </div>
                  <Badge tone={ESTIMATE_STATUS_TONE[e.status]}>{ESTIMATE_STATUS[e.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "contratos" && (
        <div className="space-y-4">
        <Card title="Contratos" actions={can("contracts:write") && <LinkButton size="sm" href={`/contratos/novo?clientId=${id}`} icon={Plus}>Novo contrato</LinkButton>}>
          {c.contracts.length === 0 ? <p className="text-sm text-stone-500">Nenhum contrato.</p> : (
            <ul className="divide-y divide-stone-100">
              {c.contracts.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/contratos/${k.id}`} className="link">{k.number}</Link>
                    <p className="truncate text-xs text-stone-500">{fmtDate(k.startDate)} a {fmtDate(k.endDate)} · {fmtMoney(k.value)} · {k.object}</p>
                  </div>
                  <Badge tone={k.status === "ATIVO" ? "green" : "gray"}>{CONTRACT_STATUS[k.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Propostas">
          {proposals.length === 0 ? <p className="text-sm text-stone-500">Nenhuma proposta.</p> : (
            <ul className="divide-y divide-stone-100" data-testid="client-proposals">
              {proposals.map((p) => (
                <li key={p.id} className="flex items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link href={proposalHref(p)} className="link">{p.number}{p.version > 1 ? ` · v${p.version}` : ""}</Link>
                    <p className="truncate text-xs text-stone-500">{fmtDate(p.date)} · {fmtMoney(p.total)} · {p.title}{p.contract ? ` · contrato ${p.contract.number}` : p.estimate ? ` · orçamento ${p.estimate.number}` : ""}</p>
                  </div>
                  <Badge tone={PROPOSAL_STATUS_TONE[p.status]}>{PROPOSAL_STATUS[p.status]}</Badge>
                  <a href={`/api/propostas/${p.id}/pdf`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" aria-label={`PDF da proposta ${p.number}`}><FileDown className="size-4" /></a>
                </li>
              ))}
            </ul>
          )}
        </Card>
        </div>
      )}

      {tab === "os" && (
        <Card title="Ordens de serviço" actions={can("workorders:write") && <LinkButton size="sm" href={`/ordens-servico/nova?clientId=${id}`} icon={Plus}>Nova OS</LinkButton>}>
          {c.workOrders.length === 0 ? <p className="text-sm text-stone-500">Nenhuma OS.</p> : (
            <ul className="divide-y divide-stone-100">
              {c.workOrders.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div><Link href={`/ordens-servico/${w.id}`} className="link">{w.number}</Link><p className="text-xs text-stone-500">Prevista {fmtDate(w.scheduledAt)}</p></div>
                  <FlowStatusBadge value={w.status} labels={WORK_ORDER_STATUS} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "documentos" && (
        <Card title="Documentos">
          {can("files:write") && <div className="mb-4"><DocumentUploader refs={{ clientId: id }} /></div>}
          <DocumentList docs={documents} canDelete={can("files:delete")} />
        </Card>
      )}

      {tab === "historico" && (
        <div className="space-y-3">
          {can("clients:write") && <div className="flex justify-end"><LinkButton href={`/emails/novo?cliente=${id}`} icon={Mail}>Enviar e-mail</LinkButton></div>}
          <ClientHistory events={history} />
        </div>
      )}
    </>
  );
}
