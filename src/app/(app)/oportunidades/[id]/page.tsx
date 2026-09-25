import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, Calculator, Pencil, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { OPPORTUNITY_ACTIVITY_TYPES, OPPORTUNITY_SOURCES, OPPORTUNITY_STAGE, SERVICES, labelOf } from "@/lib/catalogs";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { ESTIMATE_STATUS, ESTIMATE_STATUS_TONE } from "@/lib/pricing/labels";
import { Badge, Card, DataList, LinkButton, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { ActivityForm } from "./activity-form";
import { deleteOpportunity, deleteOpportunityActivity } from "../actions";

export const metadata = { title: "Oportunidade" };

export default async function OpportunityDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("opportunities:read");
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(user.permissions, p);
  const { id } = await params;
  const o = await db.opportunity.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, legalName: true, tradeName: true } }, owner: { select: { name: true } },
      activities: { orderBy: { occurredAt: "desc" }, include: { user: { select: { id: true, name: true } }, contact: { select: { name: true } } } },
      pricingEstimates: { orderBy: { createdAt: "desc" }, select: { id: true, number: true, status: true, negotiatedTotal: true, date: true } },
    },
  });
  if (!o) notFound();
  const contacts = await db.contact.findMany({ where: { clientId: o.clientId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const canWrite = can("opportunities:write");
  return (
    <>
      <PageHeader
        back={{ href: "/oportunidades", label: "Oportunidades" }}
        title={o.description}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Badge tone="blue">{OPPORTUNITY_STAGE[o.stage]}</Badge>{o.service && <Badge tone="green">{labelOf(SERVICES, o.service)}</Badge>}</span>}
        actions={<>
          {can("pricing:write") && !["GANHA", "PERDIDA"].includes(o.stage) && <LinkButton href={`/precificacao/novo?oportunidade=${id}`} icon={Calculator}>Precificar</LinkButton>}
          {canWrite && <LinkButton href={`/oportunidades/${id}/editar`} icon={Pencil}>Editar</LinkButton>}
          {can("opportunities:delete") && (
            <ActionButton action={deleteOpportunity.bind(null, id)} confirm="Excluir esta oportunidade e o log de ações?" variant="danger-ghost" redirectTo="/oportunidades"><Trash2 className="size-4" /> Excluir</ActionButton>
          )}
        </>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Log de ações junto ao cliente">
            {canWrite && <div className="mb-4 rounded-xl border border-dashed border-stone-300 bg-stone-50 p-3"><ActivityForm opportunityId={id} contacts={contacts.map((c) => ({ value: c.id, label: c.name }))} /></div>}
            {o.activities.length === 0 ? <p className="py-4 text-sm text-stone-500">Nenhuma ação registrada.</p> : (
              <ol className="relative space-y-4 border-l border-stone-200 pl-5" data-testid="opportunity-activities">
                {o.activities.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[26px] top-1.5 size-2.5 rounded-full bg-brand-600 ring-4 ring-white" />
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={a.type === "ENVIO_PROPOSTA" ? "violet" : a.type === "HOMOLOGACAO" ? "green" : "gray"}>{labelOf(OPPORTUNITY_ACTIVITY_TYPES, a.type)}</Badge>
                      <span className="text-xs tabular-nums text-stone-500">{fmtDateTime(a.occurredAt)}</span>
                      {a.automatic && <span className="inline-flex items-center gap-1 text-[11px] text-stone-400"><Bot className="size-3" /> automático</span>}
                    </div>
                    <p className="mt-1 whitespace-pre-line text-sm">{a.description}</p>
                    <p className="text-xs text-stone-500">{[a.contact && `com ${a.contact.name}`, a.user && `registrado por ${a.user.name}`].filter(Boolean).join(" · ")}</p>
                    {canWrite && !a.automatic && (a.user?.id === user.id || can("opportunities:delete")) && (
                      <ActionButton action={deleteOpportunityActivity.bind(null, a.id)} confirm="Excluir este registro do log?" variant="danger-ghost" size="sm"><Trash2 className="size-3.5" /> Excluir</ActionButton>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Dados">
            <DataList cols={1} items={[
              ["Cliente", <Link key="c" href={`/clientes/${o.client.id}`} className="link">{o.client.tradeName ?? o.client.legalName}</Link>],
              ["Valor estimado", fmtMoney(o.estimatedValue)],
              ["Probabilidade", `${o.probability}%`],
              ["Previsão", fmtDate(o.expectedDate)],
              ["Responsável", o.owner?.name],
              ["Origem", labelOf(OPPORTUNITY_SOURCES, o.source)],
            ]} />
            {o.notes && <p className="mt-3 whitespace-pre-line text-sm text-stone-700">{o.notes}</p>}
          </Card>
          {can("pricing:read") && o.pricingEstimates.length > 0 && (
            <Card title="Orçamentos">
              <ul className="divide-y divide-stone-100">
                {o.pricingEstimates.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <div><Link href={`/precificacao/${e.id}`} className="link">{e.number}</Link><p className="text-xs text-stone-500">{fmtDate(e.date)} · {fmtMoney(e.negotiatedTotal)}</p></div>
                    <Badge tone={ESTIMATE_STATUS_TONE[e.status]}>{ESTIMATE_STATUS[e.status]}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
