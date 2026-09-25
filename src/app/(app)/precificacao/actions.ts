"use server";

import { auditedRun } from "@/lib/pricing/audited-action";
import { z } from "zod";
import type { PricingEstimateStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertPermission, type CurrentUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { nextContractNumber, nextWorkOrderNumber } from "@/lib/counters";
import { finish, formObject, optDate, optId, optStr, reqStr, UserError } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";
import { dec, fmtPct } from "@/lib/pricing/decimal";
import {
  APPROVAL_LABEL, COMMISSION_BASE_LABEL, assertNonNegativeMargin, grantableLevel, levelCovers, validateMargin, type ApprovalLevelCode, type CommissionBase,
} from "@/lib/pricing/policy";
import { SERVICES, isServiceCode } from "@/lib/pricing/registry";
import {
  calcResultOf, getActiveVersion, nextEstimateNumber, paramsOf, persistCalculation, pricingAudit,
  recomputeEstimate, serverCalculate,
} from "@/lib/pricing/server";

type Tx = Prisma.TransactionClient;
const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho", EM_ELABORACAO: "Em elaboração", EM_APROVACAO_INTERNA: "Em aprovação interna", APROVADO_INTERNAMENTE: "Aprovado internamente",
  ENVIADO_CLIENTE: "Enviado ao cliente", EM_NEGOCIACAO: "Em negociação", ACEITO: "Aceito", RECUSADO: "Recusado", CANCELADO: "Cancelado", EXPIRADO: "Expirado",
};

/** Qualquer orçamento pode ser aberto e editado (inclusive aceito, recusado, cancelado ou expirado). */
async function loadEditable(tx: Tx | typeof db, id: string) {
  return tx.pricingEstimate.findUniqueOrThrow({ where: { id }, include: { parameterVersion: true } });
}

const FINAL = ["ACEITO", "RECUSADO", "CANCELADO", "EXPIRADO"];

/**
 * Qualquer mudança de conteúdo/preço:
 *  - depois de aprovado/enviado: exige nova aprovação;
 *  - em status final (aceito, recusado, cancelado, expirado): reabre o orçamento para "Em elaboração";
 *  - propostas emitidas e ainda não enviadas ficam como "substituídas" (as enviadas/aceitas permanecem no histórico).
 * Tudo registrado na auditoria.
 */
async function invalidateApproval(tx: Tx, est: { id: string; status: PricingEstimateStatus }, userId: string, reason: string) {
  const approvalFlow = ["EM_APROVACAO_INTERNA", "APROVADO_INTERNAMENTE", "ENVIADO_CLIENTE", "EM_NEGOCIACAO"].includes(est.status);
  const reopen = FINAL.includes(est.status);
  const next: PricingEstimateStatus = est.status === "RASCUNHO" || approvalFlow || reopen ? "EM_ELABORACAO" : est.status;
  if (approvalFlow || reopen) {
    await tx.proposalApproval.updateMany({ where: { estimateId: est.id, status: "PENDENTE" }, data: { status: "CANCELADO", comment: reason } });
    await tx.pricingEstimate.update({ where: { id: est.id }, data: { approvedLevel: null, approvedAt: null } });
    const stale = await tx.commercialProposal.updateMany({ where: { estimateId: est.id, status: "EMITIDA" }, data: { status: "SUBSTITUIDA" } });
    await pricingAudit(tx, userId, reopen ? "REABERTURA" : "APROVACAO_INVALIDADA", "PricingEstimate", est.id, {
      estimateId: est.id, field: "status", previousValue: est.status, newValue: next,
      justification: `${reason}${stale.count ? ` — ${stale.count} proposta(s) emitida(s) marcada(s) como substituída(s)` : ""}`,
    });
  }
  if (next !== est.status) await tx.pricingEstimate.update({ where: { id: est.id }, data: { status: next, ...(reopen && { closeReason: null }) } });
}

/** Nenhum ajuste pode deixar margem negativa — nem em um item nem no total do orçamento. */
async function assertMargins(tx: Tx, estimateId: string, what: string) {
  const [est, items] = await Promise.all([
    tx.pricingEstimate.findUniqueOrThrow({ where: { id: estimateId }, select: { effectiveMargin: true, marginAfterCommission: true } }),
    tx.pricingEstimateItem.findMany({ where: { estimateId }, select: { effectiveMargin: true, serviceCode: true, priceOverride: true, marginOverride: true, extraCost: true } }),
  ]);
  for (const i of items) {
    // Preço calculado pelo motor sem ajustes (ex.: poda legada ≈ 0%) não é bloqueado; só ajustes manuais.
    const adjusted = i.priceOverride !== null || i.marginOverride !== null || Number(i.extraCost) > 0;
    if (adjusted) assertNonNegativeMargin(dec(i.effectiveMargin.toString()), `${what} (${SERVICES[i.serviceCode as keyof typeof SERVICES]?.shortName ?? i.serviceCode})`);
  }
  if (est.effectiveMargin !== null) assertNonNegativeMargin(dec(est.effectiveMargin.toString()), what);
  if (est.marginAfterCommission !== null) assertNonNegativeMargin(dec(est.marginAfterCommission.toString()), `${what}, descontada a comissão,`);
}

// ───────────────────────── Cabeçalho ─────────────────────────

const headerSchema = z.object({
  title: optStr(200),
  clientId: reqStr("Cliente", 40),
  contactId: optId(),
  propertyId: optId(),
  opportunityId: optId(),
  validUntil: optDate(),
  commercialOwnerId: optId(),
  technicalOwnerId: optId(),
  internalNotes: optStr(4000),
  commercialNotes: optStr(4000),
});

async function checkLinks(d: z.infer<typeof headerSchema>) {
  if (d.propertyId) {
    const p = await db.property.findUnique({ where: { id: d.propertyId }, select: { clientId: true } });
    if (p?.clientId !== d.clientId) throw new UserError("A propriedade não pertence ao cliente selecionado.");
  }
  if (d.contactId) {
    const c = await db.contact.findUnique({ where: { id: d.contactId }, select: { clientId: true } });
    if (c?.clientId !== d.clientId) throw new UserError("O contato não pertence ao cliente selecionado.");
  }
  if (d.opportunityId) {
    const o = await db.opportunity.findUnique({ where: { id: d.opportunityId }, select: { clientId: true } });
    if (o?.clientId !== d.clientId) throw new UserError("A oportunidade não pertence ao cliente selecionado.");
  }
}

