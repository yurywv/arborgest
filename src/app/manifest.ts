import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ArborGest — Gestão Arbórea",
    short_name: "ArborGest",
    description: "Inventário, inspeções e manejo de árvores georreferenciadas.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafaf9",
    theme_color: "#226e40",
    lang: "pt-BR",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Escanear QR", url: "/escanear" },
      { name: "Mapa", url: "/mapa" },
      { name: "Novo exemplar", url: "/arvores/novo" },
    ],
  };
}
