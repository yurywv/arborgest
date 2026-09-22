/** Etiqueta de campo (≈ 60 × 40 mm) com QR Code. */
export function QrLabel({ svg, code, species, place, company }: { svg: string; code: string; species?: string | null; place?: string | null; company: string }) {
  return (
    <div className="flex h-[40mm] w-[62mm] items-center gap-2 overflow-hidden rounded-md border border-stone-400 bg-white p-[2mm] break-inside-avoid">
      <div className="size-[34mm] shrink-0 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="min-w-0 leading-tight">
        <p className="text-[7pt] font-semibold tracking-wide text-stone-500 uppercase">{company}</p>
        <p className="font-mono text-[12pt] font-bold text-stone-900">{code}</p>
        {species && <p className="mt-0.5 line-clamp-2 text-[7.5pt] text-stone-700">{species}</p>}
        {place && <p className="mt-0.5 line-clamp-2 text-[6.5pt] text-stone-500">{place}</p>}
      </div>
    </div>
  );
}