export async function createEstimate(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await auditedRun("createEstimate", null, async () => {
    const user = await assertPermission("pricing:write");
    const d = headerSchema.parse(formObject(fd));
    await checkLinks(d);
    const marginRaw = String(fd.get("marginPercent") ?? "").trim();
    let margin: ReturnType<typeof dec> | null = null;
    if (marginRaw) {
      if (!user.permissions.includes("pricing:negotiate")) throw new UserError("Sem permissão para definir a margem de lucro.");
      try { margin = validateMargin(pct(marginRaw)!, "Margem de lucro"); }
      catch (e) { return { ok: false, message: (e as Error).message, errors: { marginPercent: (e as Error).message } }; }
    }
    const version = await getActiveVersion();
    const number = await nextEstimateNumber();
    const validUntil = d.validUntil ?? new Date(Date.now() + 30 * 86_400_000);
    await db.$transaction(async (tx) => {
      const e = await tx.pricingEstimate.create({
        data: {
          ...d, number, validUntil, parameterVersionId: version.id, createdById: user.id,
          taxRate: paramsOf(version).general.imposto,
          ...(margin && { marginOverride: margin.toDecimalPlaces(6).toString(), marginReason: "Margem de lucro definida na criação do orçamento" }),
        },
      });
      id = e.id;
      if (margin) await pricingAudit(tx, user.id, "ALTERACAO_MARGEM", "PricingEstimate", e.id, { estimateId: e.id, field: "margemOrcamento", previousValue: paramsOf(version).general.margem, newValue: margin.toString(), justification: "Definida na criação" });
      await pricingAudit(tx, user.id, "CRIACAO", "PricingEstimate", e.id, { estimateId: e.id, newValue: { number, versao: version.label } });
    });
    await audit(user.id, "CREATE", "PricingEstimate", id, number);
  });
  return finish(res, `/precificacao/${id}`);
}

export async function updateEstimateHeader(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const res = await auditedRun("updateEstimateHeader", id, async () => {
    const user = await assertPermission("pricing:write");
    const d = headerSchema.parse(formObject(fd));
    await checkLinks(d);
    await db.$transaction(async (tx) => {
      const before = await loadEditable(tx, id);
      if (before.clientId !== d.clientId && (await tx.pricingEstimateItem.count({ where: { estimateId: id, trees: { some: {} } } })))
        throw new UserError("Há itens com árvores selecionadas: não é possível trocar o cliente.");
      await tx.pricingEstimate.update({ where: { id }, data: d });
      for (const k of Object.keys(d) as (keyof typeof d)[]) {
        const a = before[k as keyof typeof before] as unknown, b = d[k] as unknown;
        const norm = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ?? null);
        if (JSON.stringify(norm(a)) !== JSON.stringify(norm(b)))
          await pricingAudit(tx, user.id, "ALTERACAO", "PricingEstimate", id, { estimateId: id, field: k, previousValue: norm(a), newValue: norm(b) });
      }
    });
  });
  return finish(res, `/precificacao/${id}`);
}

// ───────────────────────── Itens ─────────────────────────

const itemPayload = z.object({
  service: z.string(),
  inputs: z.record(z.string(), z.unknown()),
  description: z.string().trim().max(500).optional().nullable(),
  treeIds: z.array(z.string().max(40)).max(20_000).default([]),
  confirmWarnings: z.boolean().default(false),
  clientPrice: z.string().optional(), // valor calculado no navegador, só para comparação/auditoria
});

export async function saveItem(estimateId: string, itemId: string | null, payloadJson: string): Promise<ActionState> {
  const res = await auditedRun("saveItem", estimateId, async () => {
    const user = await assertPermission("pricing:write");
    const p = itemPayload.parse(JSON.parse(payloadJson));
    if (!isServiceCode(p.service)) throw new UserError("Serviço inválido.");
    const service = p.service;
    const est = await loadEditable(db, estimateId);

    // Árvores selecionadas: precisam ser da propriedade (ou do cliente) do orçamento.
    let treeIds: string[] = [];
    if (p.treeIds.length && SERVICES[service].perTree) {
      const trees = await db.tree.findMany({
        where: { id: { in: p.treeIds }, ...(est.propertyId ? { propertyId: est.propertyId } : { property: { clientId: est.clientId } }) },
        select: { id: true },
      });
      if (trees.length !== new Set(p.treeIds).size) throw new UserError("Há árvores selecionadas que não pertencem à propriedade/cliente do orçamento.");
      treeIds = trees.map((t) => t.id);
      p.inputs.trees = treeIds.length; // quantidade vem da seleção
    }

    // Cálculo no servidor, com a versão de parâmetros DO ORÇAMENTO (não a vigente).
    const { params, inputs, result } = serverCalculate(est.parameterVersion, service, p.inputs);
    if (inputs.trees < 1) throw new UserError(SERVICES[service].perTree ? "Informe ao menos 1 árvore." : "Informe a quantidade.");
    const confirm = result.warnings.filter((w) => w.level === "confirm");
    if (confirm.length && !p.confirmWarnings)
      throw new UserError(`Confirme os valores fora do padrão antes de salvar: ${confirm.map((w) => w.message).join(" ")}`);

    await db.$transaction(async (tx) => {
      const prev = itemId ? await tx.pricingEstimateItem.findFirstOrThrow({ where: { id: itemId, estimateId } }) : null;
      const count = await tx.pricingEstimateItem.count({ where: { estimateId } });
      const data = {
        serviceCode: service, description: p.description || null, quantity: inputs.trees,
        inputs: inputs as unknown as Prisma.InputJsonValue,
        operationalCost: dec(result.operationalCost).toDecimalPlaces(2).toString(),
        calculatedPrice: result.finalPriceRounded, unitPrice: result.unitPriceRounded,
        negotiatedPrice: result.finalPriceRounded, effectiveMargin: dec(result.effectiveMargin).toDecimalPlaces(6).toString(),
        trees: { set: treeIds.map((id) => ({ id })) },
      };
      const item = prev
        ? await tx.pricingEstimateItem.update({ where: { id: prev.id }, data })
        : await tx.pricingEstimateItem.create({ data: { ...data, estimateId, order: count, trees: { connect: treeIds.map((id) => ({ id })) } } });
      const calc = await persistCalculation(tx, { version: est.parameterVersion, params, service, inputs, result, user, treeIds, estimateId, itemId: item.id });
      await tx.pricingEstimateItem.update({ where: { id: item.id }, data: { currentCalculationId: calc.id } });
      await pricingAudit(tx, user.id, prev ? "ITEM_RECALCULADO" : "ITEM_CRIADO", "PricingEstimateItem", item.id, {
        estimateId, field: "calculatedPrice", previousValue: prev?.calculatedPrice.toString() ?? null, newValue: result.finalPriceRounded,
        justification: p.clientPrice && p.clientPrice !== result.finalPriceRounded ? `Preço no navegador (${p.clientPrice}) difere do servidor; prevalece o servidor.` : null,
      });
      await invalidateApproval(tx, est, user.id, "Item incluído/alterado");
      await recomputeEstimate(tx, estimateId);
    });
  });
  return finish(res, `/precificacao/${estimateId}`);
}

