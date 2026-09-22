import Link from "next/link";
import { Plus, Wrench } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { INTERVENTION_STATUS, INTERVENTION_TYPES, PRIORITY, enumOptions, labelOf } from "@/lib/catalogs";
import { clientOptions, propertyOptions, teamOptions } from "@/lib/options";
import { PENDING_INTERVENTION } from "@/lib/tree-filters";
import { fmtDate, fmtMoney } from "@/lib/format";
import { pageOf, spFlat, spGet, type SP } from "@/lib/query";
import { EmptyState, FlowStatusBadge, LinkButton, MobileCard, PageHeader, Pagination, PriorityBadge, ResponsiveTable } from "@/components/ui";
import { FilterForm, FilterSelect } from "@/components/filters";

export const metadata = { title: "Intervenções" };

export default async function InterventionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("interventions:read");
  const sp = await searchParams;
  const f = (k: string) => spGet(sp, k);
  const { page, pageSize, skip, take } = pageOf(sp, 30);
  const where: Prisma.InterventionWhereInput = {
    ...(f("pendentes") && { status: { in: [...PENDING_INTERVENTION] } }),
    ...(f("status") && { status: f("status") as never }),
    ...(f("tipo") && { type: f("tipo") }),
    ...(f("prioridade") && { priority: f("prioridade") as never }),
    ...(f("equipe") && { teamId: f("equipe") }),
    ...(f("cliente") && { tree: { property: { clientId: f("cliente") } } }),
    ...(f("propriedade") && { tree: { propertyId: f("propriedade") } }),
  };
  const [rows, total, sums, clients, properties, teams] = await Promise.all([
    db.intervention.findMany({
      where, skip, take, orderBy: [{ status: "asc" }, { priority: "desc" }, { scheduledAt: "asc" }],
      include: { tree: { select: { code: true, species: { select: { popularName: true } }, property: { select: { name: true } } } }, team: { select: { name: true } }, workOrder: { select: { id: true, number: true } } },
    }),
    db.intervention.count({ where }),
    db.intervention.aggregate({ where, _sum: { estimatedCost: true, actualCost: true } }),
    clientOptions(), propertyOptions(), teamOptions(),
  ]);
  return (
    <>
      <PageHeader title="Intervenções" subtitle={`Previsto ${fmtMoney(sums._sum.estimatedCost ?? 0)} · realizado ${fmtMoney(sums._sum.actualCost ?? 0)}`}
        actions={hasPermission(user.permissions, "interventions:write") && <LinkButton href="/intervencoes/nova" variant="primary" icon={Plus}>Nova intervenção</LinkButton>} />
      <FilterForm>
        <FilterSelect name="pendentes" label="Situação" options={[{ value: "1", label: "Somente pendentes" }]} value={f("pendentes")} />
        <FilterSelect name="status" label="Status" options={enumOptions(INTERVENTION_STATUS)} value={f("status")} />
        <FilterSelect name="tipo" label="Tipo" options={INTERVENTION_TYPES} value={f("tipo")} />
        <FilterSelect name="prioridade" label="Prioridade" options={enumOptions(PRIORITY)} value={f("prioridade")} />
        <FilterSelect name="equipe" label="Equipe" options={teams} value={f("equipe")} />
        <FilterSelect name="cliente" label="Cliente" options={clients} value={f("cliente")} />
        <FilterSelect name="propriedade" label="Propriedade" options={properties} value={f("propriedade")} />
      </FilterForm>
      {rows.length === 0 ? <EmptyState icon={Wrench} title="Nenhuma intervenção encontrada" /> : (
        <ResponsiveTable
          head={<tr><th>Tipo</th><th>Árvore</th><th>Programada</th><th>Executada</th><th>Equipe</th><th>OS</th><th>Custo</th><th>Prioridade</th><th>Status</th></tr>}
          mobile={rows.map((i) => (
            <MobileCard key={i.id} href={`/intervencoes/${i.id}`} title={labelOf(INTERVENTION_TYPES, i.type)} subtitle={`${i.tree.code} · ${i.tree.property.name} · ${fmtDate(i.scheduledAt)}`}
              right={<FlowStatusBadge value={i.status} labels={INTERVENTION_STATUS} />}><PriorityBadge value={i.priority} /></MobileCard>
          ))}
        >
          {rows.map((i) => (
            <tr key={i.id}>
              <td><Link className="link" href={`/intervencoes/${i.id}`}>{labelOf(INTERVENTION_TYPES, i.type)}</Link></td>
              <td><Link className="font-mono hover:underline" href={`/arvores/${i.tree.code}`}>{i.tree.code}</Link><div className="text-xs text-stone-500">{i.tree.property.name}</div></td>
              <td className="whitespace-nowrap">{fmtDate(i.scheduledAt)}</td>
              <td className="whitespace-nowrap">{fmtDate(i.executedAt)}</td>
              <td>{i.team?.name ?? "—"}</td>
              <td>{i.workOrder ? <Link className="link" href={`/ordens-servico/${i.workOrder.id}`}>{i.workOrder.number}</Link> : "—"}</td>
              <td className="whitespace-nowrap">{fmtMoney(i.actualCost ?? i.estimatedCost)}</td>
              <td><PriorityBadge value={i.priority} /></td>
              <td><FlowStatusBadge value={i.status} labels={INTERVENTION_STATUS} /></td>
            </tr>
          ))}
        </ResponsiveTable>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/intervencoes" />
    </>
  );
}
