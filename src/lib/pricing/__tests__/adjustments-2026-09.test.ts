/* Ajustes de set/2026: valores regionais, caçamba informada, produtividade em 4 níveis, compensação por lei municipal,
 * frete e acompanhamento técnico. Parâmetros = versão pós-migração (PRICING_PARAM_MIGRATIONS). */
import { describe, expect, it } from "vitest";
import { LEGACY_EXCEL_PARAMS, PRICING_PARAM_MIGRATIONS, normalizeParams } from "../defaults";
import { calculate } from "../registry";
import { proposalExtras } from "../proposal-extras";
import type { PodaInputs, PricingParams, SupressaoInputs } from "../types";

const NEW = PRICING_PARAM_MIGRATIONS.reduce((p, m) => m.apply(p), LEGACY_EXCEL_PARAMS);
const near = (got: string | number | null | undefined, want: number, tol = 0.01) => expect(Math.abs(Number(got) - want)).toBeLessThanOrEqual(tol);
const baseSup: SupressaoInputs = { trees: 8, distanceKm: 0, difficulty: 1, auxiliaries: 4, lodging: false, toll: 0, serviceType: 2, compensation: false, cacamba: false, fuelLiters: 0, modifiers: [] };
const basePoda: PodaInputs = { trees: 8, distanceKm: 0, difficulty: 1, auxiliaries: 4, lodging: false, toll: 0, serviceType: 2, license: false, cacamba: false, fuelLiters: 0, modifiers: [] };
const sup = (o: Partial<SupressaoInputs> = {}, p: PricingParams = NEW) => calculate("SUPRESSAO", { ...baseSup, ...o }, p).result;
const poda = (o: Partial<PodaInputs> = {}, p: PricingParams = NEW) => calculate("PODA", { ...basePoda, ...o }, p).result;

describe("Parâmetros migrados (nova versão)", () => {
  it("supressão: fácil 8 · média 2 · difícil 1 · muito difícil 0,33, com altura/local", () => {
    expect(NEW.services.SUPRESSAO.productivity).toEqual({ 1: "8", 2: "2", 3: "1", 4: "0.33" });
    expect(NEW.services.SUPRESSAO.difficultyHints?.[1]).toMatch(/≤ 3 m/);
    expect(NEW.services.SUPRESSAO.difficultyHints?.[3]).toMatch(/perto/);
    expect(sup({ trees: 8, difficulty: 1 }).days).toBe(1);
    expect(sup({ trees: 4, difficulty: 2 }).days).toBe(2);
    expect(sup({ trees: 3, difficulty: 3 }).days).toBe(3);
    expect(sup({ trees: 1, difficulty: 4 }).days).toBe(4); // 1 ÷ 0,33 = 3,03 → 4
  });
  it("poda: 8 · 3 · 1 · 0,33", () => {
    expect(NEW.services.PODA.productivity).toEqual({ 1: "8", 2: "3", 3: "1", 4: "0.33" });
    expect(poda({ trees: 6, difficulty: 2 }).days).toBe(2);
    expect(poda({ trees: 2, difficulty: 3 }).days).toBe(2);
  });
  it("inventário continua com 3 níveis; nível 4 é recusado", () => {
    expect(() => calculate("INVENTARIO", { trees: 10, distanceKm: 0, difficulty: 4, auxiliaries: 1, lodging: false, toll: 0 }, NEW)).toThrow(/indisponível/);
  });
  it("não altera a versão original: a planilha continua com 10 / 2 / 0,33", () => {
    expect(LEGACY_EXCEL_PARAMS.services.SUPRESSAO.productivity).toEqual({ 1: "10", 2: "2", 3: "0.33" });
  });
});

describe("Valores regionais", () => {
  it("alimentação e hospedagem informadas substituem o padrão", () => {
    const r = sup({ trees: 8, auxiliaries: 4, lodging: true, mealCost: 70, lodgingCost: 150 }); // 1 dia, 5 pessoas
    near(r.costs.alimentacao, 1 * 5 * 70);
    near(r.costs.hospedagem, 1 * 5 * 150);
    const inv = calculate("INVENTARIO", { trees: 50, distanceKm: 0, difficulty: 2, auxiliaries: 3, lodging: false, toll: 0, mealCost: 80 }, NEW).result;
    near(inv.costs.alimentacao, 1 * 4 * 80);
  });
  it("em branco (null) usa o padrão dos parâmetros", () => {
    near(sup({ mealCost: null }).costs.alimentacao, 1 * 5 * 50);
  });
  it("rejeita valores negativos", () => {
    expect(() => sup({ mealCost: -1 })).toThrow(/negativo/);
    expect(() => sup({ cacamba: true, cacambaUnitPrice: -5 })).toThrow(/negativo/);
    expect(() => sup({ compensation: true, seedlings: -3 })).toThrow(/negativo/);
  });
});

