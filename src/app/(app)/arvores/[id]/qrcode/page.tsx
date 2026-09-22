import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { findTreeId } from "@/lib/trees";
import { treeQrSvg } from "@/lib/qr";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { QrLabel } from "@/components/qr-label";

export const metadata = { title: "QR Code" };

export default async function TreeQrPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("trees:read");
  const ref = await findTreeId((await params).id);
  if (!ref) notFound();
  const t = await db.tree.findUniqueOrThrow({ where: { id: ref.id }, include: { species: true, property: true, sector: true } });
  const [{ svg, url }, big, settings] = await Promise.all([treeQrSvg(t.code, 180), treeQrSvg(t.code, 320), getSettings()]);
  const species = t.species ? `${t.species.popularName} (${t.species.scientificName})` : null;
  const place = `${t.property.name}${t.sector ? ` › ${t.sector.name}` : ""}`;
  return (
    <>
      <div className="no-print">
        <PageHeader title={`QR Code — ${t.code}`} back={{ href: `/arvores/${t.code}`, label: "Ficha" }}
          actions={<><a className="btn btn-secondary" href={`/api/qrcode/${t.code}?format=png`} download={`${t.code}.png`}><Download className="size-4" /> PNG</a><PrintButton label="Imprimir etiquetas" /></>} />
        <div className="card mb-6 flex flex-col items-center gap-3 p-6 text-center">
          <div className="size-64 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: big.svg }} />
          <p className="font-mono text-xl font-bold">{t.code}</p>
          <p className="text-sm break-all text-stone-500">{url}</p>
          <p className="max-w-md text-xs text-stone-500">Ao escanear, o celular abre a ficha do exemplar (login necessário). Use etiquetas de alumínio ou PVC resistentes a intempéries.</p>
        </div>
        <h2 className="mb-2 text-sm font-semibold text-stone-600">Pré-visualização da folha de etiquetas (6 cópias)</h2>
      </div>
      <div className="flex flex-wrap gap-[3mm]">
        {Array.from({ length: 6 }).map((_, i) => (
          <QrLabel key={i} svg={svg} code={t.code} species={species} place={place} company={settings.company_name} />
        ))}
      </div>
    </>
  );
}
