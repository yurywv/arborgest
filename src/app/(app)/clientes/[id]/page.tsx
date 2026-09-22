import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus, Trash2, Phone, Mail, MessageCircle, Globe } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { CLIENT_STATUS, CLIENT_TYPES, CONTRACT_STATUS, OPPORTUNITY_STAGE, PROPERTY_TYPES, SEGMENTS, WORK_ORDER_STATUS, labelOf } from "@/lib/catalogs";
import { fmtDate, fmtMoney, formatDocument, whatsappLink } from "@/lib/format";
import { Badge, Card, DataList, FlowStatusBadge, LinkButton, PageHeader, TabLinks } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { DocumentList } from "@/components/files/panels";
import { DocumentUploader } from "@/components/files/uploaders";
import { deleteClient } from "../actions";

export const metadata = { title: "Cliente" };

export default async function ClientDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const user = await requirePermission("clients:read");
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(user.permissions, p);
  const { id } = await params;
  const tab = (await searchParams).aba ?? "resumo";

  const c = await db.client.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      properties: { include: { _count: { select: { trees: true } } }, orderBy: { name: "asc" } },
      opportunities: { orderBy: { createdAt: "desc" }, include: { owner: { select: { name: true } } } },
      contracts: { orderBy: { startDate: "desc" } },
      workOrders: { orderBy: { createdAt: "desc" }, take: 30 },
      documents: { orderBy: { createdAt: "desc" }, include: { uploadedBy: { select: { name: true } } } },
    },
  });
  if (!c) notFound();
  const treeCount = c.properties.reduce((s, p) => s + p._count.trees, 0);

  const tabs = [
    { key: "resumo", label: "Resumo" },
    { key: "propriedades", label: "Propriedades", count: c.properties.length },
    { key: "oportunidades", label: "Oportunidades", count: c.opportunities.length },
    { key: "contratos", label: "Contratos", count: c.contracts.length },
    { key: "os", label: "Ordens de serviço", count: c.workOrders.length },
    { key: "documentos", label: "Documentos", count: c.documents.length },
  ];

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
                ["E-mail", c.email && <a className="link" href={`mailto:${c.email}`}>{c.email}</a>],
                ["Site", c.website && <a className="link" href={c.website} target="_blank" rel="noopener noreferrer"><Globe className="inline size-3.5" /> {c.website}</a>],
                ["Endereço", [c.address, c.district, c.city && `${c.city}/${c.state ?? ""}`, c.zipCode].filter(Boolean).join(" · ")],
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
                    {k.isPrimary && <Badge tone="green">Principal</Badge>}
                  </div>
                  {k.jobTitle && <p className="text-xs text-stone-500">{k.jobTitle}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(k.mobile || k.phone) && <a href={`tel:${k.mobile ?? k.phone}`} className="btn btn-secondary btn-sm"><Phone className="size-3.5" /> Ligar</a>}
                    {k.whatsapp && <a href={whatsappLink(k.whatsapp)!} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm"><MessageCircle className="size-3.5" /> WhatsApp</a>}
                    {k.email && <a href={`mailto:${k.email}`} className="btn btn-secondary btn-sm"><Mail className="size-3.5" /> E-mail</a>}
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
                    <p className="truncate text-xs text-stone-500">{labelOf(PROPERTY_TYPES, p.propertyType)} · {[p.address, p.city].filter(Boolean).join(", ")}</p>
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

      {tab === "contratos" && (
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
          <DocumentList docs={c.documents} canDelete={can("files:delete")} />
        </Card>
      )}
    </>
  );
}
