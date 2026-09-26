"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { finish, formObject, optDate, optId, optNum, optStr, reqStr, runAction, UserError } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";
import { dec, fmtBRL, money } from "@/lib/pricing/decimal";
import { nextProposalNumber } from "@/lib/pricing/server";
import { emailProposal } from "@/lib/pricing/proposal-data";
import { PROPOSAL_STATUS } from "@/lib/pricing/labels";

const item = z.object({
  title: z.string().trim().min(1, "Informe o serviço.").max(300),
  description: z.string().trim().max(2000).optional().transform((v) => v || null),
  quantity: z.coerce.number({ error: "Quantidade inválida." }).positive("A quantidade deve ser maior que zero.").max(1e7),
  unit: z.string().trim().min(1, "Informe a unidade.").max(30),
  unitPrice: z.coerce.number({ error: "Valor unitário inválido." }).min(0, "O valor unitário não pode ser negativo.").max(1e10),
});

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
  discount: optNum({ min: 0 }),
  replacesId: optId(),
});

/** Emite uma proposta a partir do contrato. Se for nova versão de outra proposta, a anterior fica "substituída". */
export async function createContractProposal(contractId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let proposalId = "";
  const res = await runAction(async (): Promise<ActionState | void> => {
    const user = await assertPermission("contracts:write");
    const d = schema.parse(formObject(fd));
    let rawItems: unknown;
    try {
      rawItems = JSON.parse(String(fd.get("items") ?? "[]"));
    } catch {
      throw new UserError("Itens inválidos.");
    }
    const parsedItems = z.array(item).safeParse(rawItems);
    if (!parsedItems.success) {
      const i = parsedItems.error.issues[0];
      return { ok: false, message: `Item ${Number(i.path[0]) + 1}: ${i.message}`, errors: { items: i.message } };
    }
    const items = parsedItems.data;
    if (!items.length) return { ok: false, message: "Inclua ao menos um serviço.", errors: { items: "Inclua ao menos um serviço." } };

    const contract = await db.contract.findUniqueOrThrow({ where: { id: contractId }, select: { id: true, number: true, clientId: true, propertyId: true } });
    if (d.contactId) {
      const c = await db.contact.findUnique({ where: { id: d.contactId }, select: { clientId: true } });
      if (c?.clientId !== contract.clientId) throw new UserError("O contato não pertence ao cliente do contrato.");
    }
    const replaced = d.replacesId
      ? await db.commercialProposal.findFirst({ where: { id: d.replacesId, contractId } })
      : null;
    if (d.replacesId && !replaced) throw new UserError("Proposta de origem não encontrada neste contrato.");

    const lines = items.map((i) => {
      const unitPrice = money(dec(i.unitPrice));
      return { ...i, unitPrice, total: money(unitPrice.mul(dec(i.quantity))) };
    });
    const subtotal = lines.reduce((s, l) => s.plus(l.total), dec(0));
    const discount = money(dec(d.discount ?? 0));
    if (discount.gt(subtotal)) return { ok: false, message: "O desconto não pode ser maior que o subtotal.", errors: { discount: "Maior que o subtotal." } };
    const total = subtotal.minus(discount);

    const number = await nextProposalNumber();
    const { discount: _discount, replacesId: _replacesId, ...fields } = d;
    await db.$transaction(async (tx) => {
      if (replaced && ["RASCUNHO", "EMITIDA", "ENVIADA"].includes(replaced.status))
        await tx.commercialProposal.update({ where: { id: replaced.id }, data: { status: "SUBSTITUIDA" } });
      const p = await tx.commercialProposal.create({
        data: {
          ...fields, number, version: replaced ? replaced.version + 1 : 1, contractId, status: "EMITIDA",
          clientId: contract.clientId, propertyId: contract.propertyId,
          subtotal: subtotal.toString(), discountAmount: discount.toString(), total: total.toString(), createdById: user.id,
          items: {
            create: lines.map((l, idx) => ({
              order: idx, serviceCode: "CONTRATO", title: l.title, description: l.description, quantity: l.quantity, unit: l.unit,
              unitPrice: l.unitPrice.toString(), total: l.total.toString(),
            })),
          },
        },
      });
      proposalId = p.id;
    });
    await audit(user.id, "CREATE", "CommercialProposal", proposalId,
      `${number}${replaced ? ` (v${replaced.version + 1}, substitui ${replaced.number})` : ""} — contrato ${contract.number} — ${fmtBRL(total.toString())}`);
  });
  return finish(res, `/contratos/${contractId}/propostas/${proposalId}`);
}

