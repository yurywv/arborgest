import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { PRIORITY, SERVICES, WORK_ORDER_STATUS, enumOptions, labelOf } from "@/lib/catalogs";
import { clientOptions, teamOptions } from "@/lib/options";
import { daysFromNow, fmtDate, fmtMoney } from "@/lib/format";
import { ci, pageOf, spFlat, spGet, type SP } from "@/lib/query";
import { Badge, EmptyState, FlowStatusBadge, LinkButton, MobileCard, PageHeader, Pagination, PriorityBadge, ResponsiveTable } from "@/components/ui";
import { FilterForm, FilterSelect, SearchBox } from "@/components/filters";

export const metadata = { title: "Ordens de serviço" };

const OPEN = ["ABERTA", "PROGRAMADA", "EM_EXECUCAO"] as const;

export default async function WorkOrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("workorders:read");
  const sp = await searchParams;
  const f = (k: string) => spGet(sp, k);
  const { page, pageSize, skip, take } = pageOf(sp, 30);
  const where: Prisma.WorkOrderWhereInput = {
    ...(f("q") && { OR: [{ number: ci(f("q")!) }, { description: ci(f("q")!) }] }),
    ...(f("abertas") && { status: { in: [...OPEN] } }),
    ...(f("atrasadas") && { status: { in: [...OPEN] }, scheduledAt: { lt: new Date() } }),
    ...(f("status") && { status: f("status") as never }),
    ...(f("cliente") && { clientId: f("cliente") }),
    ...(f("equipe") && { teamId: f("equipe") }),
    ...(f("prioridade") && { priority: f("prioridade") as never }),
    ...(f("servico") && { service: f("servico") }),
  };
  const [rows, total, clients, teams] = await Promise.all([
    db.workOrder.findMany({ where, skip, take, orderBy: [{ scheduledAt: "asc" }], include: { client: { select: { legalName: true, tradeName: true } }, property: { select: { name: true } }, team: { select: { name: true } }, _count: { select: { trees: true } } } }),
    db.workOrder.count({ where }),
    clientOptions(), teamOptions(),
  ]);
  const Late = ({ d, status }: { d: Date | null; status: string }) => (OPEN.includes(status as never) && d && (daysFromNow(d) ?? 0) < 0 ? <Badge tone="red">Atrasada</Badge> : null);
  return (
    <>
      <PageHeader title="Ordens de serviço" actions={hasPermission(user.permissions, "workorders:write") && <LinkButton href="/ordens-servico/nova" variant="primary" icon={Plus}>Nova OS</LinkButton>} />
      <FilterForm>
        <SearchBox defaultValue={f("q")} placeholder="Número ou descrição" />
        <FilterSelect name="abertas" label="Situação" options={[{ value: "1", label: "Somente abertas" }]} value={f("abertas")} />
        <FilterSelect name="atrasadas" label="Prazo" options={[{ value: "1", label: "Atrasadas" }]} value={f("atrasadas")} />
        <FilterSelect name="status" label="Status" options={enumOptions(WORK_ORDER_STATUS)} value={f("status")} />
        <FilterSelect name="cliente" label="Cliente" options={clients} value={f("cliente")} />
        <FilterSelect name="equipe" label="Equipe" options={teams} value={f("equipe")} />
        <FilterSelect name="prioridade" label="Prioridade" options={enumOptions(PRIORITY)} value={f("prioridade")} />
        <FilterSelect name="servico" label="Serviço" options={SERVICES} value={f("servico")} />
      </FilterForm>
      {rows.length === 0 ? <EmptyState icon={ClipboardList} title="Nenhuma OS encontrada" /> : (
        <ResponsiveTable
          head={<tr><th>Número</th><th>Cliente / propriedade</th><th>Serviço</th><th>Árvores</th><th>Prevista</th><th>Equipe</th><th>Custo</th><th>Prioridade</th><th>Status</th></tr>}
          mobile={rows.map((w) => (
            <MobileCard key={w.id} href={`/ordens-servico/${w.id}`} title={`${w.number} · ${labelOf(SERVICES, w.service)}`} subtitle={`${w.client.tradeName ?? w.client.legalName} · ${fmtDate(w.scheduledAt)}`}
              right={<FlowStatusBadge value={w.status} labels={WORK_ORDER_STATUS} />}>
              <PriorityBadge value={w.priority} /><Late d={w.scheduledAt} status={w.status} />
            </MobileCard>
          ))}
        >
          {rows.map((w) => (
            <tr key={w.id}>
              <td className="font-mono whitespace-nowrap"><Link className="link" href={`/ordens-servico/${w.id}`}>{w.number}</Link></td>
              <td>{w.client.tradeName ?? w.client.legalName}{w.property && <div className="text-xs text-stone-500">{w.property.name}</div>}</td>
              <td>{labelOf(SERVICES, w.service)}</td>
              <td className="tabular-nums">{w._count.trees}</td>
              <td className="whitespace-nowrap">{fmtDate(w.scheduledAt)} <Late d={w.scheduledAt} status={w.status} /></td>
              <td>{w.team?.name ?? "—"}</td>
              <td className="whitespace-nowrap">{fmtMoney(w.cost)}</td>
              <td><PriorityBadge value={w.priority} /></td>
              <td><FlowStatusBadge value={w.status} labels={WORK_ORDER_STATUS} /></td>
            </tr>
          ))}
        </ResponsiveTable>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/ordens-servico" />
    </>
  );
}
