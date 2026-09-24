/* Regras comerciais: ajustes, desconto, margem efetiva e alçadas de aprovação. */
import { describe, expect, it } from "vitest";
import { LEGACY_EXCEL_PARAMS as P } from "../defaults";
import { dec } from "../decimal";
import { adjustedItemPrice, effectiveMargin, estimateTotals, grantableLevel, levelCovers, requiredApprovalLevel } from "../policy";
import { calculate } from "../registry";

const inv = calculate("INVENTARIO", { trees: 350, distanceKm: 120, difficulty: 2, auxiliaries: 3, lodging: false, toll: 45 }, P).result;
const podaLegacy = calculate("PODA", { trees: 48, distanceKm: 60, difficulty: 2, auxiliaries: 4, lodging: false, toll: 25, serviceType: 1, license: true, cacamba: false, fuelLiters: 30, modifiers: [] }, P).result;

describe("Margem efetiva", () => {
  it("(receita − impostos − custo) ÷ (receita − impostos)", () => {
    expect(effectiveMargin(dec(36000), dec(22500), dec(0)).toNumber()).toBeCloseTo(0.375, 10); // exemplo do enunciado (sem imposto)
    expect(effectiveMargin(dec(inv.finalPrice), dec(inv.operationalCost), dec(0.11)).toNumber()).toBeCloseTo(0.35, 10);
  });
});

describe("Ajustes de item", () => {
  it("sem ajuste mantém o preço calculado (arredondado)", () => {
    expect(adjustedItemPrice(inv, {}).price.toString()).toBe(inv.finalPriceRounded);
  });
  it("margem alterada recalcula com a fórmula padronizada", () => {
    const r = adjustedItemPrice(inv, { marginOverride: "0.25" });
    expect(r.price.toNumber()).toBeCloseTo(Number(inv.operationalCost) / 0.75 / 0.89, 2);
    expect(r.margin.toNumber()).toBeCloseTo(0.25, 4);
  });
  it("custo adicional entra antes da margem e do imposto", () => {
    const r = adjustedItemPrice(inv, { extraCost: "1000" });
    expect(r.price.toNumber()).toBeCloseTo((Number(inv.operationalCost) + 1000) / 0.65 / 0.89, 2);
  });
  it("preço final informado prevalece e a margem resultante é recalculada", () => {
    const r = adjustedItemPrice(inv, { priceOverride: "30000", marginOverride: "0.5" });
    expect(r.price.toNumber()).toBe(30000);
    expect(r.margin.toNumber()).toBeCloseTo((30000 * 0.89 - Number(inv.operationalCost)) / (30000 * 0.89), 8);
  });
  it("poda legada sem margem alterada mantém custo ÷ (1 − imposto) ao somar custo adicional", () => {
    const r = adjustedItemPrice(podaLegacy, { extraCost: "100" });
    expect(r.price.toNumber()).toBeCloseTo((Number(podaLegacy.operationalCost) + 100) / 0.89, 2);
  });
  it("rejeita margem ≥ 100%", () => expect(() => adjustedItemPrice(inv, { marginOverride: "1" })).toThrow(/Margem/));
});

describe("Totais e desconto", () => {
  const items = [
    { calculatedPrice: dec(9800), negotiatedPrice: dec(9800), cost: dec(5000) },
    { calculatedPrice: dec(15400), negotiatedPrice: dec(15400), cost: dec(8000) },
    { calculatedPrice: dec(12700), negotiatedPrice: dec(12700), cost: dec(9500) },
  ];
  it("soma itens e aplica desconto em R$", () => {
    const t = estimateTotals({ items, tax: dec(0.11), discountType: "AMOUNT", discountValue: dec(1900) });
    expect(t.calculatedTotal.toNumber()).toBe(37900);
    expect(t.discountAmount.toNumber()).toBe(1900);
    expect(t.negotiatedTotal.toNumber()).toBe(36000);
    expect(t.effectiveMargin.lt(t.calculatedMargin)).toBe(true);
  });
  it("desconto percentual arredondado a centavos", () => {
    const t = estimateTotals({ items, tax: dec(0.11), discountType: "PERCENT", discountValue: dec("0.0333") });
    expect(t.discountAmount.toString()).toBe("1262.07");
  });
  it("rejeita desconto maior que o total ou negativo", () => {
    expect(() => estimateTotals({ items, tax: dec(0), discountType: "AMOUNT", discountValue: dec(50000) })).toThrow();
    expect(() => estimateTotals({ items, tax: dec(0), discountType: "PERCENT", discountValue: dec(-0.1) })).toThrow();
  });
});

describe("Alçadas de aprovação (35% / 25%)", () => {
  it("margem ≥ 35% → comercial; 25–35% → gerencial; < 25% → diretoria", () => {
    expect(requiredApprovalLevel(dec(0.35), P.approval)).toBe("COMERCIAL");
    expect(requiredApprovalLevel(dec("0.349999"), P.approval)).toBe("COMERCIAL"); // tolerância de arredondamento (0,01%)
    expect(requiredApprovalLevel(dec(0.30), P.approval)).toBe("GERENCIAL");
    expect(requiredApprovalLevel(dec(0.25), P.approval)).toBe("GERENCIAL");
    expect(requiredApprovalLevel(dec(0.2), P.approval)).toBe("DIRETORIA");
    expect(requiredApprovalLevel(dec(podaLegacy.effectiveMargin), P.approval)).toBe("DIRETORIA");
  });
  it("permissões concedem alçadas cumulativas", () => {
    expect(grantableLevel(["pricing:negotiate"])).toBe("COMERCIAL");
    expect(grantableLevel(["pricing:negotiate", "pricing:approve"])).toBe("GERENCIAL");
    expect(grantableLevel(["pricing:direct"])).toBe("DIRETORIA");
    expect(grantableLevel(["pricing:read"])).toBeNull();
    expect(levelCovers("GERENCIAL", "COMERCIAL")).toBe(true);
    expect(levelCovers("GERENCIAL", "DIRETORIA")).toBe(false);
  });
});

describe("Snapshot", () => {
  it("hash independe da ordem das chaves (jsonb)", async () => {
    const { snapshotHash } = await import("../estimate-core");
    expect(snapshotHash({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: "z" } })).toBe(snapshotHash({ a: { c: "z", d: [1, { x: 1, y: 2 }] }, b: 1 }));
  });
});
