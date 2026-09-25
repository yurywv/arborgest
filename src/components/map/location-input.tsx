"use client";

import { useState } from "react";
import { Crosshair, Loader2, MapPin } from "lucide-react";
import { useFormCtx } from "@/components/form";
import { COORD_SOURCES } from "@/lib/catalogs";
import { navLinks } from "@/lib/arbo";
import { LocationPicker } from ".";

export type LocationValue = {
  latitude?: number | null; longitude?: number | null; gpsAccuracy?: number | null; altitude?: number | null;
  gpsCapturedAt?: string | null; coordSource?: string | null;
};

const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Campos de localização + botão "Capturar minha localização" + mapa para ajuste fino. */
export function LocationInput({ value, fallback, simple }: { value?: LocationValue; fallback?: [number, number]; simple?: boolean }) {
  const { errors } = useFormCtx();
  const [lat, setLat] = useState(value?.latitude?.toString() ?? "");
  const [lng, setLng] = useState(value?.longitude?.toString() ?? "");
  const [acc, setAcc] = useState(value?.gpsAccuracy?.toString() ?? "");
  const [alt, setAlt] = useState(value?.altitude?.toString() ?? "");
  const [when, setWhen] = useState(value?.gpsCapturedAt ? toLocalInput(new Date(value.gpsCapturedAt)) : "");
  const [source, setSource] = useState(value?.coordSource ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const capture = () => {
    if (!("geolocation" in navigator)) {
      setMsg("Este dispositivo não oferece geolocalização.");
      return;
    }
    setBusy(true);
    setMsg("Obtendo posição… mantenha o aparelho parado e com céu aberto.");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = pos.coords;
        setLat(c.latitude.toFixed(7));
        setLng(c.longitude.toFixed(7));
        setAcc(c.accuracy.toFixed(1));
        setAlt(c.altitude != null ? c.altitude.toFixed(1) : "");
        setWhen(toLocalInput(new Date(pos.timestamp)));
        setSource("GPS_DISPOSITIVO");
        setBusy(false);
        setMsg(c.accuracy > 15 ? `Precisão de ±${c.accuracy.toFixed(0)} m — considere capturar novamente.` : `Localização capturada (±${c.accuracy.toFixed(0)} m).`);
      },
      (err) => {
        setBusy(false);
        setMsg(
          err.code === err.PERMISSION_DENIED
            ? "Permissão de localização negada. Libere o acesso nas configurações do navegador."
            : err.code === err.TIMEOUT
              ? "Tempo esgotado ao obter o GPS. Tente novamente em local aberto."
              : "Não foi possível obter a localização.",
        );
      },
      { enableHighAccuracy: true, timeout: 25_000, maximumAge: 0 },
    );
  };

  const nLat = lat !== "" && !Number.isNaN(Number(lat)) ? Number(lat) : undefined;
  const nLng = lng !== "" && !Number.isNaN(Number(lng)) ? Number(lng) : undefined;
  const links = nLat !== undefined && nLng !== undefined ? navLinks(nLat, nLng) : null;

  return (
    <div className="space-y-4 sm:col-span-2">
      <button type="button" onClick={capture} disabled={busy} className="btn btn-primary w-full min-h-14 text-base sm:w-auto">
        {busy ? <Loader2 className="size-5 animate-spin" /> : <Crosshair className="size-5" />}
        Capturar minha localização
      </button>
      {msg && <p className="text-sm text-stone-600">{msg}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Latitude (WGS84)</span>
          <input name="latitude" inputMode="decimal" className={`input ${errors?.latitude ? "input-error" : ""}`} value={lat} onChange={(e) => { setLat(e.target.value); setSource(source || "MANUAL"); }} />
          {errors?.latitude && <span className="mt-1 block text-xs text-red-600">{errors.latitude}</span>}
        </label>
        <label className="block">
          <span className="label">Longitude (WGS84)</span>
          <input name="longitude" inputMode="decimal" className={`input ${errors?.longitude ? "input-error" : ""}`} value={lng} onChange={(e) => { setLng(e.target.value); setSource(source || "MANUAL"); }} />
          {errors?.longitude && <span className="mt-1 block text-xs text-red-600">{errors.longitude}</span>}
        </label>
        {!simple && (<>
        <label className="block">
          <span className="label">Precisão do GPS (m)</span>
          <input name="gpsAccuracy" inputMode="decimal" className="input" value={acc} onChange={(e) => setAcc(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Altitude (m)</span>
          <input name="altitude" inputMode="decimal" className="input" value={alt} onChange={(e) => setAlt(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Data/hora da captura</span>
          <input name="gpsCapturedAt" type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Origem da coordenada</span>
          <select name="coordSource" className="input" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Selecione…</option>
            {COORD_SOURCES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        </>)}
      </div>

      <div>
        <p className="mb-1 flex items-center gap-1 text-xs text-stone-500"><MapPin className="size-3.5" /> Toque no mapa para ajustar a posição do exemplar.</p>
        <div className={`${simple ? "h-56" : "h-64 sm:h-80"} overflow-hidden rounded-xl border border-stone-200`}>
          <LocationPicker
            lat={nLat}
            lng={nLng}
            accuracy={acc ? Number(acc) : undefined}
            fallback={fallback}
            onPick={(a, b) => {
              setLat(a.toFixed(7));
              setLng(b.toFixed(7));
              setAcc("");
              setAlt("");
              setWhen(toLocalInput(new Date()));
              setSource("MAPA");
            }}
          />
        </div>
      </div>
      {links && (
        <div className="flex flex-wrap gap-2 text-sm">
          <a className="btn btn-secondary btn-sm" href={links.google} target="_blank" rel="noopener noreferrer">Google Maps</a>
          <a className="btn btn-secondary btn-sm" href={links.apple} target="_blank" rel="noopener noreferrer">Apple Maps</a>
          <a className="btn btn-secondary btn-sm" href={links.waze} target="_blank" rel="noopener noreferrer">Waze</a>
        </div>
      )}
      <p className="text-xs text-stone-500">Sistema geodésico: WGS84 / EPSG:4326 (graus decimais).</p>
    </div>
  );
}
