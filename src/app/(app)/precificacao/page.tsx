import Link from "next/link";
import { Calculator, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { fmtDate } from "@/lib/format";
import { ci, pageOf, spFlat, spGet, type SP } from "@/lib/query";
import { clientOptions } from "@/lib/options";
import { fmtBRL, fmtPct } from "@/lib/pricing/decimal";
import { ESTIMATE_STATUS, ESTIMATE_STATUS_TONE } from "@/lib/pricing/labels";
import { SERVICES } from "@/lib/pricing/registry";
import { pricingIndicators } from "@/lib/pricing/indicators";
import { expireEstimates } from "@/lib/pricing/server";
import { Badge, Card, EmptyState, LinkButton, MobileCard, PageHeader, Pagination, ResponsiveTable } from "@/components/ui";
import { FilterForm, FilterSelect, SearchBox } from "@/components/filters";

export const metadata = { title: "Precificação" };

function monthRange(mes?: string) {
  const now = new Date();
  const [y, m] = mes && /^\d{4}-\d{2}$/.test(mes) ? mes.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1), key: `${y}-${String(m).padStart(2, "0")}` };
}

export default async function PricingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("pricing:read");
  const costs = hasPermission(user.permissions, "pricing:costs");
  const sp = await searchParams;
  await expireEstimates();
  const q = spGet(sp, "q");
  const status = spGet(sp, "status");
  const clientId = spGet(sp, "cliente");
  const service = spGet(sp, "servico");
  const pending = spGet(sp, "pendentes") === "1";
  const { from, to, key } = monthRange(spGet(sp, "mes"));
  const { page, pageSize, skip, take } = pageOf(sp, 25);
  const where: Prisma.PricingEstimateWhereInput = {
    ...(q && { OR: [{ number: ci(q) }, { title: ci(q) }, { client: { legalName: ci(q) } }, { client: { tradeName: ci(q) } }, { property: { name: ci(q) } }] }),
    ...(status && status in ESTIMATE_STATUS && { status: status as never }),
    ...(clientId && { clientId }),
    ...(service && { items: { some: { serviceCode: service } } }),
    ...(pending && { approvals: { some: { status: "PENDENTE" } } }),
  };
  const [rows, total, clients, ind, pendingCount] = await Promise.all([
    db.pricingEstimate.findMany({
      where, skip, take, orderBy: { createdAt: "desc" },
      include: { client: { select: { legalName: true, tradeName: true } }, property: { select: { name: true } }, items: { select: { serviceCode: true, quantity: true } }, parameterVersion: { select: { label: true } } },
    }),
    db.pricingEstimate.count({ where }),
    clientOptions(),
    pricingIndicators(from, to),
    db.proposalApproval.count({ where: { status: "PENDENTE" } }),
  ]);
  const services = (codes: { serviceCode: string; quantity: number }[]) =>
    codes.map((i) => `${SERVICES[i.serviceCode as keyof typeof SERVICES]?.shortName ?? i.serviceCode} (${i.quantity})`).join(" · ") || "Sem itens";

  return (
    <>
      <PageHeader
        title="Precificação"
        subtitle="Orçamentos, aprovação e propostas comerciais"
        actions={<>
          <LinkButton href="/precificacao/simulador" icon={Calculator}>Simulador</LinkButton>
          {hasPermission(user.permissions, "pricing:write") && <LinkButton href="/precificacao/novo" variant="primary" icon={Plus}>Novo orçamento</LinkButton>}
        </>}
      />

      <section aria-label="Indicadores" className="mb-4">
        <form className="mb-2 flex items-center gap-2 text-sm">
          <label htmlFor="mes" className="text-stone-600">Indicadores de</label>
          <input id="mes" type="month" name="mes" defaultValue={key} className="input min-h-9 w-40 py-1" />
          <button className="btn btn-secondary btn-sm">Ver</button>
          {pendingCount > 0 && <Link href="/precificacao?pendentes=1" className="ml-auto"><Badge tone="yellow">{pendingCount} aprovação(ões) pendente(s)</Badge></Link>}
        </form>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <Kpi label="Orçamentos no mês" value={String(ind.count)} />
          <Kpi label="Valor proposto (enviado)" value={fmtBRL(ind.proposedValue)} hint={`${ind.sentCount} enviado(s)`} />
          <Kpi label="Valor aprovado (aceito)" value={fmtBRL(ind.approvedValue)} hint={`${ind.acceptedCount} aceito(s)`} />
          <Kpi label="Ticket médio" value={fmtBRL(ind.ticket)} />
          <Kpi label="Conversão" value={ind.conversion === null ? "—" : fmtPct(ind.conversion)} hint={`${ind.acceptedCount} aceitas · ${ind.rejectedCount} recusadas`} />
          {costs ? <Kpi label="Margem média" value={ind.avgMargin === null ? "—" : fmtPct(ind.avgMargin)} hint={`Descontos: ${fmtBRL(ind.discounts)}`} />
            : <Kpi label="Descontos concedidos" value={fmtBRL(ind.discounts)} />}
        </div>
        {(ind.byService.length > 0 || ind.byClient.length > 0) && (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Card title="Por serviço" bodyClassName="p-0">
              <table className="table"><tbody>
                {ind.byService.map((s) => <tr key={s.service}><td>{s.service}</td><td className="text-right">{s.count} item(ns) · {s.trees} árv.</td><td className="text-right font-semibold">{fmtBRL(s.value)}</td></tr>)}
              </tbody></table>
            </Card>
            <Card title="Principais clientes" bodyClassName="p-0">
              <table className="table"><tbody>
                {ind.byClient.map((c) => <tr key={c.client}><td>{c.client}</td><td className="text-right">{c.count}</td><td className="text-right font-semibold">{fmtBRL(c.value)}</td></tr>)}
              </tbody></table>
            </Card>
          </div>
        )}
      </section>

      <FilterForm>
        <SearchBox defaultValue={q} placeholder="Número, título, cliente ou propriedade" />
        <FilterSelect name="status" label="Status" options={Object.entries(ESTIMATE_STATUS).map(([value, label]) => ({ value, label }))} value={status} />
        <FilterSelect name="servico" label="Serviço" options={Object.values(SERVICES).map((s) => ({ value: s.code, label: s.shortName }))} value={service} />
        <FilterSelect name="cliente" label="Cliente" options={clients} value={clientId} />
      </FilterForm>

      {rows.length === 0 ? (
        <EmptyState icon={Calculator} title="Nenhum orçamento encontrado" description="Crie um orçamento a partir de um cliente, propriedade ou oportunidade."
          action={hasPermission(user.permissions, "pricing:write") && <LinkButton href="/precificacao/novo" variant="primary" icon={Plus}>Novo orçamento</LinkButton>} />
      ) : (
        <ResponsiveTable
          head={<tr><th>Número</th><th>Cliente / propriedade</th><th>Serviços</th><th>Data</th><th>Status</th><th className="text-right">Total</th>{costs && <th className="text-right">Margem</th>}</tr>}
          mobile={rows.map((e) => (
            <MobileCard key={e.id} href={`/precificacao/${e.id}`} title={<>{e.number} · <span className="font-normal">{e.client.tradeName ?? e.client.legalName}</span></>}
              subtitle={services(e.items)} right={<b className="text-sm">{fmtBRL(e.negotiatedTotal.toString())}</b>}>
              <Badge tone={ESTIMATE_STATUS_TONE[e.status]}>{ESTIMATE_STATUS[e.status]}</Badge>
            </MobileCard>
          ))}
        >
          {rows.map((e) => (
            <tr key={e.id}>
              <td><Link className="link" href={`/precificacao/${e.id}`}>{e.number}</Link><div className="text-xs text-stone-500">params v{e.parameterVersion.label}</div></td>
              <td>{e.client.tradeName ?? e.client.legalName}<div className="text-xs text-stone-500">{e.property?.name ?? e.title ?? ""}</div></td>
              <td className="text-xs">{services(e.items)}</td>
              <td className="whitespace-nowrap">{fmtDate(e.date)}</td>
              <td><Badge tone={ESTIMATE_STATUS_TONE[e.status]}>{ESTIMATE_STATUS[e.status]}</Badge></td>
              <td className="text-right font-semibold whitespace-nowrap tabular-nums">{fmtBRL(e.negotiatedTotal.toString())}</td>
              {costs && <td className="text-right tabular-nums">{e.effectiveMargin === null ? "—" : fmtPct(e.effectiveMargin.toString())}</td>}
            </tr>
          ))}
        </ResponsiveTable>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/precificacao" />
    </>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-3">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="text-lg font-bold tabular-nums text-stone-900">{value}</div>
      {hint && <div className="text-[11px] text-stone-400">{hint}</div>}
    </div>
  );
}
