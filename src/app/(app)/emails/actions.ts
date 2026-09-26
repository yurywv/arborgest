"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import { finish, formObject, optId, reqStr, runAction, UserError } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";
import { getMailAccount, mailLayout, sendMail, type MailAttachment } from "@/lib/mail";
import { getObject } from "@/lib/storage";
import { renderProposalPdf } from "@/lib/pricing/proposal-data";

const MAX_TOTAL = 20 * 1024 * 1024; // o Gmail aceita até 25 MB por mensagem (anexos codificados crescem ~33%)
const emails = (label: string, required: boolean) =>
  z.preprocess((v) => String(v ?? "").split(/[;,\s]+/).filter(Boolean), z.array(z.email(`${label}: e-mail inválido.`)).max(20, `${label}: no máximo 20 endereços.`))
    .refine((a) => !required || a.length > 0, `Informe o ${label.toLowerCase()}.`);

const schema = z.object({
  clientId: z.string().min(1).max(40),
  contactId: optId(),
  to: emails("Destinatário", true),
  cc: emails("Cópia", false),
  subject: reqStr("Assunto", 250),
  body: reqStr("Mensagem", 20000),
  docIds: z.array(z.string().max(40)).max(30),
  proposalIds: z.array(z.string().max(40)).max(10),
});

/** Envia e-mail ao cliente pela conta Gmail cadastrada e registra no histórico do cliente. */
export async function sendClientEmail(_: ActionState, fd: FormData): Promise<ActionState> {
  let clientId = "";
  const res = await runAction(async () => {
    const user = await assertPermission("clients:write");
    const d = schema.parse(formObject(fd, ["docIds", "proposalIds"]));
    clientId = d.clientId;
    const account = await getMailAccount();
    if (!account?.hasPassword) throw new UserError("Nenhuma conta Gmail cadastrada para envio. Peça ao administrador para cadastrá-la em Administração › Configurações.");
    const client = await db.client.findUniqueOrThrow({ where: { id: d.clientId }, select: { id: true, legalName: true, tradeName: true } });
    if (d.contactId) {
      const c = await db.contact.findUnique({ where: { id: d.contactId }, select: { clientId: true } });
      if (c?.clientId !== client.id) throw new UserError("O contato não pertence ao cliente.");
    }

    // Anexos: somente documentos e propostas do próprio cliente.
    const attachments: MailAttachment[] = [];
    const meta: { name: string; size: number; kind: string; id: string }[] = [];
    if (d.docIds.length) {
      const docs = await db.document.findMany({
        where: { id: { in: d.docIds }, OR: [{ clientId: client.id }, { contract: { clientId: client.id } }, { proposal: { clientId: client.id } }] },
      });
      if (docs.length !== new Set(d.docIds).size) throw new UserError("Há anexos que não pertencem a este cliente.");
      for (const doc of docs) {
        const buf = await getObject(doc.storageKey);
        if (!buf) throw new UserError(`Não foi possível ler o arquivo "${doc.fileName}".`);
        attachments.push({ filename: doc.fileName, content: buf, contentType: doc.mimeType });
        meta.push({ name: doc.fileName, size: buf.length, kind: "DOCUMENTO", id: doc.id });
      }
    }
    if (d.proposalIds.length) {
      const props = await db.commercialProposal.findMany({ where: { id: { in: d.proposalIds }, clientId: client.id }, select: { id: true, contractId: true, estimateId: true } });
      if (props.length !== new Set(d.proposalIds).size) throw new UserError("Há propostas que não pertencem a este cliente.");
      for (const p of props) {
        const ok = hasPermission(user.permissions, "pricing:read") || (!!p.contractId && hasPermission(user.permissions, "contracts:read"));
        if (!ok) throw new UserError("Sem permissão para anexar uma das propostas.");
        const r = await renderProposalPdf(p.id);
        if (!r) throw new UserError("Proposta não encontrada.");
        attachments.push({ filename: `${r.proposal.number}.pdf`, content: r.pdf, contentType: "application/pdf" });
        meta.push({ name: `${r.proposal.number}.pdf`, size: r.pdf.length, kind: "PROPOSTA", id: p.id });
      }
    }
    const total = meta.reduce((s, m) => s + m.size, 0);
    if (total > MAX_TOTAL) throw new UserError(`Anexos somam ${(total / 1048576).toFixed(1)} MB; o limite é 20 MB por e-mail.`);

    const to = d.to.join(", ");
    const cc = d.cc.join(", ") || undefined;
    let status = "ENVIADO", error: string | null = null, messageId: string | null = null;
    try {
      const r = await sendMail(to, d.subject, d.body, mailLayout({ title: d.subject, paragraphs: d.body.split(/\n{2,}/), footer: account.senderName }), attachments, { cc });
      messageId = r.messageId;
    } catch (e) {
      status = "FALHA";
      error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    }
    const sent = await db.sentEmail.create({
      data: { clientId: client.id, contactId: d.contactId, to, cc: cc ?? null, subject: d.subject, body: d.body, attachments: meta, status, error, messageId, fromAddress: account.user, userId: user.id },
    });
    await audit(user.id, status === "ENVIADO" ? "EMAIL" : "EMAIL_FALHA", "SentEmail", sent.id, `${d.subject} → ${to}${meta.length ? ` (${meta.length} anexo(s))` : ""}`);
    if (status !== "ENVIADO") throw new UserError(`O Gmail recusou o envio: ${error}`);
  });
  return finish(res, `/clientes/${clientId}?aba=historico`);
}
