"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Circle, useMap, useMapEvents } from "react-leaflet";

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}
function Recenter({ lat, lng }: { lat?: number; lng?: number }) {
  const map = useMap();
  useEffect(() => {
    if (lat !== undefined && lng !== undefined) map.setView([lat, lng], Math.max(map.getZoom(), 18), { animate: false });
  }, [lat, lng, map]);
  return null;
}

export default function LocationPicker({
  lat, lng, accuracy, fallback, onPick,
}: {
  lat?: number; lng?: number; accuracy?: number; fallback?: [number, number]; onPick: (lat: number, lng: number) => void;
}) {
  const center: [number, number] = lat !== undefined && lng !== undefined ? [lat, lng] : fallback ?? [-22.9, -47.06];
  return (
    <MapContainer center={center} zoom={lat !== undefined ? 18 : 15} style={{ height: "100%", width: "100%" }} className="rounded-xl">
      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
      <ClickHandler onPick={onPick} />
      <Recenter lat={lat} lng={lng} />
      {lat !== undefined && lng !== undefined && (
        <>
          {accuracy ? <Circle center={[lat, lng]} radius={accuracy} pathOptions={{ color: "#226e40", weight: 1, fillOpacity: 0.1 }} /> : null}
          <CircleMarker center={[lat, lng]} radius={9} pathOptions={{ color: "#fff", weight: 3, fillColor: "#226e40", fillOpacity: 1 }} />
        </>
      )}
    </MapContainer>
  );
}
