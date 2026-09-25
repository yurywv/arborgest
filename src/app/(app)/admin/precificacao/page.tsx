import Link from "next/link";
import { FileCheck2 } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { pageOf, spFlat, spGet, type SP } from "@/lib/query";
import { AUDIT_ACTION } from "@/lib/pricing/labels";
import { FilterForm, FilterSelect } from "@/components/filters";
import { requirePermission } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { diffParams } from "@/lib/pricing/params-schema";
import { getActiveVersion, paramsOf } from "@/lib/pricing/server";
import { ENGINE_LABEL } from "@/lib/pricing/types";
import { ActionButton } from "@/components/form";
import { Badge, Card, LinkButton, PageHeader, Pagination, TabLinks } from "@/components/ui";
import { ParamsEditor } from "./params-editor";
import { CompensationRuleForm, EditCompensationRule } from "./forms";
import { toggleCompensationRule, toggleService } from "./actions";
import { fmtBRL, fmtN } from "@/lib/pricing/decimal";

export const metadata = { title: "Parâmetros de precificação" };

export default async function PricingAdminPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission("pricing:params");
  const sp = await searchParams;
  const aba = spGet(sp, "aba") ?? "parametros";
  const active = await getActiveVersion();
  return (
    <>
      <PageHeader
        title="Configurações › Precificação"
        subtitle={<>Versão vigente <b>v{active.label}</b> · {ENGINE_LABEL[active.engineVersion]} · desde {fmtDateTime(active.effectiveFrom)}</>}
        actions={<LinkButton href="/admin/precificacao/validacao" icon={FileCheck2}>Validação da lógica legada</LinkButton>}
      />
      <TabLinks active={aba} baseHref="/admin/precificacao" tabs={[
        { key: "parametros", label: "Parâmetros gerais" }, { key: "versoes", label: "Versões" },
        { key: "compensacao", label: "Compensação municipal" }, { key: "servicos", label: "Serviços" }, { key: "auditoria", label: "Auditoria" },
      ]} />
      {aba === "parametros" && (
        <ParamsEditor initial={paramsOf(active)} versionLabel={active.label}
          v2Validated={!!(await db.pricingParameterVersion.count({ where: { v2ValidatedAt: { not: null } } }))} />
      )}
      {aba === "versoes" && <Versions />}
      {aba === "servicos" && <Services />}
      {aba === "compensacao" && <CompensationRules />}
      {aba === "auditoria" && <AuditTrail sp={sp} />}
    </>
  );
}

async function Versions() {
  const versions = await db.pricingParameterVersion.findMany({
    orderBy: [{ createdAt: "desc" }], include: { createdBy: { select: { name: true } }, _count: { select: { estimates: true, calculations: true } } },
  });
  return (
    <div className="space-y-3">
      {versions.map((v, i) => {
        const prev = versions[i + 1];
        const changes = prev ? diffParams(paramsOf(prev), paramsOf(v)) : [];
        return (
          <Card key={v.id} title={<>v{v.label} {v.active && <Badge tone="green">Vigente</Badge>}</>}
            actions={<span className="text-xs text-stone-500">{fmtDateTime(v.createdAt)} · {v.createdBy?.name ?? "Sistema"}</span>}>
            <p className="text-sm">{v.description}</p>
            <p className="mt-1 text-xs text-stone-500">{ENGINE_LABEL[v.engineVersion]} · {v._count.estimates} orçamento(s) · {v._count.calculations} cálculo(s) salvos</p>
            {v.v2ValidatedNote && <p className="mt-1 text-xs text-emerald-800">Validação do motor v2: {v.v2ValidatedNote}</p>}
            {changes.length > 0 && (
              <details className="mt-2 text-xs"><summary className="cursor-pointer text-stone-600">{changes.length} alteração(ões) em relação à v{prev!.label}</summary>
                <ul className="mt-1 space-y-0.5 font-mono">{changes.map((c) => <li key={c.path}>{c.path}: <span className="text-red-700">{JSON.stringify(c.from)}</span> → <span className="text-emerald-700">{JSON.stringify(c.to)}</span></li>)}</ul>
              </details>
            )}
          </Card>
        );
      })}
    </div>
  );
}

