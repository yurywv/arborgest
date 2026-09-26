import { describe, expect, it } from "vitest";
import { planInterventions } from "../assessment-basis";
import { LEGACY_EXCEL_PARAMS, PRICING_PARAM_MIGRATIONS } from "../pricing/defaults";
import { calculate } from "../pricing/registry";

const T = (id: string) => ({ id, code: `ARB-${id}` });
const ins = (treeId: string, generalCondition: string, date = "2026-09-01", extra = {}) => ({ id: `i-${treeId}-${date}`, treeId, date, generalCondition, ...extra });
const risk = (treeId: string, riskRating: string, date = "2026-09-01") => ({ id: `r-${treeId}-${date}`, treeId, date, riskRating });

describe("Plano de intervenções a partir da base técnica", () => {
  it("risco extremo ou condição crítica → remoção/supressão urgente", () => {
    const p = planInterventions([T("1"), T("2")], [ins("2", "CRITICA")], [risk("1", "EXTREMO")]);
    expect(p.groups).toEqual([expect.objectContaining({ service: "SUPRESSAO", urgency: "URGENTE" })]);
    expect(p.groups[0].trees.map((t) => t.treeId).sort()).toEqual(["1", "2"]);
  });
  it("risco alto/moderado ou condição ruim/regular → poda, com a maior urgência entre risco, condição e prioridade", () => {
    const p = planInterventions([T("1"), T("2"), T("3")],
      [ins("1", "REGULAR"), ins("2", "RUIM"), ins("3", "BOA", "2026-09-01", { priority: "URGENTE" })],
      [risk("1", "ALTO"), risk("3", "MODERADO")]);
    const by = Object.fromEntries(p.trees.map((t) => [t.treeId, t]));
    expect(by["1"]).toMatchObject({ services: ["PODA"], urgency: "ALTA" }); // risco alto > condição regular
    expect(by["2"]).toMatchObject({ services: ["PODA"], urgency: "ALTA" });
    expect(by["3"]).toMatchObject({ services: ["PODA"], urgency: "URGENTE" }); // prioridade registrada na inspeção
  });
  it("usa o registro mais recente de cada exemplar", () => {
    const p = planInterventions([T("1")], [], [risk("1", "EXTREMO", "2026-01-10"), risk("1", "BAIXO", "2026-09-10")]);
    expect(p.trees[0]).toMatchObject({ services: [], urgency: "BAIXA" });
    expect(p.monitorOnly).toHaveLength(1);
  });
  it("fitossanidade comprometida acrescenta tratamento (exceto quando a árvore será removida)", () => {
    const p = planInterventions([T("1"), T("2")],
      [ins("1", "REGULAR", "2026-09-01", { phytoCondition: "RUIM" }), ins("2", "CRITICA", "2026-09-01", { phytoSeverity: "ALTA" })], []);
    const by = Object.fromEntries(p.trees.map((t) => [t.treeId, t]));
    expect(by["1"].services).toEqual(["PODA", "FITOSSANIDADE"]);
    expect(by["2"].services).toEqual(["SUPRESSAO"]);
  });
  it("árvore morta → remoção; removida/não localizada fica fora do plano", () => {
    const p = planInterventions([{ ...T("1"), status: "MORTA" }, { ...T("2"), status: "REMOVIDA" }], [ins("1", "BOA"), ins("2", "CRITICA")], []);
    expect(p.trees.map((t) => [t.treeId, t.services])).toEqual([["1", ["SUPRESSAO"]]]);
    expect(p.excluded.map((t) => t.id)).toEqual(["2"]);
  });
  it("grupos ordenados por urgência (mais urgente primeiro) e sem árvores sem registro", () => {
    const p = planInterventions([T("1"), T("2"), T("9")], [ins("1", "REGULAR")], [risk("2", "EXTREMO")]);
    expect(p.groups.map((g) => g.urgency)).toEqual(["URGENTE", "MEDIA"]);
    expect(p.trees.find((t) => t.treeId === "9")).toBeUndefined();
  });
});

describe("Acréscimo por urgência no preço", () => {
  const base = PRICING_PARAM_MIGRATIONS.reduce((p, m) => m.apply(p), LEGACY_EXCEL_PARAMS);
  const inp = { trees: 4, distanceKm: 20, difficulty: 2, auxiliaries: 2, lodging: false, toll: 0, serviceType: 2, license: false, cacamba: false, fuelLiters: 0, modifiers: [] };
  it("sem urgência ou com acréscimo 0: preço inalterado", () => {
    const a = calculate("PODA", inp, base).result.finalPrice;
    expect(calculate("PODA", { ...inp, urgency: "URGENTE" }, base).result.finalPrice).toBe(a);
  });
  it("acréscimo configurado entra no custo antes da margem e do imposto", () => {
    const p = structuredClone(base);
    p.general.urgencia = { BAIXA: "0", MEDIA: "0", ALTA: "0.1", URGENTE: "0.25" };
    const plain = calculate("PODA", inp, p).result;
    const urgent = calculate("PODA", { ...inp, urgency: "URGENTE" }, p).result;
    expect(Number(urgent.operationalCost)).toBeCloseTo(Number(plain.operationalCost) * 1.25, 6);
    expect(Number(urgent.finalPrice)).toBeCloseTo(Number(plain.finalPrice) * 1.25, 6);
    expect(urgent.components.some((c) => c.key === "acrescimoUrgencia")).toBe(true);
    expect(Number(calculate("CONSULTORIA", { trees: 1, days: 1, technicians: 1, auxiliaries: 0, distanceKm: 0, toll: 0, lodging: false, urgency: "ALTA" }, p).result.costs.urgencia)).toBeGreaterThan(0);
  });
});
