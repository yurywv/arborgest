import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getCurrentUser } from "@/lib/auth/session";
import { appBaseUrl } from "@/lib/qr";

export const runtime = "nodejs";

/** GET /api/qrcode/ARB-000001?format=png|svg — imagem do QR para uso externo (etiquetas, relatórios). */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const code = decodeURIComponent((await params).code).toUpperCase();
  if (!/^ARB-\d{6,}$/.test(code)) return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  const url = `${await appBaseUrl()}/arvores/${code}`;
  const format = new URL(req.url).searchParams.get("format");
  if (format === "png") {
    const buf = await QRCode.toBuffer(url, { margin: 1, width: 600, errorCorrectionLevel: "M" });
    return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "image/png", "Content-Disposition": `inline; filename="${code}.png"`, "Cache-Control": "private, max-age=86400" } });
  }
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=86400" } });
}
