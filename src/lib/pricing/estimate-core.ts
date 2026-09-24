/* Núcleo de persistência dos orçamentos: snapshot imutável, gravação de cálculo e recálculo de totais.
 * Sem "server-only" para ser usado também pelo seed; recebe o cliente Prisma/transação por parâmetro.
 */
import { createHash } from "node:crypto";
import type { Prisma, PricingParameterVersion } from "@prisma/client";
import { dec, money } from "./decimal";
import { adjustedItemPrice, estimateTotals, requiredApprovalLevel } from "./policy";
import type { CalcResult, PricingParams, ServiceCode, ServiceInputs } from "./types";

type Tx = Prisma.TransactionClient;
export const ENGINE_BUILD = "arborent-pricing-engine@1.0.0";
const paramsOf = (v: Pick<PricingParameterVersion, "snapshot">) => v.snapshot as unknown as PricingParams;

export function buildSnapshot(args: {
  version: PricingParameterVersion; params: PricingParams; service: ServiceCode; inputs: ServiceInputs; result: CalcResult;
  user: { id: string; name: string }; treeIds?: string[];
}) {
  return {
    engine: { build: ENGINE_BUILD, version: args.params.engineVersion },
    parameterVersion: { id: args.version.id, label: args.version.label, effectiveFrom: args.version.effectiveFrom },
    service: args.service,
    inputs: args.inputs,
    treeIds: args.treeIds ?? [],
    params: args.params,
    rules: args.params.rules,
    factors: { serviceType: args.result.serviceTypeFactor, modifiers: args.result.modifiersApplied, product: args.result.modifiersFactor },
    result: args.result,
    user: { id: args.user.id, name: args.user.name },
    createdAt: new Date().toISOString(),
  };
}

/** JSON canônico (chaves ordenadas recursivamente): o PostgreSQL (jsonb) não preserva a ordem das chaves. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
}

/** SHA-256 do snapshot em forma canônica — permanece igual depois de gravado e lido do banco. */
export function snapshotHash(snapshot: unknown) {
  return createHash("sha256").update(canonicalJson(JSON.parse(JSON.stringify(snapshot)))).digest("hex");
}

export async function persistCalculation(tx: Tx, args: Parameters<typeof buildSnapshot>[0] & { estimateId?: string; itemId?: string }) {
  const snapshot = buildSnapshot(args);
  return tx.pricingCalculation.create({
    data: {
      estimateId: args.estimateId ?? null,
      itemId: args.itemId ?? null,
      parameterVersionId: args.version.id,
      engineVersion: args.params.engineVersion,
      serviceCode: args.service,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      snapshotHash: snapshotHash(snapshot),
      operationalCost: money(dec(args.result.operationalCost)).toString(),
      finalPrice: args.result.finalPriceRounded,
      unitPrice: args.result.unitPriceRounded,
      createdById: args.user.id,
      components: {
        createMany: {
          data: args.result.components.map((c, i) => ({ order: i, key: c.key, label: c.label, group: c.group, value: dec(c.value).toDecimalPlaces(6).toString(), formula: c.formula })),
        },
      },
    },
  });
}

/** Resultado salvo do cálculo vigente de um item. */
export function calcResultOf(calc: { snapshot: Prisma.JsonValue }) {
  return (calc.snapshot as unknown as { result: CalcResult }).result;
}

/** Recalcula preço de cada item (ajustes), totais, margens e alçada do orçamento. Fonte de verdade. */
export async function recomputeEstimate(tx: Tx, estimateId: string) {
  const est = await tx.pricingEstimate.findUniqueOrThrow({
    where: { id: estimateId },
    include: { parameterVersion: true, items: { include: { currentCalculation: true } } },
  });
  const params = paramsOf(est.parameterVersion);
  const tax = dec(params.general.imposto);
  const rows = [];
  for (const it of est.items) {
    if (!it.currentCalculation) continue;
    const r = calcResultOf(it.currentCalculation);
    const adj = adjustedItemPrice(r, {
      marginOverride: it.marginOverride?.toString() ?? null,
      extraCost: it.extraCost.toString(),
      priceOverride: it.priceOverride?.toString() ?? null,
      estimateMargin: est.marginOverride?.toString() ?? null,
    });
    await tx.pricingEstimateItem.update({
      where: { id: it.id },
      data: { negotiatedPrice: adj.price.toString(), effectiveMargin: adj.margin.toDecimalPlaces(6).toString() },
    });
    rows.push({ calculatedPrice: dec(r.finalPriceRounded), negotiatedPrice: adj.price, cost: adj.cost });
  }
  const t = estimateTotals({
    items: rows, tax,
    discountType: (est.discountType as "PERCENT" | "AMOUNT" | null) ?? null,
    discountValue: est.discountValue ? dec(est.discountValue.toString()) : null,
  });
  const required = rows.length ? requiredApprovalLevel(t.effectiveMargin, params.approval) : null;
  return tx.pricingEstimate.update({
    where: { id: estimateId },
    data: {
      calculatedTotal: t.calculatedTotal.toString(),
      itemsTotal: t.itemsTotal.toString(),
      discountAmount: t.discountAmount.toString(),
      negotiatedTotal: t.negotiatedTotal.toString(),
      operationalCostTotal: t.operationalCostTotal.toString(),
      taxRate: tax.toString(),
      calculatedMargin: t.calculatedMargin.toDecimalPlaces(6).toString(),
      effectiveMargin: t.effectiveMargin.toDecimalPlaces(6).toString(),
      requiredApproval: required,
    },
  });
}

