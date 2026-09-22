import Link from "next/link";
import { Map, Plus, Printer, Trees } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { pageOf, spFlat, type SP } from "@/lib/query";
import { treeFilterOptions, treeWhere } from "@/lib/tree-filters";
import { daysFromNow, fmtDate, fmtNum } from "@/lib/format";
import { Badge, ConditionBadge, EmptyState, LinkButton, MobileCard, PageHeader, Pagination, ResponsiveTable, RiskBadge, TreeStatusBadge } from "@/components/ui";
import { TreeFilters } from "@/components/tree-filters";

export const metadata = { title: "Exemplares arbóreos" };

function NextInspection({ date }: { date: Date | null }) {
  const d = daysFromNow(date);
  if (d === null) return <span className="text-stone-400">—</span>;
  if (d < 0) return <Badge tone="red">Vencida {fmtDate(date)}</Badge>;
  if (d <= 30) return <Badge tone="yellow">{fmtDate(date)}</Badge>;
  return <span>{fmtDate(date)}</span>;
}

export default async function TreesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("trees:read");
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageOf(sp, 30);
  const where = treeWhere(sp);
  const [rows, total, options] = await Promise.all([
    db.tree.findMany({ where, skip, take, orderBy: { code: "asc" }, include: { species: true, property: { select: { name: true } }, sector: { select: { name: true } } } }),
    db.tree.count({ where }),
    treeFilterOptions(),
  ]);
  const qs = new URLSearchParams(Object.entries(spFlat(sp)).filter(([k, v]) => v && k !== "page") as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title="Exemplares arbóreos"
        subtitle={`${total} árvore(s) encontrada(s)`}
        actions={
          <>
            <LinkButton href={`/mapa?${qs}`} icon={Map}>Ver no mapa</LinkButton>
            <LinkButton href={`/arvores/etiquetas?${qs}`} icon={Printer}>Etiquetas QR</LinkButton>
            {hasPermission(user.permissions, "trees:write") && <LinkButton href="/arvores/novo" variant="primary" icon={Plus}>Nova árvore</LinkButton>}
          </>
        }
      />
      <TreeFilters sp={sp} options={options} />
      {rows.length === 0 ? (
        <EmptyState icon={Trees} title="Nenhum exemplar encontrado" description="Ajuste os filtros ou cadastre uma nova árvore." />
      ) : (
        <ResponsiveTable
          head={<tr><th>Código</th><th>Espécie</th><th>Propriedade / setor</th><th>DAP</th><th>Altura</th><th>Condição</th><th>Risco</th><th>Próx. inspeção</th><th>Status</th></tr>}
          mobile={rows.map((t) => (
            <MobileCard key={t.id} href={`/arvores/${t.code}`} title={<>{t.code} · <span className="font-normal">{t.species?.popularName ?? "Não identificada"}</span></>}
              subtitle={`${t.property.name}${t.sector ? ` › ${t.sector.name}` : ""} · DAP ${fmtNum(t.currentDap, "cm")}`} right={<TreeStatusBadge value={t.status} />}>
              <ConditionBadge value={t.currentCondition} /><RiskBadge value={t.currentRisk} /><NextInspection date={t.nextInspectionAt} />
            </MobileCard>
          ))}
        >
          {rows.map((t) => (
            <tr key={t.id}>
              <td className="font-mono"><Link href={`/arvores/${t.code}`} className="link">{t.code}</Link></td>
              <td>{t.species?.popularName ?? <span className="text-stone-400">Não identificada</span>}{t.species && <div className="text-xs text-stone-500 italic">{t.species.scientificName}</div>}</td>
              <td>{t.property.name}{t.sector && <div className="text-xs text-stone-500">{t.sector.name}</div>}</td>
              <td className="whitespace-nowrap tabular-nums">{fmtNum(t.currentDap, "cm")}</td>
              <td className="whitespace-nowrap tabular-nums">{fmtNum(t.currentHeight, "m")}</td>
              <td><ConditionBadge value={t.currentCondition} /></td>
              <td><RiskBadge value={t.currentRisk} /></td>
              <td className="whitespace-nowrap"><NextInspection date={t.nextInspectionAt} /></td>
              <td><TreeStatusBadge value={t.status} /></td>
            </tr>
          ))}
        </ResponsiveTable>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/arvores" />
    </>
  );
}
