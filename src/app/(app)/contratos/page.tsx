import Link from "next/link";
import { FileSignature, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { CONTRACT_STATUS, PERIODICITY, enumOptions, labelOf } from "@/lib/catalogs";
import { clientOptions } from "@/lib/options";
import { daysFromNow, fmtDate, fmtMoney } from "@/lib/format";
import { ci, pageOf, spFlat, spGet, type SP } from "@/lib/query";
import { Badge, EmptyState, LinkButton, MobileCard, PageHeader, Pagination, ResponsiveTable } from "@/components/ui";
import { FilterForm, FilterSelect, SearchBox } from "@/components/filters";

export const metadata = { title: "Contratos" };

function Expiry({ end, status }: { end: Date | null; status: string }) {
  const d = daysFromNow(end);
  if (status !== "ATIVO" || d === null) return null;
  if (d < 0) return <Badge tone="red">Vencido</Badge>;
  if (d <= 60) return <Badge tone="orange">Vence em {d} dias</Badge>;
  return null;
}

export default async function ContractsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("contracts:read");
  const sp = await searchParams;
  const q = spGet(sp, "q");
  const status = spGet(sp, "status");
  const clientId = spGet(sp, "cliente");
  const venc = spGet(sp, "vencimento");
  const { page, pageSize, skip, take } = pageOf(sp);
  const where: Prisma.ContractWhereInput = {
    ...(q && { OR: [{ number: ci(q) }, { object: ci(q) }] }),
    ...(status && { status: status as never }),
    ...(clientId && { clientId }),
    ...(venc === "60" && { status: "ATIVO", endDate: { lte: new Date(Date.now() + 60 * 86_400_000) } }),
  };
  const [rows, total, clients] = await Promise.all([
    db.contract.findMany({ where, skip, take, orderBy: { endDate: "asc" }, include: { client: { select: { legalName: true, tradeName: true } }, property: { select: { name: true } } } }),
    db.contract.count({ where }),
    clientOptions(),
  ]);
  return (
    <>
      <PageHeader title="Contratos" actions={hasPermission(user.permissions, "contracts:write") && <LinkButton href="/contratos/novo" variant="primary" icon={Plus}>Novo contrato</LinkButton>} />
      <FilterForm>
        <SearchBox defaultValue={q} placeholder="Número ou objeto" />
        <FilterSelect name="cliente" label="Cliente" options={clients} value={clientId} />
        <FilterSelect name="status" label="Status" options={enumOptions(CONTRACT_STATUS)} value={status} />
        <FilterSelect name="vencimento" label="Vencimento" options={[{ value: "60", label: "Próximos 60 dias" }]} value={venc} />
      </FilterForm>
      {rows.length === 0 ? <EmptyState icon={FileSignature} title="Nenhum contrato encontrado" /> : (
        <ResponsiveTable
          head={<tr><th>Número</th><th>Cliente</th><th>Vigência</th><th>Valor</th><th>Periodicidade</th><th>Status</th></tr>}
          mobile={rows.map((c) => (
            <MobileCard key={c.id} href={`/contratos/${c.id}`} title={c.number} subtitle={`${c.client.tradeName ?? c.client.legalName} · até ${fmtDate(c.endDate)}`}
              right={<Badge tone={c.status === "ATIVO" ? "green" : "gray"}>{CONTRACT_STATUS[c.status]}</Badge>}>
              <Expiry end={c.endDate} status={c.status} />
            </MobileCard>
          ))}
        >
          {rows.map((c) => (
            <tr key={c.id}>
              <td><Link href={`/contratos/${c.id}`} className="link">{c.number}</Link><div className="max-w-xs truncate text-xs text-stone-500">{c.object}</div></td>
              <td>{c.client.tradeName ?? c.client.legalName}{c.property && <div className="text-xs text-stone-500">{c.property.name}</div>}</td>
              <td className="whitespace-nowrap">{fmtDate(c.startDate)} – {fmtDate(c.endDate)} <div><Expiry end={c.endDate} status={c.status} /></div></td>
              <td className="whitespace-nowrap">{fmtMoney(c.value)}</td>
              <td>{labelOf(PERIODICITY, c.periodicity)}</td>
              <td><Badge tone={c.status === "ATIVO" ? "green" : "gray"}>{CONTRACT_STATUS[c.status]}</Badge></td>
            </tr>
          ))}
        </ResponsiveTable>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/contratos" />
    </>
  );
}
