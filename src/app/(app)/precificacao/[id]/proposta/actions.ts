"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { finish, formObject, optDate, optId, optStr, reqStr, runAction, UserError } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";
import { dec, money } from "@/lib/pricing/decimal";
import { SERVICES } from "@/lib/pricing/registry";
import { nextProposalNumber, paramsOf, pricingAudit } from "@/lib/pricing/server";
import { renderProposalPdf } from "@/lib/pricing/proposal-data";
import { mailConfigured, mailLayout, sendMail } from "@/lib/mail";
import { getSettings } from "@/lib/settings";
import { fmtBRL } from "@/lib/pricing/decimal";

const schema = z.object({
  title: reqStr("Título", 200),
  object: reqStr("Objeto", 4000),
  scope: optStr(8000),
  contactId: optId(),
  validUntil: optDate(),
  deadline: optStr(2000),
  paymentTerms: optStr(2000),
  conditions: optStr(4000),
  assumptions: optStr(4000),
  exclusions: optStr(4000),
  responsibilities: optStr(4000),
  notes: optStr(4000),
});

/** Gera uma nova versão da proposta a partir do orçamento (versões anteriores ficam como "substituídas"). */
export async function createProposal(estimateId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let proposalId = "";
  const res = await runAction(async () => {
    const user = await assertPermission("pricing:write");
    const d = schema.parse(formObject(fd));
    const est = await db.pricingEstimate.findUniqueOrThrow({
      where: { id: estimateId },
      include: { items: { orderBy: { order: "asc" } }, parameterVersion: true, proposals: { select: { id: true, version: true, status: true } } },
    });
    if (!est.items.length) throw new UserError("O orçamento não tem itens.");
    const flow = paramsOf(est.parameterVersion).approval.fluxoObrigatorio;
    const allowed = ["APROVADO_INTERNAMENTE", "ENVIADO_CLIENTE", "EM_NEGOCIACAO"];
    if (flow ? !allowed.includes(est.status) : !["EM_ELABORACAO", ...allowed].includes(est.status))
      throw new UserError(flow ? "Obtenha a aprovação interna antes de gerar a proposta." : "Status do orçamento não permite gerar proposta.");
    if (d.contactId) {
      const c = await db.contact.findUnique({ where: { id: d.contactId }, select: { clientId: true } });
      if (c?.clientId !== est.clientId) throw new UserError("O contato não pertence ao cliente.");
    }
    const number = await nextProposalNumber();
    await db.$transaction(async (tx) => {
      await tx.commercialProposal.updateMany({ where: { estimateId, status: { in: ["RASCUNHO", "EMITIDA", "ENVIADA"] } }, data: { status: "SUBSTITUIDA" } });
      const p = await tx.commercialProposal.create({
        data: {
          ...d, number, version: est.proposals.length + 1, estimateId, status: "EMITIDA", clientId: est.clientId, propertyId: est.propertyId,
          validUntil: d.validUntil ?? est.validUntil, subtotal: est.itemsTotal, discountAmount: est.discountAmount, total: est.negotiatedTotal,
          createdById: user.id,
          items: {
            create: est.items.map((i, idx) => {
              const svc = SERVICES[i.serviceCode as keyof typeof SERVICES];
              const total = dec(i.negotiatedPrice.toString());
              return {
                order: idx, serviceCode: i.serviceCode, title: svc?.name ?? i.serviceCode, description: i.description, quantity: i.quantity,
                unit: svc?.unit ?? "un", unitPrice: money(total.div(i.quantity || 1)).toString(), total: total.toString(), estimateItemId: i.id,
              };
            }),
          },
        },
      });
      proposalId = p.id;
      await pricingAudit(tx, user.id, "PROPOSTA_GERADA", "CommercialProposal", p.id, { estimateId, newValue: { number, versao: p.version, total: est.negotiatedTotal.toString() } });
    });
  });
  return finish(res, `/precificacao/${estimateId}?aba=proposta&p=${proposalId}`);
}

/** Registra o envio ao cliente. Com SMTP configurado e "enviar por e-mail" marcado, envia o PDF anexo. */
export async function sendProposal(proposalId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("pricing:write");
    const f = formObject(fd);
    const byEmail = f.byEmail === "on";
    const to = z.string().trim().max(200).parse(f.to ?? "");
    const message = z.string().trim().max(3000).parse(f.message ?? "");
    const p = await db.commercialProposal.findUniqueOrThrow({ where: { id: proposalId }, include: { estimate: { include: { parameterVersion: true } } } });
    if (!["EMITIDA", "ENVIADA"].includes(p.status)) throw new UserError("Somente a versão vigente da proposta pode ser enviada.");
    const est = p.estimate;
    if (paramsOf(est.parameterVersion).approval.fluxoObrigatorio && !est.approvedLevel) throw new UserError("Aprovação interna pendente.");
    let sentTo = to || null;
    if (byEmail) {
      if (!mailConfigured()) throw new UserError("SMTP não configurado. Baixe o PDF e envie manualmente, ou desmarque o envio por e-mail.");
      const emails = to.split(/[;,\s]+/).filter(Boolean);
      if (!emails.length || emails.some((e) => !z.email().safeParse(e).success)) return { ok: false, errors: { to: "Informe e-mail(s) válido(s)." }, message: "Destinatário inválido." };
      const r = await renderProposalPdf(proposalId);
      const company = (await getSettings()).company_name;
      await sendMail(
        emails.join(", "),
        `Proposta comercial ${p.number} — ${company}`,
        `${message ? message + "\n\n" : ""}Segue em anexo a proposta ${p.number} (${p.title}), no valor total de ${fmtBRL(p.total.toString())}.`,
        mailLayout({
          title: `Proposta ${p.number}`,
          paragraphs: [...(message ? [message] : []), `Segue em anexo a proposta comercial ${p.number} — ${p.title}.`, `Valor total: ${fmtBRL(p.total.toString())}.`],
          footer: company,
        }),
        [{ filename: `${p.number}.pdf`, content: r!.pdf, contentType: "application/pdf" }],
      );
      sentTo = emails.join(", ");
    }
    await db.$transaction(async (tx) => {
      await tx.commercialProposal.update({ where: { id: p.id }, data: { status: "ENVIADA", sentAt: new Date(), sentTo } });
      if (["APROVADO_INTERNAMENTE", "EM_ELABORACAO"].includes(est.status)) {
        await tx.pricingEstimate.update({ where: { id: est.id }, data: { status: "ENVIADO_CLIENTE", sentAt: est.sentAt ?? new Date() } });
        if (est.opportunityId) await tx.opportunity.update({ where: { id: est.opportunityId }, data: { stage: "PROPOSTA", estimatedValue: est.negotiatedTotal } });
      }
      await pricingAudit(tx, user.id, "ENVIO_CLIENTE", "CommercialProposal", p.id, {
        estimateId: est.id, field: "status", previousValue: p.status, newValue: "ENVIADA", justification: byEmail ? `E-mail para ${sentTo}` : `Envio registrado manualmente${sentTo ? ` (${sentTo})` : ""}`,
      });
    });
    return { ok: true, message: byEmail ? `Proposta enviada para ${sentTo}.` : "Envio registrado." };
  });
}
