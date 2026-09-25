import Link from "next/link";
import { MapPinned, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { PROPERTY_OWNERSHIP, PROPERTY_TYPES, labelOf } from "@/lib/catalogs";
import { clientOptions } from "@/lib/options";
import { ci, pageOf, spFlat, spGet, type SP } from "@/lib/query";
import { fmtNum } from "@/lib/format";
import { Badge, EmptyState, LinkButton, MobileCard, PageHeader, Pagination, ResponsiveTable } from "@/components/ui";
import { FilterForm, FilterSelect, SearchBox } from "@/components/filters";

export const metadata = { title: "Propriedades" };

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("properties:read");
  const sp = await searchParams;
  const q = spGet(sp, "q");
  const clientId = spGet(sp, "cliente");
  const type = spGet(sp, "tipo");
  const ownership = spGet(sp, "identificacao");
  const { page, pageSize, skip, take } = pageOf(sp);
  const where: Prisma.PropertyWhereInput = {
    ...(q && { OR: [{ name: ci(q) }, { address: ci(q) }, { city: ci(q) }, { district: ci(q) }] }),
    ...(clientId && { clientId }),
    ...(type && { propertyType: type }),
    ...(ownership && { ownership }),
  };
  const [rows, total, clients] = await Promise.all([
    db.property.findMany({ where, skip, take, orderBy: { name: "asc" }, include: { client: { select: { legalName: true, tradeName: true } }, _count: { select: { trees: true, sectors: true } } } }),
    db.property.count({ where }),
    clientOptions(),
  ]);
  return (
    <>
      <PageHeader title="Propriedades" subtitle="Locais atendidos e seus setores" actions={hasPermission(user.permissions, "properties:write") && <LinkButton href="/propriedades/nova" variant="primary" icon={Plus}>Nova propriedade</LinkButton>} />
      <FilterForm>
        <SearchBox defaultValue={q} />
        <FilterSelect name="cliente" label="Cliente" options={clients} value={clientId} />
        <FilterSelect name="tipo" label="Tipo" options={PROPERTY_TYPES} value={type} />
        <FilterSelect name="identificacao" label="Pública/privada" options={PROPERTY_OWNERSHIP} value={ownership} />
      </FilterForm>
      {rows.length === 0 ? <EmptyState icon={MapPinned} title="Nenhuma propriedade encontrada" /> : (
        <ResponsiveTable
          head={<tr><th>Propriedade</th><th>Cliente</th><th>Identificação</th><th>Tipo</th><th>Cidade</th><th>Área</th><th>Setores</th><th>Árvores</th></tr>}
          mobile={rows.map((p) => (
            <MobileCard key={p.id} href={`/propriedades/${p.id}`} title={p.name} subtitle={`${p.client.tradeName ?? p.client.legalName}${p.ownership ? ` · ${labelOf(PROPERTY_OWNERSHIP, p.ownership)}` : ""} · ${p.city ?? ""}`}
              right={<Badge tone="green">{p._count.trees} árvores</Badge>} />
          ))}
        >
          {rows.map((p) => (
            <tr key={p.id}>
              <td><Link className="link" href={`/propriedades/${p.id}`}>{p.name}</Link>{!p.active && <Badge className="ml-2">Inativa</Badge>}</td>
              <td>{p.client.tradeName ?? p.client.legalName}</td>
              <td>{p.ownership ? <Badge tone={p.ownership === "PUBLICA" ? "blue" : "gray"}>{labelOf(PROPERTY_OWNERSHIP, p.ownership)}</Badge> : "—"}</td>
              <td>{labelOf(PROPERTY_TYPES, p.propertyType)}</td>
              <td>{p.city ? `${p.city}/${p.state ?? ""}` : "—"}</td>
              <td className="whitespace-nowrap">{fmtNum(p.totalArea, "m²")}</td>
              <td className="tabular-nums">{p._count.sectors}</td>
              <td className="tabular-nums font-semibold">{p._count.trees}</td>
            </tr>
          ))}
        </ResponsiveTable>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/propriedades" />
    </>
  );
}
