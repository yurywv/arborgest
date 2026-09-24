import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { renderProposalPdf } from "@/lib/pricing/proposal-data";
import { pricingAudit } from "@/lib/pricing/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!hasPermission(user.permissions, "pricing:read")) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const { id } = await params;
  const r = await renderProposalPdf(id);
  if (!r) return NextResponse.json({ error: "Proposta não encontrada" }, { status: 404 });
  await pricingAudit(db, user.id, "PDF_GERADO", "CommercialProposal", id, { estimateId: r.proposal.estimateId, newValue: r.proposal.number });
  return new NextResponse(new Uint8Array(r.pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${r.proposal.number}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
