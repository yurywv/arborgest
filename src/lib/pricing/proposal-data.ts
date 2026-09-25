import "server-only";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { z } from "zod";
import { UserError } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";
import { mailConfigured, mailLayout, sendMail } from "@/lib/mail";
import { fmtBRL } from "./decimal";
import { proposalPdf } from "./proposal-pdf";

export async function loadProposal(id: string) {
  return db.commercialProposal.findUnique({
    where: { id },
    include: {
      items: { orderBy: { order: "asc" } },
      client: { select: { legalName: true, tradeName: true, document: true, address: true, addressNumber: true, city: true, state: true } },
      contact: { select: { name: true, email: true, phone: true, mobile: true } },
      property: { select: { name: true, address: true, number: true, complement: true, district: true, city: true, state: true } },
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

/** Envia o PDF da proposta por e-mail (SMTP). Usado pela Precificação e por Contratos. */
export async function emailProposal(
  p: { id: string; number: string; title: string; total: { toString(): string } },
  to: string,
  message: string,
): Promise<{ ok: true; sentTo: string } | { ok: false; state: ActionState }> {
  if (!mailConfigured()) throw new UserError("SMTP não configurado. Baixe o PDF e envie manualmente, ou desmarque o envio por e-mail.");
  const emails = to.split(/[;,\s]+/).filter(Boolean);
  if (!emails.length || emails.some((e) => !z.email().safeParse(e).success))
    return { ok: false, state: { ok: false, errors: { to: "Informe e-mail(s) válido(s)." }, message: "Destinatário inválido." } };
  const r = await renderProposalPdf(p.id);
  const company = (await getSettings()).company_name;
  const total = fmtBRL(p.total.toString());
  await sendMail(
    emails.join(", "),
    `Proposta comercial ${p.number} — ${company}`,
    `${message ? message + "\n\n" : ""}Segue em anexo a proposta ${p.number} (${p.title}), no valor total de ${total}.`,
    mailLayout({
      title: `Proposta ${p.number}`,
      paragraphs: [...(message ? [message] : []), `Segue em anexo a proposta comercial ${p.number} — ${p.title}.`, `Valor total: ${total}.`],
      footer: company,
    }),
    [{ filename: `${p.number}.pdf`, content: r!.pdf, contentType: "application/pdf" }],
  );
  return { ok: true, sentTo: emails.join(", ") };
}
