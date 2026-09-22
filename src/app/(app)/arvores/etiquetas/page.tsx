import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { treeWhere } from "@/lib/tree-filters";
import { treeQrSvg } from "@/lib/qr";
import { getSettings } from "@/lib/settings";
import type { SP } from "@/lib/query";
import { PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { QrLabel } from "@/components/qr-label";

export const metadata = { title: "Etiquetas QR" };

export default async function LabelsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission("trees:read");
  const sp = await searchParams;
  const trees = await db.tree.findMany({ where: treeWhere(sp), orderBy: { code: "asc" }, take: 300, include: { species: true, property: true, sector: true } });
  const settings = await getSettings();
  const labels = await Promise.all(trees.map(async (t) => ({ t, qr: await treeQrSvg(t.code, 160) })));
  return (
    <>
      <div className="no-print">
        <PageHeader title="Etiquetas QR" subtitle={`${trees.length} etiqueta(s) — filtros da lista de exemplares aplicados (máx. 300)`} back={{ href: "/arvores", label: "Exemplares" }} actions={<PrintButton />} />
      </div>
      <div className="flex flex-wrap gap-[3mm]">
        {labels.map(({ t, qr }) => (
          <QrLabel key={t.id} svg={qr.svg} code={t.code} company={settings.company_name}
            species={t.species ? `${t.species.popularName} (${t.species.scientificName})` : null}
            place={`${t.property.name}${t.sector ? ` › ${t.sector.name}` : ""}`} />
        ))}
      </div>
    </>
  );
}
