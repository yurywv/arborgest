import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { SPECIES_ORIGIN, labelOf } from "@/lib/catalogs";
import { ci, spGet, type SP } from "@/lib/query";
import { Badge, LinkButton, PageHeader, ResponsiveTable, MobileCard } from "@/components/ui";
import { FilterForm, FilterSelect, SearchBox } from "@/components/filters";

export const metadata = { title: "Espécies" };

export default async function SpeciesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("trees:read");
  const sp = await searchParams;
  const q = spGet(sp, "q");
  const origin = spGet(sp, "origem");
  const rows = await db.species.findMany({
    where: { ...(q && { OR: [{ popularName: ci(q) }, { scientificName: ci(q) }, { family: ci(q) }] }), ...(origin && { origin }) },
    orderBy: { popularName: "asc" },
    include: { _count: { select: { trees: true } } },
  });
  const canWrite = hasPermission(user.permissions, "species:write");
  return (
    <>
      <PageHeader title="Espécies" subtitle="Catálogo botânico" actions={canWrite && <LinkButton href="/especies/nova" variant="primary" icon={Plus}>Nova espécie</LinkButton>} />
      <FilterForm>
        <SearchBox defaultValue={q} placeholder="Nome popular, científico ou família" />
        <FilterSelect name="origem" label="Origem" options={SPECIES_ORIGIN} value={origin} />
      </FilterForm>
      <ResponsiveTable
        head={<tr><th>Nome popular</th><th>Nome científico</th><th>Família</th><th>Origem</th><th>Árvores</th></tr>}
        mobile={rows.map((s) => (
          <MobileCard key={s.id} href={canWrite ? `/especies/${s.id}` : `/arvores?especie=${s.id}`} title={s.popularName} subtitle={s.scientificName} right={<Badge tone="green">{s._count.trees}</Badge>} />
        ))}
      >
        {rows.map((s) => (
          <tr key={s.id}>
            <td>{canWrite ? <Link className="link" href={`/especies/${s.id}`}>{s.popularName}</Link> : s.popularName}</td>
            <td className="italic">{s.scientificName}</td>
            <td>{s.family ?? "—"}</td>
            <td className="space-x-1">{labelOf(SPECIES_ORIGIN, s.origin)} {s.invasive && <Badge tone="red">Invasora</Badge>}</td>
            <td><Link className="link" href={`/arvores?especie=${s.id}`}>{s._count.trees}</Link></td>
          </tr>
        ))}
      </ResponsiveTable>
    </>
  );
}