describe("Caçamba", () => {
  it("quantidade e preço unitário informados", () => {
    const r = sup({ cacamba: true, cacambaQty: 3, cacambaUnitPrice: 850 });
    near(r.costs.cacamba, 2550);
    expect(r.details?.cacambaQty).toBe(3);
  });
  it("sem quantidade: regra de árvores por caçamba; preço regional aplicado", () => {
    near(sup({ trees: 21, cacamba: true, cacambaUnitPrice: 1200 }).costs.cacamba, 2 * 1200); // ⌈21/20⌉
    near(poda({ trees: 51, serviceType: 1, cacamba: true, cacambaQty: 1 }).costs.cacamba, 1000);
  });
  it("muito difícil usa a regra de ÷10", () => near(sup({ trees: 11, difficulty: 4, cacamba: true }).costs.cacamba, 2000));
});

describe("Compensação ambiental por lei municipal", () => {
  it("padrão = árvores × mudas por árvore × valor + fixo (igual à planilha)", () => {
    near(sup({ trees: 4, compensation: true }).costs.compensacao, 4 * 15 * 15 + 400);
  });
  it("mudas e valor por muda informados, com a lei citada", () => {
    const r = sup({ trees: 4, compensation: true, seedlings: 40, seedlingUnitPrice: 22, compensationLaw: "Lei Municipal nº 1.234/2020", compensationCity: "Campinas/SP" });
    near(r.costs.compensacao, 40 * 22 + 400);
    expect(r.details?.compensationLaw).toBe("Lei Municipal nº 1.234/2020");
    expect(r.components.find((c) => c.key === "compensacao")?.formula).toMatch(/Lei Municipal nº 1\.234\/2020/);
    expect(proposalExtras(r, { compensation: true }).join(" ")).toMatch(/40 muda\(s\) em Campinas\/SP, conforme Lei Municipal/);
  });
  it("mudas informadas sem lei geram aviso", () => {
    expect(sup({ compensation: true, seedlings: 10 }).warnings.some((w) => w.code === "COMPENSACAO_SEM_LEI")).toBe(true);
  });
});

describe("Frete", () => {
  it("valor informado para a cidade", () => near(sup({ freightMode: "FIXED", freightValue: 480 }).costs.frete, 480));
  it("calculado por distância × peso × tarifa, com mínimo", () => {
    const p = structuredClone(NEW);
    p.services.SUPRESSAO.frete = { tarifaTonKm: "2.5", valorMinimo: "300", pesoPorMudaKg: "4" };
    // 100 mudas × 4 kg = 0,4 t × 200 km × 2,5 = 200 → mínimo 300
    near(sup({ trees: 4, compensation: true, seedlings: 100, freightMode: "CALC", freightDistanceKm: 200 }, p).costs.frete, 300);
    // peso informado 2000 kg × 200 km × 2,5 = 1000
    near(sup({ freightMode: "CALC", freightDistanceKm: 200, freightWeightKg: 2000 }, p).costs.frete, 1000);
  });
  it("frete fica fora dos fatores de dificuldade", () => {
    const r = sup({ freightMode: "FIXED", freightValue: 500, modifiers: ["CONCRETO"] });
    near(Number(r.operationalCost) - Number(r.afterModifiers) - Number(r.costs.rateioFixo), 500);
  });
  it("tarifa não configurada gera aviso", () => expect(sup({ freightMode: "CALC", freightDistanceKm: 10, freightWeightKg: 100 }).warnings.some((w) => w.code === "FRETE_SEM_TARIFA")).toBe(true));
});

describe("Acompanhamento técnico", () => {
  it("diária + alimentação + hospedagem + transporte pelos dias da operação", () => {
    const r = poda({ trees: 16, difficulty: 1, distanceKm: 100, toll: 20, lodging: true, supervision: true, mealCost: 60, lodgingCost: 180 }); // 2 dias
    near(r.costs.supervisao, 2 * 400 + 2 * 60 + 2 * 180 + 2 * (100 * 1 + 20));
    expect(r.details?.supervisionDays).toBe(2);
  });
  it("dias de acompanhamento informados", () => {
    near(sup({ trees: 16, supervision: true, supervisionDays: 1 }).costs.supervisao, 400 + 50); // sem hospedagem/distância
  });
  it("desligado (ou ausente, como nos orçamentos antigos) = 0", () => {
    near(sup({ supervision: false }).costs.supervisao, 0);
    near(sup().costs.supervisao, 0);
  });
  it("entra no custo operacional e no preço", () => {
    const off = sup({ supervision: false }), on = sup({ supervision: true });
    near(Number(on.operationalCost) - Number(off.operationalCost), Number(on.costs.supervisao));
    expect(Number(on.finalPrice)).toBeGreaterThan(Number(off.finalPrice));
  });
});

describe("Compatibilidade com versões antigas", () => {
  it("snapshot sem os campos novos é completado sem mudar valores", () => {
    const old = structuredClone(LEGACY_EXCEL_PARAMS) as PricingParams & { general: Partial<PricingParams["general"]> };
    delete (old.general as Partial<PricingParams["general"]>).supervisaoDia;
    delete old.services.SUPRESSAO.frete;
    const n = normalizeParams(old as PricingParams);
    expect(n.general.supervisaoDia).toBe(n.general.tecnicoDia);
    expect(n.services.SUPRESSAO.frete?.tarifaTonKm).toBe("0");
    expect(calculate("SUPRESSAO", baseSup, old as PricingParams).result.finalPrice).toBe(calculate("SUPRESSAO", baseSup, LEGACY_EXCEL_PARAMS).result.finalPrice);
  });
});
