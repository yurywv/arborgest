import Link from "next/link";
import { Building2, ClipboardCheck, ClipboardList, MapPinned, Trees, Wrench, AlarmClock, CalendarClock, FileWarning, Plus, QrCode } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { dashboardData } from "@/lib/dashboard";
import { loadMapPoints } from "@/lib/tree-points";
import { CONDITION, INTERVENTION_TYPES, RISK_LEVEL, TREE_STATUS, labelOf } from "@/lib/catalogs";
import { daysFromNow, fmtDate } from "@/lib/format";
import { Card, LinkButton, PageHeader, PriorityBadge, StatCard, CONDITION_COLOR, RISK_COLOR } from "@/components/ui";
import { HBarChart } from "@/components/charts/bar-chart";
import { TreeMap } from "@/components/map";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requirePermission("dashboard:view");
  const [d, points] = await Promise.all([dashboardData(), loadMapPoints({})]);
  const c = d.counts;
  const ordered = <T extends { key: string | null; value: number }>(rows: T[], labels: Record<string, string>, colors?: Record<string, string>) => [
    ...Object.keys(labels).map((k) => ({ label: labels[k], value: rows.find((r) => r.key === k)?.value ?? 0, color: colors?.[k] })),
    ...(rows.some((r) => r.key === null) ? [{ label: "Sem avaliação", value: rows.find((r) => r.key === null)!.value, color: "#a8a29e" }] : []),
  ];

  return (
    <>
      <PageHeader
        title={`Olá, ${user.name.split(" ")[0]}`}
        subtitle="Visão geral da gestão arbórea"
        actions={
          <>
            <LinkButton href="/escanear" icon={QrCode} className="lg:hidden">Escanear</LinkButton>
            {hasPermission(user.permissions, "trees:write") && <LinkButton href="/arvores/novo" variant="primary" icon={Plus}>Nova árvore</LinkButton>}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Clientes" value={c.clients} icon={Building2} href="/clientes" />
        <StatCard label="Propriedades" value={c.properties} icon={MapPinned} href="/propriedades" />
        <StatCard label="Árvores cadastradas" value={c.trees} icon={Trees} href="/arvores" hint={`${c.activeTrees} ativas`} />
        <StatCard label="Inspeções realizadas" value={c.inspections} icon={ClipboardCheck} href="/inspecoes" />
        <StatCard label="Inspeções vencidas" value={c.overdue} icon={AlarmClock} tone={c.overdue ? "red" : "stone"} href="/arvores?inspecao=vencida" />
        <StatCard label="Inspeções em 30 dias" value={c.next30} icon={CalendarClock} tone="amber" href="/arvores?inspecao=30dias" />
        <StatCard label="Intervenções pendentes" value={c.pendingInterventions} icon={Wrench} tone="sky" href="/intervencoes?pendentes=1" />
        <StatCard label="OS abertas" value={c.openWorkOrders} icon={ClipboardList} tone="sky" href="/ordens-servico?abertas=1" hint={c.lateWorkOrders ? `${c.lateWorkOrders} atrasada(s)` : undefined} />
      </div>
      {c.expiringContracts > 0 && (
        <Link href="/contratos?vencimento=60" className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <FileWarning className="size-4" /> {c.expiringContracts} contrato(s) vencem nos próximos 60 dias.
        </Link>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Mapa geral" className="lg:col-span-2" bodyClassName="p-2" actions={<LinkButton size="sm" href="/mapa">Abrir mapa</LinkButton>}>
          <div className="h-80 lg:h-[25rem]"><TreeMap points={points} /></div>
        </Card>
        <Card title="Árvores por condição (ativas)">
          <HBarChart data={ordered(d.byCondition, CONDITION, CONDITION_COLOR)} />
          <div className="mt-4 border-t border-stone-100 pt-3">
            <h3 className="mb-2 text-sm font-semibold text-stone-800">Árvores por risco</h3>
            <HBarChart data={ordered(d.byRisk, RISK_LEVEL, RISK_COLOR)} />
          </div>
        </Card>
        <Card title="Árvores por espécie (top 10)" className="lg:col-span-2">
          <HBarChart data={d.bySpecies.map((s) => ({ label: s.label, value: s.value }))} />
        </Card>
        <Card title="Árvores por status">
          <HBarChart data={ordered(d.byStatus.map((s) => ({ key: s.key as string | null, value: s.value })), TREE_STATUS)} />
        </Card>
        <Card title="Intervenções prioritárias" className="lg:col-span-2" actions={<LinkButton size="sm" href="/intervencoes?pendentes=1">Ver todas</LinkButton>}>
          {d.priorityInterventions.length === 0 ? <p className="text-sm text-stone-500">Nenhuma intervenção urgente ou alta pendente.</p> : (
            <ul className="divide-y divide-stone-100">
              {d.priorityInterventions.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <Link href={`/intervencoes/${i.id}`} className="link">{labelOf(INTERVENTION_TYPES, i.type)}</Link>
                    <p className="truncate text-xs text-stone-500">
                      <Link href={`/arvores/${i.tree.code}`} className="font-mono">{i.tree.code}</Link> · {i.tree.species?.popularName ?? "—"} · {i.tree.property.name}
                    </p>
                  </div>
                  <PriorityBadge value={i.priority} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Inspeções vencidas e próximas">
          {d.upcoming.length === 0 ? <p className="text-sm text-stone-500">Nada para os próximos 30 dias.</p> : (
            <ul className="divide-y divide-stone-100">
              {d.upcoming.map((t) => {
                const days = daysFromNow(t.nextInspectionAt) ?? 0;
                return (
                  <li key={t.code} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <Link href={`/arvores/${t.code}`} className="link font-mono">{t.code}</Link>
                      <p className="truncate text-xs text-stone-500">{t.species?.popularName ?? "—"} · {t.property.name}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-semibold ${days < 0 ? "text-red-700" : "text-amber-700"}`}>{days < 0 ? `vencida há ${-days}d` : `em ${days}d`}</p>
                      <p className="text-xs text-stone-500">{fmtDate(t.nextInspectionAt)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