export async function deleteItem(estimateId: string, itemId: string): Promise<ActionState> {
  return auditedRun("deleteItem", estimateId, async () => {
    const user = await assertPermission("pricing:write");
    await db.$transaction(async (tx) => {
      const est = await loadEditable(tx, estimateId);
      const it = await tx.pricingEstimateItem.findFirstOrThrow({ where: { id: itemId, estimateId } });
      await tx.pricingEstimateItem.delete({ where: { id: it.id } });
      await pricingAudit(tx, user.id, "ITEM_REMOVIDO", "PricingEstimateItem", itemId, {
        estimateId, previousValue: { servico: it.serviceCode, quantidade: it.quantity, preco: it.negotiatedPrice.toString() },
      });
      await invalidateApproval(tx, est, user.id, "Item removido");
      await recomputeEstimate(tx, estimateId);
    });
  });
}

// ───────────────────────── Ajustes e desconto ─────────────────────────

/** Número digitado em pt-BR ("1.234,50") ou com ponto decimal ("1234.5"). */
function parseNum(v: unknown) {
  const t = String(v ?? "").trim().replace(/^R\$\s*/, "").replace(/%$/, "");
  if (t === "") return null;
  const n = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^-?\d+(\.\d+)?$/.test(n)) throw new UserError(`Valor numérico inválido: "${t}".`);
  return dec(n);
}
const pct = (v: unknown) => parseNum(v)?.div(100) ?? null;
const brl = (v: unknown) => parseNum(v);

export async function adjustItem(estimateId: string, itemId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return auditedRun("adjustItem", estimateId, async () => {
    const user = await assertPermission("pricing:negotiate");
    const f = formObject(fd);
    const reasonParsed = z.string().trim().min(5, "Informe o motivo (mínimo 5 caracteres).").max(1000).safeParse(f.adjustReason ?? "");
    if (!reasonParsed.success) return { ok: false, message: "Informe o motivo.", errors: { adjustReason: reasonParsed.error.issues[0].message } };
    const reason = reasonParsed.data;
    const margin = pct(f.marginOverride);
    const extra = brl(f.extraCost) ?? dec(0);
    const price = brl(f.priceOverride);
    if (margin) validateMargin(margin, "Margem do item");
    if (extra.lt(0)) throw new UserError("Custo adicional não pode ser negativo.");
    if (price && price.lte(0)) throw new UserError("Preço final deve ser maior que zero.");
    // Margem abaixo da alçada de quem ajusta é permitida, mas o orçamento passa a exigir aprovação superior.
    await db.$transaction(async (tx) => {
      const est = await loadEditable(tx, estimateId);
      const it = await tx.pricingEstimateItem.findFirstOrThrow({ where: { id: itemId, estimateId } });
      const changes: { type: "MARGEM" | "CUSTO_ADICIONAL" | "PRECO_FINAL"; prev: string | null; next: string | null }[] = [];
      const s = (v: { toString(): string } | null | undefined) => (v === null || v === undefined ? null : v.toString());
      if (s(it.marginOverride) !== s(margin?.toDecimalPlaces(6))) changes.push({ type: "MARGEM", prev: s(it.marginOverride), next: s(margin?.toDecimalPlaces(6)) });
      if (!dec(it.extraCost.toString()).eq(extra)) changes.push({ type: "CUSTO_ADICIONAL", prev: it.extraCost.toString(), next: extra.toString() });
      if (s(it.priceOverride) !== s(price?.toDecimalPlaces(2))) changes.push({ type: "PRECO_FINAL", prev: s(it.priceOverride), next: s(price?.toDecimalPlaces(2)) });
      if (!changes.length) throw new UserError("Nenhum ajuste alterado.");
      await tx.pricingEstimateItem.update({
        where: { id: it.id },
        data: {
          marginOverride: margin ? margin.toDecimalPlaces(6).toString() : null,
          extraCost: extra.toDecimalPlaces(2).toString(), extraCostReason: extra.isZero() ? null : reason,
          priceOverride: price ? price.toDecimalPlaces(2).toString() : null,
        },
      });
      await recomputeEstimate(tx, estimateId);
      await assertMargins(tx, estimateId, "Este ajuste");
      const after = await tx.pricingEstimateItem.findUniqueOrThrow({ where: { id: it.id } });
      for (const c of changes) {
        await tx.pricingOverride.create({
          data: {
            estimateId, itemId: it.id, type: c.type, previousValue: c.prev, newValue: c.next, reason, userId: user.id,
            calculatedPrice: it.calculatedPrice, negotiatedPrice: after.negotiatedPrice,
            difference: dec(after.negotiatedPrice.toString()).minus(dec(it.calculatedPrice.toString())).toString(),
            discountPercent: dec(it.calculatedPrice.toString()).isZero() ? null
              : dec(it.calculatedPrice.toString()).minus(dec(after.negotiatedPrice.toString())).div(dec(it.calculatedPrice.toString())).toDecimalPlaces(6).toString(),
          },
        });
        await pricingAudit(tx, user.id, c.type === "MARGEM" ? "ALTERACAO_MARGEM" : c.type === "PRECO_FINAL" ? "ALTERACAO_PRECO" : "CUSTO_ADICIONAL",
          "PricingEstimateItem", it.id, { estimateId, field: c.type, previousValue: c.prev, newValue: c.next, justification: reason });
      }
      await invalidateApproval(tx, est, user.id, "Preço do item ajustado");
    });
  });
}

