/* Testes unitários por fórmula (valores calculados à mão a partir dos parâmetros da planilha). */
import { describe, expect, it } from "vitest";
import { LEGACY_EXCEL_PARAMS as P, toV2 } from "../defaults";
import { calculate } from "../registry";
import type { PodaInputs, PricingParams, SupressaoInputs } from "../types";

const near = (got: string | number, want: number, tol = 0.01) => expect(Math.abs(Number(got) - want)).toBeLessThanOrEqual(tol);
const sup = (o: Partial<SupressaoInputs> = {}, p: PricingParams = P) =>
  calculate("SUPRESSAO", { trees: 10, distanceKm: 0, difficulty: 1, auxiliaries: 4, lodging: false, toll: 0, serviceType: 2, compensation: false, cacamba: false, fuelLiters: 0, modifiers: [], ...o }, p).result;
const poda = (o: Partial<PodaInputs> = {}, p: PricingParams = P) =>
  calculate("PODA", { trees: 10, distanceKm: 0, difficulty: 1, auxiliaries: 4, lodging: false, toll: 0, serviceType: 2, license: false, cacamba: false, fuelLiters: 0, modifiers: [], ...o }, p).result;
const inv = (o: object = {}, p: PricingParams = P) =>
  calculate("INVENTARIO", { trees: 100, distanceKm: 0, difficulty: 2, auxiliaries: 3, lodging: false, toll: 0, ...o }, p).result;
const withP = (fn: (p: PricingParams) => void) => { const c = structuredClone(P); fn(c); return c; };

describe("Parâmetros derivados", () => {
  it("custo fixo/dia = 8500/20 = 425; hora técnico = 400/8 = 50", () => {
    const r = inv({ trees: 50, auxiliaries: 0 }); // 1 dia
    near(r.costs.rateioFixo, 425);
    near(sup({ trees: 5, serviceType: 1 }).costs.licenca, 5 / 5 * 50 * 4);
  });
});

describe("Inventário", () => {
  it("dias = ⌈árvores/produtividade⌉", () => {
    expect(inv({ trees: 101, difficulty: 2 }).days).toBe(3); // 101/50
    expect(inv({ trees: 100, difficulty: 1 }).days).toBe(1);
    expect(inv({ trees: 41, difficulty: 3 }).days).toBe(2); // 41/40
  });
  it("equipe = auxiliares + ⌈auxiliares/4⌉; v1 cobra sempre 1 técnico", () => {
    const r = inv({ trees: 50, auxiliaries: 8 }); // 1 dia
    expect(r.persons).toBe(10);
    near(r.costs.tecnico, 400);
    near(r.costs.auxiliares, 1600);
  });
  it("v2 cobra os técnicos da equipe", () => near(inv({ trees: 50, auxiliaries: 8 }, toV2(P)).costs.tecnico, 800));
  it("deslocamento, alimentação, hospedagem e plaquetas", () => {
    const r = inv({ trees: 100, auxiliaries: 3, distanceKm: 100, toll: 20, lodging: true }); // 2 dias, 4 pessoas
    near(r.costs.deslocamento, (100 * 1 + 20) * 2 * 4);
    near(r.costs.alimentacao, 2 * 4 * 50);
    near(r.costs.hospedagem, 2 * 4 * 200);
    near(r.costs.plaquinhas, 100 * 6.15);
  });
  it("sem hospedagem = 0", () => near(inv({ lodging: false }).costs.hospedagem, 0));
  it("preço = custo ÷ (1−35%) ÷ (1−11%) e margem efetiva = 35%", () => {
    const r = inv();
    near(r.finalPrice, Number(r.operationalCost) / 0.65 / 0.89);
    near(r.effectiveMargin, 0.35, 1e-9);
    near(r.unitPrice, Number(r.finalPrice) / 100);
  });
});

