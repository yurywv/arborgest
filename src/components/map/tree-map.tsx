"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import Link from "next/link";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { CONDITION, RISK_LEVEL, TREE_STATUS } from "@/lib/catalogs";
import { navLinks } from "@/lib/arbo";
import type { MapPoint } from "./types";

const CONDITION_COLOR: Record<string, string> = { OTIMA: "#059669", BOA: "#65a30d", REGULAR: "#d97706", RUIM: "#ea580c", CRITICA: "#dc2626" };
const RISK_COLOR: Record<string, string> = { BAIXO: "#059669", MODERADO: "#d97706", ALTO: "#ea580c", EXTREMO: "#b91c1c" };
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export type ColorBy = "condition" | "risk";

export function colorFor(p: MapPoint, by: ColorBy) {
  if (p.status !== "ATIVA") return "#78716c";
  if (by === "risk") return p.risk ? RISK_COLOR[p.risk] : "#a8a29e";
  return p.condition ? CONDITION_COLOR[p.condition] : "#a8a29e";
}

function FitBounds({ points, focus }: { points: MapPoint[]; focus?: string }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const f = focus ? points.find((p) => p.code === focus) : undefined;
    if (f) {
      map.setView([f.lat, f.lng], 19, { animate: false });
      return;
    }
    const b = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(b, { padding: [40, 40], maxZoom: 18, animate: false });
  }, [points, map, focus]);
  return null;
}

export default function TreeMap({
  points,
  colorBy = "condition",
  height = "100%",
  compact = false,
  focus,
}: {
  points: MapPoint[];
  colorBy?: ColorBy;
  height?: string;
  compact?: boolean;
  focus?: string;
}) {
  const center = useMemo<[number, number]>(() => (points[0] ? [points[0].lat, points[0].lng] : [-22.9, -47.06]), [points]);
  return (
    <MapContainer center={center} zoom={15} style={{ height, width: "100%" }} scrollWheelZoom={!compact} className="rounded-2xl">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <FitBounds points={points} focus={focus} />
      {points.map((p) => {
        const links = navLinks(p.lat, p.lng, p.code);
        return (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={p.code === focus ? 13 : compact ? 6 : 9}
            pathOptions={{ color: p.code === focus ? "#1c1917" : "#fff", weight: p.code === focus ? 3 : 2, fillColor: colorFor(p, colorBy), fillOpacity: 0.95 }}
          >
            <Popup minWidth={220} maxWidth={260}>
              <div className="space-y-1.5 text-[13px]">
                {p.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.photoUrl} alt="" className="h-28 w-full rounded-lg object-cover" loading="lazy" />
                )}
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-sm">{p.code}</strong>
                  <span className="text-xs text-stone-500">{TREE_STATUS[p.status]}</span>
                </div>
                <div>
                  {p.species ?? "Espécie não identificada"}
                  {p.scientific && <em className="block text-xs text-stone-500">{p.scientific}</em>}
                </div>
                {p.property && <div className="text-xs text-stone-500">{p.property}</div>}
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                  <span>DAP: <b>{p.dap ? `${p.dap} cm` : "—"}</b></span>
                  <span>Altura: <b>{p.height ? `${p.height} m` : "—"}</b></span>
                  <span>Condição: <b>{p.condition ? CONDITION[p.condition] : "—"}</b></span>
                  <span>Risco: <b>{p.risk ? RISK_LEVEL[p.risk] : "—"}</b></span>
                  <span>Últ. insp.: <b>{fmt(p.lastInspection)}</b></span>
                  <span>Próx. insp.: <b>{fmt(p.nextInspection)}</b></span>
                </div>
                <div className="flex gap-1.5 pt-1">
                  <Link href={`/arvores/${p.code}`} className="flex-1 rounded-lg bg-brand-600 px-2 py-2 text-center text-xs font-semibold !text-white">
                    Ver ficha completa
                  </Link>
                  <a href={links.googleDirections} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-stone-300 px-2 py-2 text-xs font-semibold !text-stone-700">
                    GPS
                  </a>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
