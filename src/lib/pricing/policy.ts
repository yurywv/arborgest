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
  marginOverride?: string | null; // fração
  extraCost?: string | null; // R$
  priceOverride?: string | null; // R$
}

/**
 * Preço do item após ajustes autorizados. O preço calculado pelo motor nunca é alterado.
 *  - preço final informado: prevalece sobre tudo;
 *  - margem alterada e/ou custo adicional: preço = (custo + adicional) ÷ (1 − margem) ÷ (1 − imposto)
 *    (usa a fórmula padronizada; na poda legada sem margem alterada, mantém custo ÷ (1 − imposto)).
 */
export function adjustedItemPrice(r: CalcResult, adj: ItemAdjustments) {
  const tax = dec(r.tax);
  const extra = dec(adj.extraCost ?? 0);
  const cost = dec(r.operationalCost).plus(extra);
  let price: DecimalT;
  if (adj.priceOverride !== null && adj.priceOverride !== undefined && adj.priceOverride !== "") price = dec(adj.priceOverride);
  else if ((adj.marginOverride ?? "") !== "" || !extra.isZero()) {
    const hasMargin = adj.marginOverride !== null && adj.marginOverride !== undefined && adj.marginOverride !== "";
    if (!hasMargin && r.priceMethod === "LEGACY_PODA") price = cost.div(D.sub(1, tax));
    else {
      const m = hasMargin ? dec(adj.marginOverride) : dec(r.margin);
      if (m.gte(1) || m.lt(0)) throw new EngineError("Margem deve estar entre 0% e 99,99%.");
      price = cost.div(D.sub(1, m)).div(D.sub(1, tax));
    }
  } else price = dec(r.finalPriceRounded);
  price = money(price);
  return { price, cost, margin: effectiveMargin(price, cost, tax) };
}

export interface EstimateTotalsInput {
  items: { calculatedPrice: DecimalT; negotiatedPrice: DecimalT; cost: DecimalT }[];
  tax: DecimalT;
  discountType?: "PERCENT" | "AMOUNT" | null;
  discountValue?: DecimalT | null;
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
  return {
    calculatedTotal,
    itemsTotal,
    discountAmount,
    negotiatedTotal,
    operationalCostTotal: money(cost),
    calculatedMargin: effectiveMargin(calculatedTotal, cost, t.tax),
    effectiveMargin: effectiveMargin(negotiatedTotal, cost, t.tax),
    discountPercentVsCalculated: calculatedTotal.isZero() ? dec(0) : calculatedTotal.minus(negotiatedTotal).div(calculatedTotal),
    profit: negotiatedTotal.mul(D.sub(1, t.tax)).minus(cost),
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