describe("Supressão", () => {
  it("produtividade fácil/média/difícil = 10 / 2 / 0,33", () => {
    expect(sup({ trees: 10, difficulty: 1 }).days).toBe(1);
    expect(sup({ trees: 3, difficulty: 2 }).days).toBe(2);
    expect(sup({ trees: 1, difficulty: 3 }).days).toBe(4); // 1/0,33 = 3,03 → 4
  });
  it("técnico = dias × 400 × ⌈auxiliares/4⌉", () => near(sup({ trees: 10, auxiliaries: 5 }).costs.tecnico, 1 * 400 * 2));
  it("caçamba: fácil ÷20, média/difícil ÷10", () => {
    near(sup({ trees: 21, cacamba: true, difficulty: 1 }).costs.cacamba, 2000);
    near(sup({ trees: 11, cacamba: true, difficulty: 2 }).costs.cacamba, 2000);
    near(sup({ trees: 10, cacamba: true, difficulty: 3 }).costs.cacamba, 1000);
    near(sup({ trees: 21, cacamba: false }).costs.cacamba, 0);
  });
  it("licenciamento por faixa (1–5: ÷5×4h; 6–9: ÷9×6h; ≥10: ÷10×8h)", () => {
    near(sup({ trees: 5, serviceType: 1 }).costs.licenca, 200);
    near(sup({ trees: 6, serviceType: 1 }).costs.licenca, 6 / 9 * 50 * 6);
    near(sup({ trees: 9, serviceType: 1 }).costs.licenca, 300);
    near(sup({ trees: 12, serviceType: 1 }).costs.licenca, 480);
    near(sup({ trees: 12, serviceType: 2 }).costs.licenca, 0);
  });
  it("compensação = árvores × 15 × 15 + 400, parametrizável", () => {
    near(sup({ trees: 4, compensation: true }).costs.compensacao, 4 * 225 + 400);
    const p = withP((c) => { c.services.SUPRESSAO.compensacao = { unidadesPorArvore: "20", valorUnidade: "10", custoFixo: "100" }; });
    near(sup({ trees: 4, compensation: true }, p).costs.compensacao, 900);
  });
  it("modificadores são multiplicados (não somados)", () => {
    const r = sup({ modifiers: ["ACESSO_DIFICIL", "MATERIAL_UMIDO", "CONCRETO"] });
    near(r.modifiersFactor, 1.05 * 1.05 * 1.08, 1e-12);
    near(r.afterModifiers, Number(r.baseCost) * 1.1907);
  });
  it("todos os modificadores = 1,03 × 1,05 × 1,02 × 1,065 × 1,05 × 1,02 × 1,08", () =>
    near(sup({ modifiers: ["ALTURA", "REDE_ELETRICA", "ACESSO_DIFICIL", "RESIDUOS_EXTRA", "ANIMAIS", "MATERIAL_UMIDO", "VEGETACAO_INTERFERENTE", "CONCRETO"] }).modifiersFactor,
      1.03 * 1.05 * 1.02 * 1.065 * 1.05 * 1.02 * 1.08, 1e-12));
  it("rede elétrica acrescenta 1 dia; v1 ignora seu fator (planilha), v2 multiplica", () => {
    expect(sup({ trees: 10, modifiers: ["REDE_ELETRICA"] }).days).toBe(2);
    const p = withP((c) => { c.services.SUPRESSAO.modifiers!.find((m) => m.key === "REDE_ELETRICA")!.factor = "1.1"; });
    const v1 = sup({ modifiers: ["REDE_ELETRICA"] }, p);
    near(v1.modifiersFactor, 1, 1e-12);
    expect(v1.warnings.some((w) => w.code === "MOD_IGNORADO_REDE_ELETRICA")).toBe(true);
    near(sup({ modifiers: ["REDE_ELETRICA"] }, toV2(p)).modifiersFactor, 1.1, 1e-12);
  });
  it("v1: compensação entra no custo base (multiplicada); v2: fora dos fatores", () => {
    const o = { trees: 4, compensation: true, modifiers: ["CONCRETO"] };
    const v1 = sup(o);
    const v2 = sup(o, toV2(P));
    near(Number(v1.afterModifiers), (Number(v1.baseCost)) * 1.08);
    expect(Number(v1.baseCost)).toBeGreaterThan(Number(v1.costs.compensacao));
    near(Number(v2.operationalCost) - Number(v2.afterModifiers) - Number(v2.costs.rateioFixo) - Number(v2.costs.licenca) - Number(v2.costs.cacamba), 1300);
  });
});

describe("Poda", () => {
  it("produtividade 8 / 5 / 0,33 e fator do tipo (1,07 / 1,00 / 1,05)", () => {
    expect(poda({ trees: 9, difficulty: 1 }).days).toBe(2);
    expect(poda({ trees: 5, difficulty: 2 }).days).toBe(1);
    near(poda({ serviceType: 1 }).serviceTypeFactor, 1.07, 1e-12);
    near(poda({ serviceType: 2 }).serviceTypeFactor, 1, 1e-12);
    near(poda({ serviceType: 3 }).serviceTypeFactor, 1.05, 1e-12);
  });
  it("caçamba: só limpeza ÷100; demais ÷50", () => {
    near(poda({ trees: 101, cacamba: true, serviceType: 2 }).costs.cacamba, 2000);
    near(poda({ trees: 51, cacamba: true, serviceType: 1 }).costs.cacamba, 2000);
    near(poda({ trees: 50, cacamba: true, serviceType: 3 }).costs.cacamba, 1000);
  });
  it("licença: < 10 árvores ÷5×4h; ≥ 10 ÷10×8h", () => {
    near(poda({ trees: 9, license: true }).costs.licenca, 9 / 5 * 50 * 4);
    near(poda({ trees: 10, license: true }).costs.licenca, 400);
    near(poda({ trees: 10, license: false }).costs.licenca, 0);
  });
  it("após modificadores = base × fator tipo × fatores", () => {
    const r = poda({ serviceType: 1, modifiers: ["ALTURA", "ANIMAIS"] });
    near(r.afterModifiers, Number(r.baseCost) * 1.07 * 1.03 * 1.065);
  });
  it("metodologia LEGADA: preço = custo ÷ (1−imposto), margem efetiva 0%", () => {
    const r = poda();
    expect(r.priceMethod).toBe("LEGACY_PODA");
    near(r.finalPrice, Number(r.operationalCost) / 0.89);
    near(r.priceBeforeTax, Number(r.operationalCost) / 0.65); // calculado, mas não usado (como na planilha)
    near(r.effectiveMargin, 0, 1e-9);
    expect(r.warnings.some((w) => w.code === "PODA_LEGADO")).toBe(true);
  });
  it("metodologia PADRONIZADA: preço = custo ÷ (1−margem) ÷ (1−imposto)", () => {
    const p = withP((c) => { c.rules.podaPriceMethod = "STANDARD"; });
    const r = poda({}, p);
    near(r.finalPrice, Number(r.operationalCost) / 0.65 / 0.89);
    near(r.effectiveMargin, 0.35, 1e-9);
  });
});