export async function setDiscount(estimateId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return auditedRun("setDiscount", estimateId, async () => {
    const user = await assertPermission("pricing:negotiate");
    const f = formObject(fd);
    const type = f.discountType === "PERCENT" || f.discountType === "AMOUNT" ? f.discountType : null;
    const value = type === "PERCENT" ? pct(f.discountValue) : type === "AMOUNT" ? brl(f.discountValue) : null;
    const reason = String(f.reason ?? "").trim();
    if (type && value && !value.isZero() && reason.length < 5) return { ok: false, errors: { reason: "Informe o motivo do desconto (mínimo 5 caracteres)." }, message: "Informe o motivo." };
    await db.$transaction(async (tx) => {
      const est = await loadEditable(tx, estimateId);
      const params = paramsOf(est.parameterVersion);
      const prev = { type: est.discountType, value: est.discountValue?.toString() ?? null, amount: est.discountAmount.toString() };
      await tx.pricingEstimate.update({
        where: { id: estimateId },
        data: { discountType: value && !value.isZero() ? type : null, discountValue: value && !value.isZero() ? value.toString() : null, discountReason: value && !value.isZero() ? reason : null },
      });
      const after = await recomputeEstimate(tx, estimateId);
      await assertMargins(tx, estimateId, "Este desconto");
      const pctOff = dec(after.itemsTotal.toString()).isZero() ? dec(0) : dec(after.discountAmount.toString()).div(dec(after.itemsTotal.toString()));
      if (pctOff.gt(dec(params.approval.descontoAlerta)) && f.confirmDiscount !== "on")
        throw new UserError(`Desconto de ${fmtPct(pctOff)} acima do limite de alerta (${fmtPct(params.approval.descontoAlerta)}). Marque a confirmação para prosseguir.`);
      await tx.pricingOverride.create({
        data: {
          estimateId, type: type === "PERCENT" ? "DESCONTO_PERCENTUAL" : type === "AMOUNT" ? "DESCONTO_VALOR" : "REMOCAO",
          previousValue: prev.value, newValue: value?.toString() ?? null, reason: reason || "Desconto removido", userId: user.id,
          calculatedPrice: after.itemsTotal, negotiatedPrice: after.negotiatedTotal,
          difference: dec(after.negotiatedTotal.toString()).minus(dec(after.itemsTotal.toString())).toString(), discountPercent: pctOff.toDecimalPlaces(6).toString(),
        },
      });
      await pricingAudit(tx, user.id, "DESCONTO", "PricingEstimate", estimateId, {
        estimateId, field: "desconto", previousValue: prev, newValue: { type, value: value?.toString() ?? null, amount: after.discountAmount.toString() }, justification: reason || null,
      });
      await invalidateApproval(tx, est, user.id, "Desconto alterado");
    });
  });
}

/** Margem de lucro do orçamento (aplicada a todos os itens sem margem/preço próprios). Nunca negativa. */
export async function setEstimateMargin(estimateId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return auditedRun("setEstimateMargin", estimateId, async (): Promise<ActionState> => {
    const user = await assertPermission("pricing:negotiate");
    const raw = String(fd.get("marginPercent") ?? "").trim();
    const reason = String(fd.get("marginReason") ?? "").trim();
    let margin: ReturnType<typeof dec> | null = null;
    if (raw) {
      try { margin = validateMargin(pct(raw)!, "Margem de lucro"); }
      catch (e) { return { ok: false, message: (e as Error).message, errors: { marginPercent: (e as Error).message } }; }
    }
    if (reason.length < 5) return { ok: false, message: "Informe o motivo.", errors: { marginReason: "Informe o motivo (mínimo 5 caracteres)." } };
    await db.$transaction(async (tx) => {
      const est = await loadEditable(tx, estimateId);
      const prev = est.marginOverride?.toString() ?? null;
      const next = margin ? margin.toDecimalPlaces(6).toString() : null;
      if ((prev === null ? null : dec(prev).toString()) === (next === null ? null : dec(next).toString())) throw new UserError("A margem informada é igual à atual.");
      const beforeTotals = { itens: est.itemsTotal.toString(), total: est.negotiatedTotal.toString() };
      await tx.pricingEstimate.update({ where: { id: estimateId }, data: { marginOverride: next, marginReason: next ? reason : null } });
      const after = await recomputeEstimate(tx, estimateId);
      await assertMargins(tx, estimateId, "Esta margem");
      await tx.pricingOverride.create({
        data: {
          estimateId, type: "MARGEM", previousValue: prev, newValue: next, reason, userId: user.id,
          calculatedPrice: after.calculatedTotal, negotiatedPrice: after.itemsTotal,
          difference: dec(after.itemsTotal.toString()).minus(dec(beforeTotals.itens)).toString(),
        },
      });
      await pricingAudit(tx, user.id, "ALTERACAO_MARGEM", "PricingEstimate", estimateId, {
        estimateId, field: "margemOrcamento",
        previousValue: { margem: prev ?? `padrão (${paramsOf(est.parameterVersion).general.margem})`, total: beforeTotals.total },
        newValue: { margem: next ?? "padrão dos parâmetros", total: after.negotiatedTotal.toString() }, justification: reason,
      });
      await invalidateApproval(tx, est, user.id, "Margem de lucro do orçamento alterada");
    });
    return { ok: true, message: margin ? `Margem de lucro de ${fmtPct(margin)} aplicada.` : "Margem do orçamento removida (volta ao padrão)." };
  });
}

