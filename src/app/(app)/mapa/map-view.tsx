"use client";
import { useState } from "react";
import { TreeMap } from "@/components/map";
import type { MapPoint } from "@/components/map/types";
import { CONDITION, RISK_LEVEL } from "@/lib/catalogs";

const CONDITION_COLOR: Record<string, string> = { OTIMA: "#059669", BOA: "#65a30d", REGULAR: "#d97706", RUIM: "#ea580c", CRITICA: "#dc2626" };
const RISK_COLOR: Record<string, string> = { BAIXO: "#059669", MODERADO: "#d97706", ALTO: "#ea580c", EXTREMO: "#b91c1c" };

export function MapView({ points, focus }: { points: MapPoint[]; focus?: string }) {
  const [colorBy, setColorBy] = useState<"condition" | "risk">("condition");
  const legend = colorBy === "risk" ? RISK_LEVEL : CONDITION;
  const colors = colorBy === "risk" ? RISK_COLOR : CONDITION_COLOR;
  return (
    <div className="relative h-[calc(100dvh-15rem)] min-h-96 overflow-hidden rounded-2xl border border-stone-200 lg:h-[calc(100dvh-13rem)]">
      <TreeMap points={points} colorBy={colorBy} focus={focus} />
      <div className="absolute right-2 bottom-2 z-[500] rounded-xl bg-white/95 p-2.5 text-xs shadow-md">
        <div className="mb-1.5 flex gap-1">
          <button onClick={() => setColorBy("condition")} className={`rounded-md px-2 py-1 font-semibold ${colorBy === "condition" ? "bg-brand-600 text-white" : "bg-stone-100"}`}>Condição</button>
          <button onClick={() => setColorBy("risk")} className={`rounded-md px-2 py-1 font-semibold ${colorBy === "risk" ? "bg-brand-600 text-white" : "bg-stone-100"}`}>Risco</button>
        </div>
        <ul className="space-y-0.5">
          {Object.entries(legend).map(([k, v]) => (
            <li key={k} className="flex items-center gap-1.5"><span className="size-3 rounded-full" style={{ background: colors[k] }} />{v}</li>
          ))}
          <li className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-stone-400" />Sem avaliação</li>
          <li className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-stone-500" />Inativa (morta/removida)</li>
        </ul>
      </div>
    </div>
  );
}
