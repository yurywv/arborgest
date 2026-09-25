/* Regras comerciais puras: ajustes de item, desconto do orçamento, margem efetiva e alçada de aprovação.
 * Sem acesso a banco — usadas pelo servidor (fonte de verdade) e pela tela (pré-visualização).
 */
import { D, type DecimalT, dec, money } from "./decimal";
import { EngineError } from "./engine";
import type { ApprovalParams, CalcResult } from "./types";

export type ApprovalLevelCode = "COMERCIAL" | "GERENCIAL" | "DIRETORIA";
export const APPROVAL_LABEL: Record<ApprovalLevelCode, string> = {
  COMERCIAL: "Comercial",
  GERENCIAL: "Gerencial",
  DIRETORIA: "Diretoria / administração",
};
const RANK: Record<ApprovalLevelCode, number> = { COMERCIAL: 1, GERENCIAL: 2, DIRETORIA: 3 };
export const levelCovers = (granted: ApprovalLevelCode | null | undefined, required: ApprovalLevelCode) =>
  !!granted && RANK[granted] >= RANK[required];

/** Margem efetiva sobre a receita líquida de impostos: (preço × (1 − t) − custo) ÷ (preço × (1 − t)). */
export function effectiveMargin(price: DecimalT, cost: DecimalT, tax: DecimalT) {
  const net = price.mul(D.sub(1, tax));
  return net.isZero() ? dec(0) : net.minus(cost).div(net);
}

export interface ItemAdjustments {
  marginOverride?: string | null; // fração — margem própria do item
  extraCost?: string | null; // R$
  priceOverride?: string | null; // R$
  estimateMargin?: string | null; // fração — margem de lucro definida no orçamento (vale se o item não tiver a sua)
}

/** Tolerância para o arredondamento do preço a centavos (≈ 0,01%). */
export const MARGIN_TOLERANCE = dec("-0.0001");
const present = (v: string | null | undefined) => v !== null && v !== undefined && v !== "";

/** Margem informada pelo usuário: nunca negativa e sempre menor que 100%. */
export function validateMargin(m: DecimalT, label = "Margem de lucro") {
  if (m.lt(0)) throw new EngineError(`${label} não pode ser negativa.`);
  if (m.gte(1)) throw new EngineError(`${label} deve ser menor que 100%.`);
  return m;
}

/** Bloqueia ajustes (preço/desconto) que deixariam a margem efetiva negativa. */
export function assertNonNegativeMargin(margin: DecimalT, what: string) {
  if (margin.lt(MARGIN_TOLERANCE))
    throw new EngineError(`${what} resultaria em margem negativa (${margin.mul(100).toDecimalPlaces(2).toString().replace(".", ",")}%). Margens negativas não são permitidas.`);
}

/**
 * Preço do item após ajustes autorizados. O preço calculado pelo motor nunca é alterado.
 *  - preço final informado: prevalece sobre tudo;
 *  - margem (do item ou, na falta, a do orçamento) e/ou custo adicional:
 *    preço = (custo + adicional) ÷ (1 − margem) ÷ (1 − imposto) — fórmula padronizada, inclusive na poda;
 *  - poda legada sem margem definida e com custo adicional: mantém custo ÷ (1 − imposto).
 */
export function adjustedItemPrice(r: CalcResult, adj: ItemAdjustments) {
  const tax = dec(r.tax);
  const extra = dec(adj.extraCost ?? 0);
  const cost = dec(r.operationalCost).plus(extra);
  const marginSrc = present(adj.marginOverride) ? adj.marginOverride : present(adj.estimateMargin) ? adj.estimateMargin : null;
  let price: DecimalT;
  if (present(adj.priceOverride)) price = dec(adj.priceOverride);
  else if (marginSrc !== null || !extra.isZero()) {
    if (marginSrc === null && r.priceMethod === "LEGACY_PODA") price = cost.div(D.sub(1, tax));
    else {
      const m = validateMargin(marginSrc !== null ? dec(marginSrc) : dec(r.margin), "Margem");
      price = cost.div(D.sub(1, m)).div(D.sub(1, tax));
    }
  } else price = dec(r.finalPriceRounded);
  price = money(price);
  return { price, cost, margin: effectiveMargin(price, cost, tax), marginSource: present(adj.priceOverride) ? "PRECO" : present(adj.marginOverride) ? "ITEM" : present(adj.estimateMargin) ? "ORCAMENTO" : "PADRAO" };
}