/**
 * Comissão do orçamento: percentual sobre o valor total da proposta ou sobre a margem de lucro (excluídos os impostos).
 * Custo interno — não altera o preço nem aparece na proposta; reduz resultado e margem (alçada e trava de margem negativa).
 */
export async function setCommission(estimateId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return auditedRun("setCommission", estimateId, async (): Promise<ActionState> => {
    const user = await assertPermission("pricing:negotiate");
    const raw = String(fd.get("commissionPercent") ?? "").trim();
    const base = String(fd.get("commissionBase") ?? "") as CommissionBase;
    const to = String(fd.get("commissionTo") ?? "").trim().slice(0, 150) || null;
    const reason = String(fd.get("commissionReason") ?? "").trim();
    let percent: ReturnType<typeof dec> | null = null;
    if (raw) {
      try { percent = validateMargin(pct(raw)!, "Comissão"); }
      catch (e) { return { ok: false, message: (e as Error).message, errors: { commissionPercent: (e as Error).message } }; }
      if (!(base in COMMISSION_BASE_LABEL)) return { ok: false, message: "Escolha a base da comissão.", errors: { commissionBase: "Escolha a base da comissão." } };
    }
    if (reason.length < 5) return { ok: false, message: "Informe o motivo.", errors: { commissionReason: "Informe o motivo (mínimo 5 caracteres)." } };
    await db.$transaction(async (tx) => {
      const est = await loadEditable(tx, estimateId);
      const prev = { percentual: est.commissionPercent?.toString() ?? null, base: est.commissionBase, comissionado: est.commissionTo, valor: est.commissionAmount.toString() };
      await tx.pricingEstimate.update({
        where: { id: estimateId },
        data: percent && !percent.isZero()
          ? { commissionPercent: percent.toDecimalPlaces(6).toString(), commissionBase: base, commissionTo: to, commissionReason: reason }
          : { commissionPercent: null, commissionBase: null, commissionTo: null, commissionReason: null },
      });
      const after = await recomputeEstimate(tx, estimateId);
      await assertMargins(tx, estimateId, "Esta comissão");
      await tx.pricingOverride.create({
        data: {
          estimateId, type: "COMISSAO", previousValue: prev.percentual, newValue: percent?.toString() ?? null, userId: user.id,
          reason: `${reason}${percent ? ` — base: ${COMMISSION_BASE_LABEL[base]}${to ? `; comissionado: ${to}` : ""}` : " (comissão removida)"}`,
          negotiatedPrice: after.negotiatedTotal, difference: dec(after.commissionAmount.toString()).neg().toString(),
        },
      });
      await pricingAudit(tx, user.id, "COMISSAO", "PricingEstimate", estimateId, {
        estimateId, field: "comissao", previousValue: prev,
        newValue: { percentual: percent?.toString() ?? null, base: percent ? base : null, comissionado: to, valor: after.commissionAmount.toString() }, justification: reason,
      });
      await invalidateApproval(tx, est, user.id, "Comissão alterada");
    });
    return { ok: true, message: percent && !percent.isZero() ? `Comissão de ${fmtPct(percent)} sobre ${COMMISSION_BASE_LABEL[base].toLowerCase()} aplicada.` : "Comissão removida." };
  });
}

// ───────────────────────── Aprovação ─────────────────────────

export async function requestApproval(estimateId: string): Promise<ActionState> {
  return auditedRun("requestApproval", estimateId, async () => {
    const user = await assertPermission("pricing:write");
    let msg = "";
    await db.$transaction(async (tx) => {
      const est = await loadEditable(tx, estimateId);
      if (!["RASCUNHO", "EM_ELABORACAO", "EM_NEGOCIACAO"].includes(est.status)) throw new UserError("A aprovação só pode ser solicitada para orçamentos em elaboração ou negociação.");
      const e = await recomputeEstimate(tx, estimateId);
      if (!(await tx.pricingEstimateItem.count({ where: { estimateId } }))) throw new UserError("Inclua ao menos um item.");
      const level = e.requiredApproval as ApprovalLevelCode;
      const params = paramsOf(est.parameterVersion);
      const mine = grantableLevel(user.permissions);
      const auto = !params.approval.fluxoObrigatorio || levelCovers(mine, level);
      const approval = await tx.proposalApproval.create({
        data: {
          estimateId, level, status: auto ? "APROVADO" : "PENDENTE", marginAtRequest: e.marginAfterCommission ?? e.effectiveMargin ?? 0, totalAtRequest: e.negotiatedTotal,
          requestedById: user.id, ...(auto && { decidedById: user.id, decidedAt: new Date(), comment: params.approval.fluxoObrigatorio ? "Aprovado dentro da alçada do solicitante" : "Fluxo de aprovação desativado" }),
        },
      });
      await tx.pricingEstimate.update({
        where: { id: estimateId },
        data: auto ? { status: "APROVADO_INTERNAMENTE", approvedLevel: level, approvedAt: new Date() } : { status: "EM_APROVACAO_INTERNA" },
      });
      await pricingAudit(tx, user.id, auto ? "APROVACAO" : "SOLICITACAO_APROVACAO", "ProposalApproval", approval.id, {
        estimateId, field: "status", previousValue: est.status, newValue: auto ? "APROVADO_INTERNAMENTE" : "EM_APROVACAO_INTERNA",
        justification: `Alçada ${APPROVAL_LABEL[level]} — margem ${fmtPct((e.marginAfterCommission ?? e.effectiveMargin)?.toString() ?? 0)}${e.marginAfterCommission !== null ? " (após comissão)" : ""}`,
      });
      msg = auto ? "Aprovado dentro da sua alçada." : `Enviado para aprovação ${APPROVAL_LABEL[level].toLowerCase()}.`;
    });
    return { ok: true, message: msg };
  });
}

