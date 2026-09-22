"use client";
import dynamic from "next/dynamic";

const Loading = () => <div className="grid h-full min-h-40 w-full place-items-center rounded-2xl bg-stone-100 text-sm text-stone-500">Carregando mapa…</div>;

/** Leaflet depende de `window`: carregado somente no cliente. */
export const TreeMap = dynamic(() => import("./tree-map"), { ssr: false, loading: Loading });
export const LocationPicker = dynamic(() => import("./location-picker"), { ssr: false, loading: Loading });
