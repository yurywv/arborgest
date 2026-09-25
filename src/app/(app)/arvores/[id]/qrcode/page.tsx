import Link from "next/link";
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

const COPIES = [1, 2, 6, 12];

export default async function TreeQrPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nova?: string; copias?: string }> }) {
  await requirePermission("trees:read");
  const sp = await searchParams;
  const copies = COPIES.includes(Number(sp.copias)) ? Number(sp.copias) : 6;
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
        {sp.nova && (
          <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
            Exemplar cadastrado. Etiqueta QR Code gerada com o ID individual <strong className="font-mono">{t.code}</strong>. <Link className="link" href={`/arvores/${t.code}`}>Abrir a ficha</Link>
          </p>
        )}
        <div className="card mb-6 flex flex-col items-center gap-3 p-6 text-center">
          <div className="size-64 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: big.svg }} />
          <p className="font-mono text-xl font-bold">{t.code}</p>
          <p className="text-sm break-all text-stone-500">{url}</p>
          <p className="max-w-md text-xs text-stone-500">Ao escanear, o celular abre a ficha do exemplar (login necessário). Use etiquetas de alumínio ou PVC resistentes a intempéries.</p>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-stone-600">Folha de etiquetas:</h2>
          {COPIES.map((n) => (
            <Link key={n} href={`?copias=${n}`} className={`btn btn-sm ${n === copies ? "btn-primary" : "btn-secondary"}`} aria-current={n === copies}>{n} {n === 1 ? "cópia" : "cópias"}</Link>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-[3mm]">
        {Array.from({ length: copies }).map((_, i) => (
          <QrLabel key={i} svg={svg} code={t.code} species={species} place={place} company={settings.company_name} />
        ))}
      </div>
    </>
  );
}