describe("Equipe mínima", () => {
  it("0 auxiliares na planilha → 0 técnicos e 0 pessoas (com aviso que exige confirmação)", () => {
    const r = sup({ auxiliaries: 0 });
    expect(r.technicians).toBe(0);
    expect(r.persons).toBe(0);
    near(r.costs.tecnico, 0);
    expect(r.warnings.find((w) => w.code === "ZERO_TECNICOS")?.level).toBe("confirm");
  });
  it("mínimo de 1 técnico → 1 técnico, 1 pessoa", () => {
    const p = withP((c) => { c.rules.minTecnicos = 1; });
    const r = sup({ auxiliaries: 0, trees: 10, distanceKm: 10 }, p);
    expect(r.technicians).toBe(1);
    expect(r.persons).toBe(1);
    near(r.costs.tecnico, 400);
    near(r.costs.deslocamento, 10);
  });
});

describe("Validação", () => {
  it("rejeita árvores, distância e auxiliares negativos", () => {
    expect(() => inv({ trees: -1 })).toThrow(/negativo/);
    expect(() => inv({ distanceKm: -5 })).toThrow(/negativo/);
    expect(() => inv({ auxiliaries: -2 })).toThrow(/negativo/);
    expect(() => inv({ trees: 2.5 })).toThrow(/inteiro/);
  });
  it("rejeita margem/imposto ≥ 100%, produtividade ≤ 0 e fator ≤ 0", () => {
    expect(() => inv({}, withP((c) => { c.general.margem = "1"; }))).toThrow(/Margem/);
    expect(() => inv({}, withP((c) => { c.general.imposto = "1.2"; }))).toThrow(/Imposto/);
    expect(() => inv({}, withP((c) => { c.services.INVENTARIO.productivity[2] = "0"; }))).toThrow(/Produtividade/);
    expect(() => sup({ modifiers: ["CONCRETO"] }, withP((c) => { c.services.SUPRESSAO.modifiers!.find((m) => m.key === "CONCRETO")!.factor = "0"; }))).toThrow(/Fator/);
  });
  it("rejeita modificador inexistente ou inativo", () => {
    expect(() => sup({ modifiers: ["XYZ"] })).toThrow(/indisponível/);
    expect(() => sup({ modifiers: ["CONCRETO"] }, withP((c) => { c.services.SUPRESSAO.modifiers!.find((m) => m.key === "CONCRETO")!.active = false; }))).toThrow(/indisponível/);
  });
  it("arredonda o preço final a centavos só na saída", () => {
    const r = inv();
    expect(r.finalPriceRounded).toMatch(/^\d+(\.\d{1,2})?$/);
    near(r.finalPriceRounded, Number(r.finalPrice), 0.005);
  });
  it("valores anormais geram avisos de confirmação", () => {
    expect(inv({ trees: 6000 }).warnings.some((w) => w.code === "MUITAS_ARVORES" && w.level === "confirm")).toBe(true);
    expect(inv({ distanceKm: 2500 }).warnings.some((w) => w.code === "DISTANCIA_ALTA")).toBe(true);
  });
});

describe("Motor v2 impõe suas regras", () => {
  it("poda padronizada e mínimo de 1 técnico mesmo com regras legadas gravadas", () => {
    const v2 = { ...P, engineVersion: "V2_ARBORENT" as const }; // rules: LEGACY / minTecnicos 0
    const r = poda({ auxiliaries: 0 }, v2);
    expect(r.priceMethod).toBe("STANDARD");
    expect(r.technicians).toBe(1);
    near(r.effectiveMargin, 0.35, 1e-9);
  });
});