export async function decideApproval(approvalId: string, approve: boolean, comment: string): Promise<ActionState> {
  return auditedRun("decideApproval", null, async () => {
    const user = await assertPermission("pricing:read");
    await db.$transaction(async (tx) => {
      const a = await tx.proposalApproval.findUniqueOrThrow({ where: { id: approvalId }, include: { estimate: true } });
      if (a.status !== "PENDENTE") throw new UserError("Esta solicitação já foi decidida.");
      if (!levelCovers(grantableLevel(user.permissions), a.level)) throw new UserError(`Requer alçada ${APPROVAL_LABEL[a.level as ApprovalLevelCode].toLowerCase()}.`);
      if (!approve && comment.trim().length < 5) throw new UserError("Informe o motivo da reprovação.");
      await tx.proposalApproval.update({ where: { id: a.id }, data: { status: approve ? "APROVADO" : "REJEITADO", decidedById: user.id, decidedAt: new Date(), comment: comment.trim() || null } });
      await tx.pricingEstimate.update({
        where: { id: a.estimateId },
        data: approve ? { status: "APROVADO_INTERNAMENTE", approvedLevel: a.level, approvedAt: new Date() } : { status: "EM_ELABORACAO" },
      });
      await pricingAudit(tx, user.id, approve ? "APROVACAO" : "REPROVACAO", "ProposalApproval", a.id, {
        estimateId: a.estimateId, field: "status", previousValue: a.estimate.status, newValue: approve ? "APROVADO_INTERNAMENTE" : "EM_ELABORACAO", justification: comment || null,
      });
    });
  });
}

// ───────────────────────── Status / CRM ─────────────────────────

const TRANSITIONS: Record<string, PricingEstimateStatus[]> = {
  ENVIADO_CLIENTE: ["APROVADO_INTERNAMENTE", "EM_NEGOCIACAO"],
  EM_NEGOCIACAO: ["ENVIADO_CLIENTE"],
  ACEITO: ["ENVIADO_CLIENTE", "EM_NEGOCIACAO", "APROVADO_INTERNAMENTE"],
  RECUSADO: ["ENVIADO_CLIENTE", "EM_NEGOCIACAO", "APROVADO_INTERNAMENTE"],
  CANCELADO: ["RASCUNHO", "EM_ELABORACAO", "EM_APROVACAO_INTERNA", "APROVADO_INTERNAMENTE", "ENVIADO_CLIENTE", "EM_NEGOCIACAO", "ACEITO", "RECUSADO", "EXPIRADO"],
  EM_ELABORACAO: ["RECUSADO", "EXPIRADO", "CANCELADO", "ACEITO"],
};

export async function changeStatus(estimateId: string, target: PricingEstimateStatus, reason: string): Promise<ActionState> {
  return auditedRun("changeStatus", estimateId, async () => {
    const user = await assertPermission("pricing:write");
    if (!TRANSITIONS[target]) throw new UserError("Transição não permitida.");
    if (["RECUSADO", "CANCELADO"].includes(target) && reason.trim().length < 5) throw new UserError("Informe o motivo (mínimo 5 caracteres).");
    await db.$transaction(async (tx) => {
      const est = await tx.pricingEstimate.findUniqueOrThrow({ where: { id: estimateId }, include: { parameterVersion: true } });
      if (!TRANSITIONS[target].includes(est.status)) throw new UserError(`Não é possível passar de "${STATUS_LABEL[est.status]}" para "${STATUS_LABEL[target]}".`);
      if (target === "ENVIADO_CLIENTE" && paramsOf(est.parameterVersion).approval.fluxoObrigatorio && !est.approvedLevel)
        throw new UserError("Aprovação interna pendente.");
      if (target === "EM_ELABORACAO") await tx.pricingEstimate.update({ where: { id: estimateId }, data: { approvedLevel: null, approvedAt: null, closeReason: null } });
      const now = new Date();
      await tx.pricingEstimate.update({
        where: { id: estimateId },
        data: {
          status: target,
          ...(target === "ENVIADO_CLIENTE" && !est.sentAt && { sentAt: now }),
          ...(target === "ACEITO" && { acceptedAt: now }),
          ...(target === "RECUSADO" && { rejectedAt: now, closeReason: reason }),
          ...(target === "CANCELADO" && { closeReason: reason }),
        },
      });
      const lastProposal = await tx.commercialProposal.findFirst({ where: { estimateId, status: { in: ["EMITIDA", "ENVIADA"] } }, orderBy: { version: "desc" } });
      if (lastProposal) {
        const pStatus = target === "ACEITO" ? "ACEITA" : target === "RECUSADO" ? "RECUSADA" : target === "CANCELADO" ? "CANCELADA" : target === "ENVIADO_CLIENTE" ? "ENVIADA" : null;
        if (pStatus) await tx.commercialProposal.update({ where: { id: lastProposal.id }, data: { status: pStatus, ...(pStatus === "ACEITA" && { acceptedAt: now }), ...(pStatus === "ENVIADA" && !lastProposal.sentAt && { sentAt: now }) } });
      }
      // Integração com o funil
      if (est.opportunityId) {
        const stage = target === "ACEITO" ? "GANHA" : target === "RECUSADO" ? "PERDIDA" : target === "ENVIADO_CLIENTE" ? "PROPOSTA" : target === "EM_NEGOCIACAO" ? "NEGOCIACAO" : null;
        if (stage) {
          await tx.opportunity.update({
            where: { id: est.opportunityId },
            data: {
              stage, estimatedValue: est.negotiatedTotal,
              ...(stage === "GANHA" && { probability: 100 }), ...(stage === "PERDIDA" && { probability: 0 }),
            },
          });
          await pricingAudit(tx, user.id, "OPORTUNIDADE_ATUALIZADA", "Opportunity", est.opportunityId, { estimateId, field: "stage", newValue: stage });
        }
      }
      await pricingAudit(tx, user.id, target === "ENVIADO_CLIENTE" ? "ENVIO_CLIENTE" : target === "CANCELADO" ? "CANCELAMENTO" : "STATUS", "PricingEstimate", estimateId, {
        estimateId, field: "status", previousValue: est.status, newValue: target, justification: reason || null,
      });
    });
  });
}