async function loadOwned(contractId: string, proposalId: string) {
  const p = await db.commercialProposal.findFirst({ where: { id: proposalId, contractId } });
  if (!p) throw new UserError("Proposta não encontrada neste contrato.");
  return p;
}

/** Registra o envio ao cliente; com a conta Gmail cadastrada e "enviar por e-mail" marcado, envia o PDF anexo. */
export async function sendContractProposal(contractId: string, proposalId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("contracts:write");
    const f = formObject(fd);
    const byEmail = f.byEmail === "on";
    const to = z.string().trim().max(200).parse(f.to ?? "");
    const message = z.string().trim().max(3000).parse(f.message ?? "");
    const p = await loadOwned(contractId, proposalId);
    if (!["EMITIDA", "ENVIADA"].includes(p.status)) throw new UserError(`Proposta ${PROPOSAL_STATUS[p.status].toLowerCase()} não pode ser enviada.`);
    let sentTo = to || null;
    if (byEmail) {
      const r = await emailProposal(p, to, message);
      if (!r.ok) return r.state;
      sentTo = r.sentTo;
    }
    await db.commercialProposal.update({ where: { id: p.id }, data: { status: "ENVIADA", sentAt: new Date(), sentTo } });
    await audit(user.id, "SEND", "CommercialProposal", p.id, `${p.number} — ${byEmail ? `e-mail para ${sentTo}` : `envio registrado manualmente${sentTo ? ` (${sentTo})` : ""}`}`);
    return { ok: true, message: byEmail ? `Proposta enviada para ${sentTo}.` : "Envio registrado." };
  });
}

const decision = z.object({
  status: z.enum(["ACEITA", "RECUSADA", "CANCELADA"], { error: "Selecione o resultado." }),
  acceptedBy: optStr(200),
  note: optStr(2000),
});

/** Resultado da proposta: aceita pelo cliente, recusada ou cancelada. */
export async function decideContractProposal(contractId: string, proposalId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("contracts:write");
    const d = decision.parse(formObject(fd));
    const p = await loadOwned(contractId, proposalId);
    if (!["EMITIDA", "ENVIADA"].includes(p.status)) throw new UserError(`A proposta já está ${PROPOSAL_STATUS[p.status].toLowerCase()}.`);
    if (d.status === "ACEITA" && !d.acceptedBy) return { ok: false, message: "Informe quem aceitou a proposta.", errors: { acceptedBy: "Obrigatório para aceite." } };
    const notes = d.note ? [p.notes, `${PROPOSAL_STATUS[d.status]} em ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}: ${d.note}`].filter(Boolean).join("\n") : p.notes;
    await db.commercialProposal.update({
      where: { id: p.id },
      data: { status: d.status, notes, ...(d.status === "ACEITA" && { acceptedAt: new Date(), acceptedBy: d.acceptedBy }) },
    });
    await audit(user.id, "STATUS", "CommercialProposal", p.id, `${p.number}: ${PROPOSAL_STATUS[p.status]} → ${PROPOSAL_STATUS[d.status]}${d.note ? ` — ${d.note}` : ""}`);
    return { ok: true, message: `Proposta marcada como ${PROPOSAL_STATUS[d.status].toLowerCase()}.` };
  });
}

/** Exclui uma proposta que nunca foi enviada nem aceita (documentos vinculados permanecem no histórico do cliente). */
export async function deleteContractProposal(contractId: string, proposalId: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("contracts:write");
    const p = await loadOwned(contractId, proposalId);
    if (p.sentAt || p.status === "ENVIADA" || p.status === "ACEITA") throw new UserError("Propostas enviadas ou aceitas ficam no histórico e não podem ser excluídas; cancele-a.");
    await db.commercialProposal.delete({ where: { id: p.id } });
    await audit(user.id, "DELETE", "CommercialProposal", p.id, p.number);
  });
}
