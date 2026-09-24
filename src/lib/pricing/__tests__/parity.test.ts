/* Paridade com a planilha: resultados calculados pelo próprio Excel (excel-results.json) vs. motor v1.
 * Tolerância financeira: R$ 0,01. Contagens (dias, pessoas) e fatores: exatos (1e-9).
 */
import { describe, expect, it } from "vitest";
import excel from "../parity/excel-results.json";
import { SCENARIOS } from "../parity/scenarios";
import { LEGACY_EXCEL_PARAMS } from "../defaults";
import { calculate } from "../registry";
import type { CalcResult } from "../types";

const EXACT = new Set(["days", "persons", "modifiersFactor", "serviceTypeFactor"]);

function engineValue(r: CalcResult, key: string): number {
  if (key in r.costs) return Number(r.costs[key]);
  const v = (r as unknown as Record<string, unknown>)[key];
  if (v === undefined) throw new Error(`chave ${key} ausente no resultado`);
  return Number(v);
}

describe("Paridade com Arborent_Precificacao_final_v2.xlsx (motor v1 — legado Excel)", () => {
  it("cobre todos os cenários", () => {
    expect(Object.keys(excel.results).sort()).toEqual(SCENARIOS.map((s) => s.id).sort());
  });

  for (const sc of SCENARIOS) {
    it(`${sc.id} — ${sc.title}`, () => {
      const expected = (excel.results as Record<string, Record<string, number>>)[sc.id];
      const { result } = calculate(sc.service, sc.inputs, LEGACY_EXCEL_PARAMS);
      for (const [key, want] of Object.entries(expected)) {
        const got = engineValue(result, key);
        const tol = EXACT.has(key) ? 1e-9 : 0.01;
        expect(Math.abs(got - want), `${sc.id}.${key}: motor ${got} × Excel ${want}`).toBeLessThanOrEqual(tol);
      }
      // O preço arredondado (valor do orçamento) difere do Excel em no máximo meio centavo.
      expect(Math.abs(Number(result.finalPriceRounded) - expected.finalPrice)).toBeLessThanOrEqual(0.005 + 1e-9);
    });
  }
});
