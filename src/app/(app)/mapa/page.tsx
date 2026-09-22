import { requirePermission } from "@/lib/auth/session";
import { loadMapPoints } from "@/lib/tree-points";
import { treeFilterOptions, treeWhere } from "@/lib/tree-filters";
import { spGet, type SP } from "@/lib/query";
import { PageHeader } from "@/components/ui";
import { TreeFilters } from "@/components/tree-filters";
import { MapView } from "./map-view";

export const metadata = { title: "Mapa" };

export default async function MapPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission("trees:read");
  const sp = await searchParams;
  const [points, options] = await Promise.all([loadMapPoints(treeWhere(sp)), treeFilterOptions()]);
  return (
    <>
      <PageHeader title="Mapa de exemplares" subtitle={`${points.length} árvore(s) georreferenciada(s) · OpenStreetMap · WGS84`} />
      <details className="mb-3 lg:open" open>
        <summary className="mb-2 cursor-pointer text-sm font-medium text-stone-600 lg:hidden">Filtros</summary>
        <TreeFilters sp={sp} options={options} action="/mapa" />
      </details>
      <MapView points={points} focus={spGet(sp, "focus")} />
    </>
  );
}
