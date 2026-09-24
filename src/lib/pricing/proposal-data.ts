import "server-only";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { proposalPdf } from "./proposal-pdf";

export async function loadProposal(id: string) {
  return db.commercialProposal.findUnique({
    where: { id },
    include: {
      items: { orderBy: { order: "asc" } },
      client: { select: { legalName: true, tradeName: true, document: true, address: true, city: true, state: true } },
      contact: { select: { name: true, email: true, phone: true, mobile: true } },
      property: { select: { name: true, address: true, city: true, state: true } },
      estimate: { select: { number: true } },
    },
  });
}

export async function renderProposalPdf(id: string) {
  const p = await loadProposal(id);
  if (!p) return null;
  const s = await getSettings();
  return {
    proposal: p,
    pdf: proposalPdf(p, { name: s.company_name, phone: s.company_phone, email: s.company_email, document: s.company_document }),
  };
}