export type CommissionBase = "TOTAL" | "PROFIT";
export const COMMISSION_BASE_LABEL: Record<CommissionBase, string> = {
  TOTAL: "Valor total da proposta",
  PROFIT: "Margem de lucro (excluídos os impostos)",
};

export interface EstimateTotalsInput {
  items: { calculatedPrice: DecimalT; negotiatedPrice: DecimalT; cost: DecimalT }[];
  tax: DecimalT;
  discountType?: "PERCENT" | "AMOUNT" | null;
  discountValue?: DecimalT | null;
  /** Comissão (fração ≥ 0 e < 1) — custo interno; não altera o preço da proposta. */
  commission?: { percent: DecimalT; base: CommissionBase } | null;
}

/**
 * Comissão sobre:
 *  - TOTAL: valor total da proposta (preço negociado, como vendido ao cliente);
 *  - PROFIT: margem de lucro excluídos os impostos = receita − impostos − custo operacional (nunca negativa).
 */
export function commissionAmount(percent: DecimalT, base: CommissionBase, revenue: DecimalT, profit: DecimalT) {
  validateMargin(percent, "Comissão");
  const b = base === "TOTAL" ? revenue : D.max(profit, 0);
  return money(b.mul(percent));
}

export function estimateTotals(t: EstimateTotalsInput) {
  const sum = (f: (i: EstimateTotalsInput["items"][number]) => DecimalT) => t.items.reduce((a, i) => a.plus(f(i)), dec(0));
  const calculatedTotal = sum((i) => i.calculatedPrice);
  const itemsTotal = sum((i) => i.negotiatedPrice);
  const cost = sum((i) => i.cost);
  let discountAmount = dec(0);
  if (t.discountType === "PERCENT" && t.discountValue) {
    if (t.discountValue.lt(0) || t.discountValue.gte(1)) throw new EngineError("Desconto percentual deve estar entre 0% e 99,99%.");
    discountAmount = money(itemsTotal.mul(t.discountValue));
  } else if (t.discountType === "AMOUNT" && t.discountValue) {
    if (t.discountValue.lt(0) || t.discountValue.gt(itemsTotal)) throw new EngineError("Desconto em R$ não pode ser negativo nem maior que o total.");
    discountAmount = money(t.discountValue);
  }
  const negotiatedTotal = itemsTotal.minus(discountAmount);
  const profit = negotiatedTotal.mul(D.sub(1, t.tax)).minus(cost);
  const commission = t.commission ? commissionAmount(t.commission.percent, t.commission.base, negotiatedTotal, profit) : dec(0);
  const net = negotiatedTotal.mul(D.sub(1, t.tax));
  const resultAfterCommission = profit.minus(commission);
  return {
    commission,
    resultAfterCommission,
    marginAfterCommission: net.isZero() ? dec(0) : resultAfterCommission.div(net),
    calculatedTotal,
    itemsTotal,
    discountAmount,
    negotiatedTotal,
    operationalCostTotal: money(cost),
    calculatedMargin: effectiveMargin(calculatedTotal, cost, t.tax),
    effectiveMargin: effectiveMargin(negotiatedTotal, cost, t.tax),
    discountPercentVsCalculated: calculatedTotal.isZero() ? dec(0) : calculatedTotal.minus(negotiatedTotal).div(calculatedTotal),
    profit,
    taxAmount: negotiatedTotal.mul(t.tax),
  };
}

/** Alçada necessária conforme a margem efetiva final (comparada com 0,01% de precisão, pois o arredondamento
 *  do preço a centavos altera a margem na 6ª casa). */
export function requiredApprovalLevel(margin: DecimalT, a: ApprovalParams): ApprovalLevelCode {
  const m = margin.toDecimalPlaces(4);
  if (m.gte(dec(a.margemComercial))) return "COMERCIAL";
  if (m.gte(dec(a.margemGerencial))) return "GERENCIAL";
  return "DIRETORIA";
}

/** Maior alçada que um conjunto de permissões pode conceder. */
export function grantableLevel(perms: readonly string[]): ApprovalLevelCode | null {
  if (perms.includes("pricing:direct")) return "DIRETORIA";
  if (perms.includes("pricing:approve")) return "GERENCIAL";
  if (perms.includes("pricing:negotiate")) return "COMERCIAL";
  return null;
}