async function Services() {
  const services = await db.pricingService.findMany({ orderBy: { order: "asc" } });
  return (
    <Card title="Serviços precificáveis" bodyClassName="p-0">
      <table className="table">
        <thead><tr><th>Código</th><th>Serviço</th><th>Unidade</th><th>Situação</th><th /></tr></thead>
        <tbody>
          {services.map((s) => (
            <tr key={s.id}>
              <td className="font-mono text-xs">{s.code}</td>
              <td>{s.name}<div className="text-xs text-stone-500">{s.description}</div></td>
              <td>{s.unit}</td>
              <td>{s.active ? <Badge tone="green">Ativo</Badge> : <Badge>Inativo</Badge>}</td>
              <td className="text-right"><ActionButton size="sm" action={toggleService.bind(null, s.code, !s.active)}>{s.active ? "Desativar" : "Ativar"}</ActionButton></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="p-4 text-xs text-stone-500">
        Novos serviços (plantio, transplante, laudos…) são adicionados como módulos do Pricing Engine — veja <Link className="link" href="/admin/precificacao/validacao#arquitetura">arquitetura</Link> e <code>src/lib/pricing/registry.ts</code>.
      </p>
    </Card>
  );
}

async function CompensationRules() {
  const rules = await db.compensationRule.findMany({ orderBy: [{ active: "desc" }, { state: "asc" }, { city: "asc" }] });
  const row = (r: (typeof rules)[number]) => ({
    id: r.id, city: r.city, state: r.state, lawReference: r.lawReference, seedlingsPerTree: r.seedlingsPerTree.toString(),
    freightValue: r.freightValue?.toString() ?? null, notes: r.notes,
  });
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Card title="Leis municipais de compensação ambiental" bodyClassName="p-0">
        {rules.length === 0 ? <p className="p-4 text-sm text-stone-500">Nenhuma lei cadastrada. Cadastre as leis dos municípios atendidos para sugerir a quantidade de mudas na supressão.</p> : (
          <ul className="divide-y divide-stone-100">
            {rules.map((r) => (
              <li key={r.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <b>{r.city}/{r.state}</b> {!r.active && <Badge>Inativa</Badge>}
                    <p className="text-sm">{r.lawReference}</p>
                    <p className="text-xs text-stone-500">{fmtN(r.seedlingsPerTree.toString())} muda(s) por árvore suprimida{r.freightValue ? ` · frete ${fmtBRL(r.freightValue.toString())}` : ""}{r.notes ? ` · ${r.notes}` : ""}</p>
                  </div>
                  <ActionButton size="sm" action={toggleCompensationRule.bind(null, r.id, !r.active)}>{r.active ? "Desativar" : "Ativar"}</ActionButton>
                </div>
                <EditCompensationRule rule={row(r)} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Nova lei municipal"><CompensationRuleForm /></Card>
    </div>
  );
}

/** Trilha completa da Precificação: toda ação (inclusive tentativas recusadas), com usuário, data, valores e justificativa. */
async function AuditTrail({ sp }: { sp: SP }) {
  const action = spGet(sp, "acao");
  const userId = spGet(sp, "usuario");
  const from = spGet(sp, "de");
  const to = spGet(sp, "ate");
  const { page, pageSize, skip, take } = pageOf(sp, 50);
  const where: Prisma.PricingAuditLogWhereInput = {
    ...(action && { action }),
    ...(userId && { userId }),
    ...((from || to) && { createdAt: { ...(from && { gte: new Date(`${from}T00:00:00`) }), ...(to && { lte: new Date(`${to}T23:59:59`) }) } }),
  };
  const [rows, total, users, actions] = await Promise.all([
    db.pricingAuditLog.findMany({ where, skip, take, orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } }, estimate: { select: { id: true, number: true } } } }),
    db.pricingAuditLog.count({ where }),
    db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.pricingAuditLog.groupBy({ by: ["action"], _count: { _all: true } }),
  ]);
  const short = (v: string | null) => (v && v.length > 220 ? v.slice(0, 220) + "…" : v);
  return (
    <>
      <FilterForm>
        <input type="hidden" name="aba" value="auditoria" />
        <FilterSelect name="acao" label="Ação" value={action} options={actions.map((a) => ({ value: a.action, label: `${AUDIT_ACTION[a.action] ?? a.action} (${a._count._all})` }))} />
        <FilterSelect name="usuario" label="Usuário" value={userId} options={users.map((u) => ({ value: u.id, label: u.name }))} />
        <label className="min-w-36"><span className="mb-0.5 block text-[11px] font-medium text-stone-500">De</span><input type="date" name="de" defaultValue={from} className="input min-h-10 py-1.5" /></label>
        <label className="min-w-36"><span className="mb-0.5 block text-[11px] font-medium text-stone-500">Até</span><input type="date" name="ate" defaultValue={to} className="input min-h-10 py-1.5" /></label>
        <button className="btn btn-secondary btn-sm min-h-10">Filtrar</button>
      </FilterForm>
      <Card title={`Registros (${total})`} bodyClassName="p-0">
        <ul className="divide-y divide-stone-100">
          {rows.map((l) => (
            <li key={l.id} className="px-4 py-2.5 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span><b className={l.action === "TENTATIVA_RECUSADA" ? "text-red-700" : ""}>{AUDIT_ACTION[l.action] ?? l.action}</b>
                  {l.estimate && <> · <Link className="link" href={`/precificacao/${l.estimate.id}?aba=historico`}>{l.estimate.number}</Link></>}
                  {!l.estimate && l.entity !== "Precificacao" && <span className="text-xs text-stone-500"> · {l.entity}</span>}</span>
                <span className="text-xs text-stone-500">{fmtDateTime(l.createdAt)} · {l.user?.name ?? "Sistema"}{l.ip ? ` · ${l.ip}` : ""}</span>
              </div>
              {l.field && <div className="text-xs text-stone-600">{l.field}</div>}
              {(l.previousValue || l.newValue) && <div className="text-xs text-stone-600">{l.previousValue && <span className="line-through">{short(l.previousValue)}</span>} {l.newValue && <>→ {short(l.newValue)}</>}</div>}
              {l.justification && <div className="text-xs text-stone-500">{l.action === "TENTATIVA_RECUSADA" ? "Motivo da recusa" : "Justificativa"}: {l.justification}</div>}
            </li>
          ))}
          {!rows.length && <li className="px-4 py-3 text-sm text-stone-500">Nenhum registro.</li>}
        </ul>
      </Card>
      <Pagination page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/admin/precificacao" />
    </>
  );
}