// ───────────────────────── Duplicação / revisão / reprecificação ─────────────────────────

async function copyItems(tx: Tx, fromId: string, toId: string, user: CurrentUser, version: Awaited<ReturnType<typeof getActiveVersion>>) {
  const items = await tx.pricingEstimateItem.findMany({ where: { estimateId: fromId }, orderBy: { order: "asc" }, include: { trees: { select: { id: true } } } });
  for (const it of items) {
    if (!isServiceCode(it.serviceCode)) continue;
    const { params, inputs, result } = serverCalculate(version, it.serviceCode, it.inputs);
    const treeIds = it.trees.map((t) => t.id);
    const n = await tx.pricingEstimateItem.create({
      data: {
        estimateId: toId, order: it.order, serviceCode: it.serviceCode, description: it.description, quantity: inputs.trees,
        inputs: inputs as unknown as Prisma.InputJsonValue, operationalCost: dec(result.operationalCost).toDecimalPlaces(2).toString(),
        calculatedPrice: result.finalPriceRounded, unitPrice: result.unitPriceRounded, negotiatedPrice: result.finalPriceRounded,
        effectiveMargin: dec(result.effectiveMargin).toDecimalPlaces(6).toString(), trees: { connect: treeIds.map((id) => ({ id })) },
      },
    });
    const calc = await persistCalculation(tx, { version, params, service: it.serviceCode, inputs, result, user, treeIds, estimateId: toId, itemId: n.id });
    await tx.pricingEstimateItem.update({ where: { id: n.id }, data: { currentCalculationId: calc.id } });
  }
}

export async function duplicateEstimate(id: string, mode: "copy" | "revision"): Promise<ActionState> {
  let newId = "";
  const res = await auditedRun("duplicateEstimate", id, async () => {
    const user = await assertPermission("pricing:write");
    const src = await db.pricingEstimate.findUniqueOrThrow({ where: { id } });
    const version = await getActiveVersion();
    let number: string;
    let revision = 1;
    if (mode === "revision") {
      const root = src.number.replace(/-R\d+$/, "");
      const max = await db.pricingEstimate.aggregate({ where: { OR: [{ number: root }, { number: { startsWith: `${root}-R` } }] }, _max: { revision: true } });
      revision = (max._max.revision ?? 1) + 1;
      number = `${root}-R${revision}`;
    } else number = await nextEstimateNumber();
    await db.$transaction(async (tx) => {
      const e = await tx.pricingEstimate.create({
        data: {
          number, revision, parentId: mode === "revision" ? src.id : null, title: src.title, clientId: src.clientId, contactId: src.contactId,
          propertyId: src.propertyId, opportunityId: src.opportunityId, validUntil: new Date(Date.now() + 30 * 86_400_000),
          commercialOwnerId: src.commercialOwnerId, technicalOwnerId: src.technicalOwnerId, internalNotes: src.internalNotes,
          commercialNotes: src.commercialNotes, parameterVersionId: version.id, createdById: user.id, status: "EM_ELABORACAO",
          marginOverride: src.marginOverride, marginReason: src.marginReason,
          commissionPercent: src.commissionPercent, commissionBase: src.commissionBase, commissionTo: src.commissionTo, commissionReason: src.commissionReason,
          taxRate: paramsOf(version).general.imposto,
        },
      });
      newId = e.id;
      await copyItems(tx, src.id, e.id, user, version);
      await recomputeEstimate(tx, e.id);
      await pricingAudit(tx, user.id, mode === "revision" ? "REVISAO" : "DUPLICACAO", "PricingEstimate", e.id, {
        estimateId: e.id, previousValue: src.number, newValue: { number, versaoParametros: version.label },
        justification: `Itens recalculados com os parâmetros vigentes; ajustes de itens e descontos não são copiados${src.marginOverride ? `; margem do orçamento (${fmtPct(src.marginOverride.toString())}) mantida` : ""}.`,
      });
      if (mode === "revision" && !FINAL.includes(src.status)) {
        await tx.pricingEstimate.update({ where: { id: src.id }, data: { status: "CANCELADO", closeReason: `Substituído pela revisão ${number}` } });
        await pricingAudit(tx, user.id, "CANCELAMENTO", "PricingEstimate", src.id, { estimateId: src.id, field: "status", previousValue: src.status, newValue: "CANCELADO", justification: `Substituído pela revisão ${number}` });
      }
    });
  });
  return finish(res, `/precificacao/${newId}`);
}

/** Recalcula todos os itens com a versão de parâmetros vigente (ação explícita e auditada). */
export async function repriceWithActiveParams(id: string, reason: string): Promise<ActionState> {
  return auditedRun("repriceWithActiveParams", id, async () => {
    const user = await assertPermission("pricing:write");
    if (reason.trim().length < 5) throw new UserError("Informe o motivo.");
    const version = await getActiveVersion();
    await db.$transaction(async (tx) => {
      const est = await loadEditable(tx, id);
      if (est.parameterVersionId === version.id) throw new UserError("O orçamento já usa a versão vigente.");
      const items = await tx.pricingEstimateItem.findMany({ where: { estimateId: id }, include: { trees: { select: { id: true } } } });
      for (const it of items) {
        if (!isServiceCode(it.serviceCode)) continue;
        const { params, inputs, result } = serverCalculate(version, it.serviceCode, it.inputs);
        const calc = await persistCalculation(tx, { version, params, service: it.serviceCode, inputs, result, user, treeIds: it.trees.map((t) => t.id), estimateId: id, itemId: it.id });
        await tx.pricingEstimateItem.update({
          where: { id: it.id },
          data: {
            currentCalculationId: calc.id, operationalCost: dec(result.operationalCost).toDecimalPlaces(2).toString(), calculatedPrice: result.finalPriceRounded,
            unitPrice: result.unitPriceRounded,
          },
        });
      }
      await tx.pricingEstimate.update({ where: { id }, data: { parameterVersionId: version.id, taxRate: paramsOf(version).general.imposto } });
      const after = await recomputeEstimate(tx, id);
      await pricingAudit(tx, user.id, "REPRECIFICACAO", "PricingEstimate", id, {
        estimateId: id, field: "versaoParametros", previousValue: { versao: est.parameterVersion.label, total: est.negotiatedTotal.toString() },
        newValue: { versao: version.label, total: after.negotiatedTotal.toString() }, justification: reason,
      });
      await invalidateApproval(tx, est, user.id, "Reprecificado com parâmetros vigentes");
    });
  });
}

