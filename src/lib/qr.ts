import "server-only";
import QRCode from "qrcode";
import { headers } from "next/headers";

export async function appBaseUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** QR Code (SVG) apontando para /arvores/[código] — página otimizada para celular. */
export async function treeQrSvg(code: string, size = 180) {
  const url = `${await appBaseUrl()}/arvores/${encodeURIComponent(code)}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", width: size, color: { dark: "#0c0a09", light: "#ffffff" } });
  return { svg, url };
}
