import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { SPECIES_ORIGIN, labelOf } from "@/lib/catalogs";
import { ci, pageOf, spFlat, spGet, type SP } from "@/lib/query";
import type { Prisma } from "@prisma/client";
import { Badge, LinkButton, PageHeader, Pagination, ResponsiveTable, MobileCard } from "@/components/ui";
import { FilterForm, FilterSelect, SearchBox } from "@/components/filters";

export const metadata = { title: "Espécies" };

export default async function SpeciesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("trees:read");
  const sp = await searchParams;
  const q = spGet(sp, "q");
  const origin = spGet(sp, "origem");
  const invasive = spGet(sp, "invasora");
  const used = spGet(sp, "uso");
  const { page, pageSize, skip, take } = pageOf(sp, 50);
  const where: Prisma.SpeciesWhereInput = {
    ...(q && { OR: [{ popularName: ci(q) }, { scientificName: ci(q) }, { family: ci(q) }, { nativeRange: ci(q) }, { notes: ci(q) }] }),
    ...(origin && { origin }),
    ...(invasive && { invasive: invasive === "sim" }),
    ...(used === "com" && { trees: { some: {} } }),
    ...(used === "sem" && { trees: { none: {} } }),
  };
  const [rows, total] = await Promise.all([
    db.species.findMany({ where, skip, take, orderBy: { popularName: "asc" }, include: { _count: { select: { trees: true } } } }),
    db.species.count({ where }),
  ]);
  const canWrite = hasPermission(user.permissions, "species:write");
  return (
    <>
      <PageHeader title="Espécies" subtitle={`Catálogo botânico · ${total} espécie(s)`} actions={canWrite && <LinkButton href="/especies/nova" variant="primary" icon={Plus}>Nova espécie</LinkButton>} />
      <FilterForm>
        <SearchBox defaultValue={q} />
        <FilterSelect name="origem" label="Origem" options={SPECIES_ORIGIN} value={origin} />
        <FilterSelect name="invasora" label="Invasora" options={[{ value: "sim", label: "Sim" }, { value: "nao", label: "Não" }]} value={invasive} />
        <FilterSelect name="uso" label="Árvores" options={[{ value: "com", label: "Com árvores" }, { value: "sem", label: "Sem árvores" }]} value={used} />
      </FilterForm>
      <ResponsiveTable
        head={<tr><th>Nome popular</th><th>Nome científico</th><th>Família</th><th>Origem</th><th>Distribuição natural</th><th>Árvores</th></tr>}
        mobile={rows.map((s) => (
          <MobileCard key={s.id} href={canWrite ? `/especies/${s.id}` : `/arvores?especie=${s.id}`} title={s.popularName} subtitle={s.scientificName} right={<Badge tone="green">{s._count.trees}</Badge>} />
        ))}
      >
        {rows.map((s) => (
          <tr key={s.id}>
            <td>{canWrite ? <Link className="link" href={`/especies/${s.id}`}>{s.popularName}</Link> : s.popularName}</td>
            <td className="italic">{s.scientificName}</td>
            <td>{s.family ?? "—"}</td>
            <td className="space-x-1 whitespace-nowrap">{labelOf(SPECIES_ORIGIN, s.origin)} {s.invasive && <Badge tone="red">Invasora</Badge>}</td>
            <td className="text-xs text-stone-600">{s.nativeRange ?? "—"}</td>
            <td><Link className="link" href={`/arvores?especie=${s.id}`}>{s._count.trees}</Link></td>
          </tr>
        ))}
      </ResponsiveTable>
      <Pagination page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/especies" />
    </>
  );
}