// ───────────────────────── Contrato e OS ─────────────────────────

export async function createContractFromEstimate(id: string): Promise<ActionState> {
  let contractId = "";
  const res = await auditedRun("createContractFromEstimate", id, async () => {
    const user = await assertPermission("contracts:write");
    const est = await db.pricingEstimate.findUniqueOrThrow({ where: { id }, include: { items: { orderBy: { order: "asc" } }, contracts: true } });
    if (est.status !== "ACEITO") throw new UserError("Crie o contrato após o aceite do cliente.");
    if (est.contracts.length) throw new UserError(`Já existe contrato vinculado (${est.contracts[0].number}).`);
    const object = est.items.map((i) => { const d = SERVICES[i.serviceCode as keyof typeof SERVICES]; return `${d?.name ?? i.serviceCode} — ${i.quantity} ${i.quantity === 1 ? d?.unit ?? "un" : d?.unitPlural ?? "un"}`; }).join("; ");
    const number = await nextContractNumber();
    await db.$transaction(async (tx) => {
      const c = await tx.contract.create({
        data: {
          number, clientId: est.clientId, propertyId: est.propertyId, startDate: new Date(), value: est.negotiatedTotal, periodicity: "AVULSO",
          object: `Orçamento ${est.number}: ${object}`.slice(0, 1000), ownerId: est.commercialOwnerId ?? user.id, status: "ATIVO", pricingEstimateId: est.id,
          notes: est.commercialNotes,
        },
      });
      contractId = c.id;
      await pricingAudit(tx, user.id, "CONTRATO_CRIADO", "Contract", c.id, { estimateId: id, newValue: number });
    });
    await audit(user.id, "CREATE", "Contract", contractId, number);
  });
  return finish(res, `/contratos/${contractId}`);
}

export async function createWorkOrdersFromEstimate(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return auditedRun("createWorkOrdersFromEstimate", id, async () => {
    const user = await assertPermission("workorders:write");
    const scheduledAt = optDate().parse(fd.get("scheduledAt"));
    const est = await db.pricingEstimate.findUniqueOrThrow({
      where: { id }, include: { items: { orderBy: { order: "asc" }, include: { trees: { select: { id: true } } } }, workOrders: { select: { id: true } } },
    });
    if (est.status !== "ACEITO") throw new UserError("Crie ordens de serviço após o aceite do cliente.");
    if (est.workOrders.length) throw new UserError("Já existem ordens de serviço geradas para este orçamento.");
    const proposal = await db.commercialProposal.findFirst({ where: { estimateId: id, status: { notIn: ["CANCELADA", "SUBSTITUIDA", "RECUSADA"] } }, orderBy: [{ version: "desc" }], select: { id: true } });
    const numbers: string[] = [];
    for (const it of est.items) {
      const svc = SERVICES[it.serviceCode as keyof typeof SERVICES];
      const number = await nextWorkOrderNumber();
      const inputs = it.inputs as Record<string, unknown>;
      const days = it.currentCalculationId
        ? calcResultOf(await db.pricingCalculation.findUniqueOrThrow({ where: { id: it.currentCalculationId }, select: { snapshot: true } })).days
        : null;
      await db.$transaction(async (tx) => {
        const wo = await tx.workOrder.create({
          data: {
            number, clientId: est.clientId, propertyId: est.propertyId, service: svc?.osService ?? "MANEJO", priority: "MEDIA", status: "ABERTA",
            scheduledAt, responsibleId: est.technicalOwnerId, pricingEstimateId: est.id,
            ...(proposal && { origin: "PROPOSTA", proposalId: proposal.id }),
            description: [`Orçamento ${est.number} — ${svc?.name ?? it.serviceCode}: ${it.quantity} ${it.quantity === 1 ? svc?.unit ?? "un" : svc?.unitPlural ?? "un"}.`, it.description,
              days ? `Estimativa: ${days} dia(s), ${inputs.auxiliaries ?? 0} auxiliar(es).` : null].filter(Boolean).join("\n"),
            trees: { connect: it.trees.map((t) => ({ id: t.id })) },
          },
        });
        await pricingAudit(tx, user.id, "OS_CRIADA", "WorkOrder", wo.id, { estimateId: id, newValue: number });
      });
      numbers.push(number);
    }
    await audit(user.id, "CREATE", "WorkOrder", null, `${numbers.join(", ")} (orçamento ${est.number})`);
    return { ok: true, message: `${numbers.length} OS criada(s): ${numbers.join(", ")}.` };
  });
}

export async function deleteEstimate(id: string): Promise<ActionState> {
  return auditedRun("deleteEstimate", id, async () => {
    const user = await assertPermission("pricing:write");
    const est = await db.pricingEstimate.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { items: true, contracts: true, workOrders: true } }, proposals: { where: { status: { in: ["ENVIADA", "ACEITA"] } }, select: { id: true } } },
    });
    if (est.proposals.length || est._count.contracts || est._count.workOrders)
      throw new UserError("Orçamento com proposta enviada/aceita, contrato ou ordem de serviço não pode ser excluído (histórico comercial). Use Cancelar.");
    await pricingAudit(db, user.id, "EXCLUSAO", "PricingEstimate", id, {
      previousValue: { numero: est.number, status: est.status, itens: est._count.items, total: est.negotiatedTotal.toString() },
    });
    await db.pricingEstimate.delete({ where: { id } });
    await audit(user.id, "DELETE", "PricingEstimate", id, est.number);
  });
}
