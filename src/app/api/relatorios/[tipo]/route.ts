import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { buildReport } from "@/lib/reports";
import { toCsv, toPdf, toXlsx } from "@/lib/report-export";
import { getSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!hasPermission(user.permissions, "reports:export")) return NextResponse.json({ error: "Sem permissão para exportar." }, { status: 403 });

  const { tipo } = await params;
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams);
  const report = await buildReport(tipo, sp);
  if (!report) return NextResponse.json({ error: "Relatório inexistente" }, { status: 404 });

  const format = url.searchParams.get("format") ?? "csv";
  const company = (await getSettings()).company_name;
  const base = `${tipo}-${new Date().toISOString().slice(0, 10)}`;
  await audit(user.id, "EXPORT", "Report", tipo, format);

  if (format === "xlsx") {
    return new NextResponse(new Uint8Array(await toXlsx(report, company)), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${base}.xlsx"` },
    });
  }
  if (format === "pdf") {
    return new NextResponse(new Uint8Array(await toPdf(report, company)), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${base}.pdf"` },
    });
  }
  return new NextResponse(toCsv(report), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` } });
}
