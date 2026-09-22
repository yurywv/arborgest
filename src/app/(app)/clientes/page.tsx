import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { CLIENT_STATUS, CLIENT_TYPES, enumOptions, labelOf } from "@/lib/catalogs";
import { ci, pageOf, spFlat, spGet, type SP } from "@/lib/query";
import { formatDocument } from "@/lib/format";
import { Badge, EmptyState, LinkButton, MobileCard, PageHeader, Pagination, ResponsiveTable } from "@/components/ui";
import { FilterForm, FilterSelect, SearchBox } from "@/components/filters";

export const metadata = { title: "Clientes" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("clients:read");
  const sp = await searchParams;
  const q = spGet(sp, "q");
  const status = spGet(sp, "status");
  const type = spGet(sp, "tipo");
  const { page, pageSize, skip, take } = pageOf(sp);

  const where: Prisma.ClientWhereInput = {
    ...(q && { OR: [{ legalName: ci(q) }, { tradeName: ci(q) }, { document: { contains: q.replace(/\D/g, "") || q } }, { city: ci(q) }] }),
    ...(status && { status: status as never }),
    ...(type && { clientType: type }),
  };
  const [rows, total] = await Promise.all([
    db.client.findMany({
      where, skip, take, orderBy: { legalName: "asc" },
      include: { _count: { select: { properties: true, contracts: true } } },
    }),
    db.client.count({ where }),
  ]);
  const statusTone = { ATIVO: "green", PROSPECT: "blue", INATIVO: "gray" } as const;

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Carteira de clientes e prospects"
        actions={hasPermission(user.permissions, "clients:write") && <LinkButton href="/clientes/novo" variant="primary" icon={Plus}>Novo cliente</LinkButton>}
      />
      <FilterForm>
        <SearchBox defaultValue={q} placeholder="Nome, CNPJ ou cidade" />
        <FilterSelect name="status" label="Status" options={enumOptions(CLIENT_STATUS)} value={status} />
        <FilterSelect name="tipo" label="Tipo" options={CLIENT_TYPES} value={type} />
      </FilterForm>

      {rows.length === 0 ? (
        <EmptyState icon={Building2} title="Nenhum cliente encontrado" description="Ajuste os filtros ou cadastre um novo cliente." />
      ) : (
        <ResponsiveTable
          head={<tr><th>Cliente</th><th>CPF/CNPJ</th><th>Tipo</th><th>Cidade</th><th>Propriedades</th><th>Status</th></tr>}
          mobile={rows.map((c) => (
            <MobileCard key={c.id} href={`/clientes/${c.id}`} title={c.tradeName ?? c.legalName} subtitle={`${c.city ?? "—"} · ${c._count.properties} propriedade(s)`}
              right={<Badge tone={statusTone[c.status]}>{CLIENT_STATUS[c.status]}</Badge>} />
          ))}
        >
          {rows.map((c) => (
            <tr key={c.id}>
              <td>
                <Link href={`/clientes/${c.id}`} className="link">{c.tradeName ?? c.legalName}</Link>
                {c.tradeName && <div className="text-xs text-stone-500">{c.legalName}</div>}
              </td>
              <td className="whitespace-nowrap">{formatDocument(c.document)}</td>
              <td>{labelOf(CLIENT_TYPES, c.clientType)}</td>
              <td>{c.city ? `${c.city}/${c.state ?? ""}` : "—"}</td>
              <td className="tabular-nums">{c._count.properties}</td>
              <td><Badge tone={statusTone[c.status]}>{CLIENT_STATUS[c.status]}</Badge></td>
            </tr>
          ))}
        </ResponsiveTable>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/clientes" />
    </>
  );
}
