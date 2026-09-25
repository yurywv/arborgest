/* Serviços por diárias (avaliação de risco, consultoria, licenciamento, manejo, manutenção, plantio, fitossanidade). */
import { describe, expect, it } from "vitest";
import { LEGACY_EXCEL_PARAMS, PRICING_PARAM_MIGRATIONS } from "../defaults";
import { SERVICES, SERVICE_CODES, calculate } from "../registry";
import { SERVICES as CATALOG } from "@/lib/catalogs";

const P = PRICING_PARAM_MIGRATIONS.reduce((p, m) => m.apply(p), LEGACY_EXCEL_PARAMS);
const g = P.general;
const near = (got: string | number, want: number) => expect(Math.abs(Number(got) - want)).toBeLessThanOrEqual(0.01);
const base = { trees: 1, days: 2, technicians: 1, auxiliaries: 1, distanceKm: 40, toll: 10, lodging: true };

describe("Catálogo único", () => {
  it("precificação oferece os mesmos serviços, na mesma ordem e com os mesmos nomes das oportunidades", () => {
    expect(SERVICE_CODES.map((c) => SERVICES[c].name)).toEqual(CATALOG.map((o) => o.label));
    expect(SERVICE_CODES.map((c) => SERVICES[c].osService)).toEqual(CATALOG.map((o) => o.value));
  });
});

describe("Cálculo por diárias", () => {
  it("mão de obra, logística, materiais, terceiros e rateio → preço com margem e imposto", () => {
    const r = calculate("CONSULTORIA", { ...base, materials: 200, thirdParty: 300 }, P).result;
    const persons = 2, days = 2;
    const labor = days * Number(g.tecnicoDia) + days * Number(g.auxiliarDia);
    const travel = (40 * Number(g.custoKm) + 10) * days * persons;
    const food = days * persons * Number(g.alimentacaoPessoaDia);
    const lodge = days * persons * Number(g.hospedagemPessoaDia);
    const rateio = days * (Number(g.custoFixoMensal) / Number(g.diasProdutivosMes));
    const op = labor + travel + food + lodge + 200 + 300 + rateio;
    near(r.operationalCost, op);
    near(r.finalPrice, op / (1 - Number(g.margem)) / (1 - Number(g.imposto)));
    expect(r.days).toBe(2);
    expect(r.persons).toBe(2);
  });
  it("preço unitário na unidade do serviço (plantio por muda)", () => {
    const r = calculate("PLANTIO", { ...base, trees: 50, materials: 1500 }, P).result;
    near(r.unitPrice, Number(r.finalPrice) / 50);
    expect(r.components.find((c) => c.key === "precoUnitario")?.label).toBe("Preço por muda");
  });
  it("campos opcionais em branco = sem custo; valores regionais substituem o padrão", () => {
    const r = calculate("MANUTENCAO", { ...base, materials: "", thirdParty: null, mealCost: 80 }, P).result;
    expect(r.costs.materiais).toBe("0");
    near(r.costs.alimentacao, 2 * 2 * 80);
  });
  it("valida quantidade, dias e valores negativos", () => {
    expect(() => calculate("PLANTIO", { ...base, trees: 0 }, P)).toThrow(/quantidade/i);
    expect(() => calculate("PLANTIO", { ...base, days: 0 }, P)).toThrow(/dias/i);
    expect(() => calculate("PLANTIO", { ...base, materials: -1 }, P)).toThrow(/negativo/);
  });
});
