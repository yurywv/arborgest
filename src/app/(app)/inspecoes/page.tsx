import Link from "next/link";
import { ClipboardCheck, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { CONDITION, INSPECTION_REASONS, PRIORITY, enumOptions, labelOf } from "@/lib/catalogs";
import { clientOptions, propertyOptions, userOptions } from "@/lib/options";
import { fmtDate } from "@/lib/format";
import { pageOf, spFlat, spGet, type SP } from "@/lib/query";
import { ConditionBadge, EmptyState, LinkButton, MobileCard, PageHeader, Pagination, PriorityBadge, ResponsiveTable } from "@/components/ui";
import { FilterForm, FilterSelect } from "@/components/filters";

export const metadata = { title: "Inspeções" };

export default async function InspectionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("inspections:read");
  const sp = await searchParams;
  const f = (k: string) => spGet(sp, k);
  const { page, pageSize, skip, take } = pageOf(sp, 30);
  const from = f("de");
  const to = f("ate");
  const where: Prisma.InspectionWhereInput = {
    ...(f("cliente") && { tree: { property: { clientId: f("cliente") } } }),
    ...(f("propriedade") && { tree: { propertyId: f("propriedade") } }),
    ...(f("tecnico") && { inspectorId: f("tecnico") }),
    ...(f("condicao") && { generalCondition: f("condicao") as never }),
    ...(f("prioridade") && { priority: f("prioridade") as never }),
    ...((from || to) && { inspectedAt: { ...(from && { gte: new Date(`${from}T00:00:00-03:00`) }), ...(to && { lte: new Date(`${to}T23:59:59-03:00`) }) } }),
  };
  const [rows, total, clients, properties, users] = await Promise.all([
    db.inspection.findMany({
      where, skip, take, orderBy: { inspectedAt: "desc" },
      include: { tree: { select: { code: true, species: { select: { popularName: true } }, property: { select: { name: true } } } }, inspector: { select: { name: true } }, _count: { select: { findings: true } } },
    }),
    db.inspection.count({ where }),
    clientOptions(), propertyOptions(), userOptions(),
  ]);
  return (
    <>
      <PageHeader title="Inspeções" subtitle="Histórico de vistorias técnicas" actions={hasPermission(user.permissions, "inspections:write") && <LinkButton href="/inspecoes/nova" variant="primary" icon={Plus}>Nova inspeção</LinkButton>} />
      <FilterForm>
        <FilterSelect name="cliente" label="Cliente" options={clients} value={f("cliente")} />
        <FilterSelect name="propriedade" label="Propriedade" options={properties} value={f("propriedade")} />
        <FilterSelect name="tecnico" label="Técnico" options={users} value={f("tecnico")} />
        <FilterSelect name="condicao" label="Condição" options={enumOptions(CONDITION)} value={f("condicao")} />
        <FilterSelect name="prioridade" label="Prioridade" options={enumOptions(PRIORITY)} value={f("prioridade")} />
        <label><span className="mb-0.5 block text-[11px] font-medium text-stone-500">De</span><input type="date" name="de" defaultValue={from} className="input min-h-10 py-1.5" /></label>
        <label><span className="mb-0.5 block text-[11px] font-medium text-stone-500">Até</span><input type="date" name="ate" defaultValue={to} className="input min-h-10 py-1.5" /></label>
        <button className="btn btn-secondary btn-sm hidden min-h-10 sm:inline-flex">Aplicar</button>
      </FilterForm>
      {rows.length === 0 ? <EmptyState icon={ClipboardCheck} title="Nenhuma inspeção encontrada" /> : (
        <ResponsiveTable
          head={<tr><th>Data</th><th>Árvore</th><th>Propriedade</th><th>Motivo</th><th>Técnico</th><th>Condição</th><th>Achados</th><th>Prioridade</th><th>Próxima</th></tr>}
          mobile={rows.map((i) => (
            <MobileCard key={i.id} href={`/inspecoes/${i.id}`} title={`${fmtDate(i.inspectedAt)} · ${i.tree.code}`} subtitle={`${i.tree.species?.popularName ?? "—"} · ${i.tree.property.name}`}
              right={<ConditionBadge value={i.generalCondition} />}>
              <PriorityBadge value={i.priority} />
            </MobileCard>
          ))}
        >
          {rows.map((i) => (
            <tr key={i.id}>
              <td className="whitespace-nowrap"><Link className="link" href={`/inspecoes/${i.id}`}>{fmtDate(i.inspectedAt)}</Link></td>
              <td><Link className="font-mono hover:underline" href={`/arvores/${i.tree.code}`}>{i.tree.code}</Link><div className="text-xs text-stone-500">{i.tree.species?.popularName ?? "—"}</div></td>
              <td>{i.tree.property.name}</td>
              <td>{labelOf(INSPECTION_REASONS, i.reason)}</td>
              <td>{i.inspector?.name ?? "—"}</td>
              <td><ConditionBadge value={i.generalCondition} /></td>
              <td className="tabular-nums">{i._count.findings}</td>
              <td><PriorityBadge value={i.priority} /></td>
              <td className="whitespace-nowrap">{fmtDate(i.nextInspectionAt)}</td>
            </tr>
          ))}
        </ResponsiveTable>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/inspecoes" />
    </>
  );
}
