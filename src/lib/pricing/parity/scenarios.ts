/* Cenários de paridade com a planilha "Arborent_Precificacao_final_v2.xlsx".
 * Os mesmos inputs são aplicados (a) no Excel, por scripts/pricing-parity/generate-excel-fixtures.mts,
 * que grava os resultados calculados pelo próprio Excel em excel-results.json, e (b) no motor v1.
 * O teste src/lib/pricing/__tests__/parity.test.ts compara ambos com tolerância de R$ 0,01.
 */
import type { CoreServiceCode, InventarioInputs, PodaInputs, ServiceCode, SupressaoInputs } from "../types";

export type Scenario =
  | { id: string; title: string; service: "INVENTARIO"; inputs: InventarioInputs }
  | { id: string; title: string; service: "SUPRESSAO"; inputs: SupressaoInputs }
  | { id: string; title: string; service: "PODA"; inputs: PodaInputs };

const ALL_MODS = ["ALTURA", "REDE_ELETRICA", "ACESSO_DIFICIL", "RESIDUOS_EXTRA", "ANIMAIS", "MATERIAL_UMIDO", "VEGETACAO_INTERFERENTE", "CONCRETO"];

export const SCENARIOS: Scenario[] = [
  // ── Inventário ──
  { id: "INV-1", title: "Inventário média, sem hospedagem, com pedágio", service: "INVENTARIO",
    inputs: { trees: 350, distanceKm: 120, difficulty: 2, auxiliaries: 3, lodging: false, toll: 45 } },
  { id: "INV-2", title: "Inventário fácil com hospedagem", service: "INVENTARIO",
    inputs: { trees: 380, distanceKm: 80, difficulty: 1, auxiliaries: 2, lodging: true, toll: 0 } },
  { id: "INV-3", title: "Inventário difícil sem auxiliares (0 pessoas)", service: "INVENTARIO",
    inputs: { trees: 100, distanceKm: 40, difficulty: 3, auxiliaries: 0, lodging: false, toll: 0 } },
  { id: "INV-4", title: "Inventário grande com hospedagem e 5 auxiliares", service: "INVENTARIO",
    inputs: { trees: 1000, distanceKm: 300, difficulty: 2, auxiliaries: 5, lodging: true, toll: 60 } },

  // ── Supressão ──
  { id: "SUP-1", title: "Supressão fácil, licenciamento (≥10), sem caçamba", service: "SUPRESSAO",
    inputs: { trees: 12, distanceKm: 60, difficulty: 1, auxiliaries: 2, lodging: false, toll: 0, serviceType: 1, compensation: false, cacamba: false, fuelLiters: 10, modifiers: [] } },
  { id: "SUP-2", title: "Supressão média, licença 6–9, compensação, caçamba, hospedagem", service: "SUPRESSAO",
    inputs: { trees: 7, distanceKm: 100, difficulty: 2, auxiliaries: 3, lodging: true, toll: 20, serviceType: 1, compensation: true, cacamba: true, fuelLiters: 25, modifiers: [] } },
  { id: "SUP-3", title: "Supressão difícil, apenas supressão, caçamba", service: "SUPRESSAO",
    inputs: { trees: 3, distanceKm: 50, difficulty: 3, auxiliaries: 4, lodging: false, toll: 15, serviceType: 2, compensation: false, cacamba: true, fuelLiters: 8, modifiers: [] } },
  { id: "SUP-4", title: "Supressão com todos os modificadores (inclui rede elétrica +1 dia)", service: "SUPRESSAO",
    inputs: { trees: 15, distanceKm: 200, difficulty: 2, auxiliaries: 6, lodging: true, toll: 30, serviceType: 1, compensation: true, cacamba: true, fuelLiters: 40, modifiers: ALL_MODS } },
  { id: "SUP-5", title: "Supressão fácil, licença 1–5, acesso difícil + úmido + concreto", service: "SUPRESSAO",
    inputs: { trees: 4, distanceKm: 30, difficulty: 1, auxiliaries: 1, lodging: false, toll: 0, serviceType: 1, compensation: false, cacamba: false, fuelLiters: 5, modifiers: ["ACESSO_DIFICIL", "MATERIAL_UMIDO", "CONCRETO"] } },
  { id: "SUP-6", title: "Supressão sem auxiliares (0 técnicos)", service: "SUPRESSAO",
    inputs: { trees: 5, distanceKm: 20, difficulty: 1, auxiliaries: 0, lodging: false, toll: 0, serviceType: 2, compensation: false, cacamba: false, fuelLiters: 4, modifiers: [] } },
  { id: "SUP-7", title: "Supressão fácil com caçamba (÷20) e compensação, sem licença", service: "SUPRESSAO",
    inputs: { trees: 25, distanceKm: 70, difficulty: 1, auxiliaries: 2, lodging: false, toll: 12.5, serviceType: 2, compensation: true, cacamba: true, fuelLiters: 30, modifiers: ["RESIDUOS_EXTRA", "VEGETACAO_INTERFERENTE"] } },

  // ── Poda ──
  { id: "POD-1", title: "Poda apenas limpeza, caçamba (÷100)", service: "PODA",
    inputs: { trees: 40, distanceKm: 80, difficulty: 1, auxiliaries: 2, lodging: false, toll: 10, serviceType: 2, license: false, cacamba: true, fuelLiters: 12, modifiers: [] } },
  { id: "POD-2", title: "Poda apenas raleamento, licença ≥10, caçamba, hospedagem", service: "PODA",
    inputs: { trees: 20, distanceKm: 150, difficulty: 2, auxiliaries: 3, lodging: true, toll: 0, serviceType: 3, license: true, cacamba: true, fuelLiters: 20, modifiers: [] } },
  { id: "POD-3", title: "Poda limpeza + raleamento, licença, sem caçamba", service: "PODA",
    inputs: { trees: 48, distanceKm: 60, difficulty: 2, auxiliaries: 4, lodging: false, toll: 25, serviceType: 1, license: true, cacamba: false, fuelLiters: 30, modifiers: [] } },
  { id: "POD-4", title: "Poda difícil com todos os modificadores", service: "PODA",
    inputs: { trees: 10, distanceKm: 100, difficulty: 3, auxiliaries: 5, lodging: true, toll: 40, serviceType: 1, license: true, cacamba: true, fuelLiters: 50, modifiers: ALL_MODS } },
  { id: "POD-5", title: "Poda limpeza, licença <10, acesso difícil + úmido", service: "PODA",
    inputs: { trees: 6, distanceKm: 35, difficulty: 1, auxiliaries: 2, lodging: false, toll: 0, serviceType: 2, license: true, cacamba: true, fuelLiters: 6, modifiers: ["ACESSO_DIFICIL", "MATERIAL_UMIDO"] } },
  { id: "POD-6", title: "Poda raleamento sem auxiliares (0 técnicos)", service: "PODA",
    inputs: { trees: 8, distanceKm: 25, difficulty: 1, auxiliaries: 0, lodging: false, toll: 0, serviceType: 3, license: false, cacamba: false, fuelLiters: 3, modifiers: [] } },
];

// ── Mapeamento para as células da planilha ──
export const SHEET: Record<CoreServiceCode, string> = { INVENTARIO: "INVENTARIO_V0", SUPRESSAO: "SUPRESSAO_V0", PODA: "PODA_V0" };

const MOD_CELLS: Record<"SUPRESSAO" | "PODA", Record<string, string>> = {
  SUPRESSAO: { ALTURA: "E17", REDE_ELETRICA: "E18", ACESSO_DIFICIL: "E19", RESIDUOS_EXTRA: "E20", ANIMAIS: "E21", MATERIAL_UMIDO: "E22", VEGETACAO_INTERFERENTE: "E23", CONCRETO: "E24" },
  PODA: { ALTURA: "E16", REDE_ELETRICA: "E17", ACESSO_DIFICIL: "E18", RESIDUOS_EXTRA: "E19", ANIMAIS: "E20", MATERIAL_UMIDO: "E21", VEGETACAO_INTERFERENTE: "E22", CONCRETO: "E23" },
};

const b = (v: boolean) => (v ? 1 : 0);

/** Células de entrada → valor, para o cenário. */
export function inputCells(sc: Scenario): Record<string, number> {
  const i = sc.inputs;
  const common = { B2: i.trees, B3: i.distanceKm, B4: i.difficulty, B5: i.auxiliaries, B6: b(i.lodging) };
  if (sc.service === "INVENTARIO") return { ...common, B7: i.toll };
  const mods = Object.fromEntries(Object.entries(MOD_CELLS[sc.service]).map(([k, cell]) => [cell, b(sc.inputs.modifiers.includes(k))]));
  if (sc.service === "SUPRESSAO") {
    const s = sc.inputs;
    return { ...common, B7: b(s.compensation), B8: s.toll, B9: s.serviceType, B10: b(s.cacamba), B11: s.fuelLiters, ...mods };
  }
  const p = sc.inputs;
  return { ...common, B7: p.toll, B8: p.serviceType, B9: b(p.license), B10: b(p.cacamba), B11: p.fuelLiters, ...mods };
}

/** Células de saída → chave do resultado do motor. */
export const OUTPUT_CELLS: Record<CoreServiceCode, Record<string, string>> = {
  INVENTARIO: {
    days: "B8", persons: "B9", tecnico: "B12", auxiliares: "B13", deslocamento: "B14", alimentacao: "B15", hospedagem: "B16",
    plaquinhas: "B17", rateioFixo: "B18", operationalCost: "B20", priceBeforeTax: "B22", finalPrice: "B23", unitPrice: "B24",
  },
  SUPRESSAO: {
    days: "B14", persons: "B15", tecnico: "B17", auxiliares: "B18", deslocamento: "B19", alimentacao: "B20", hospedagem: "B21",
    combustivel: "B22", cacamba: "B23", rateioFixo: "B24", licenca: "B26", compensacao: "B28", baseCost: "B30",
    modifiersFactor: "B31", afterModifiers: "B32", operationalCost: "B34", priceBeforeTax: "B36", finalPrice: "B37", unitPrice: "B38",
  },
  PODA: {
    days: "B14", persons: "B15", tecnico: "B17", auxiliares: "B18", deslocamento: "B19", alimentacao: "B20", hospedagem: "B21",
    combustivel: "B22", cacamba: "B23", rateioFixo: "B24", licenca: "B26", baseCost: "B28", serviceTypeFactor: "B29",
    modifiersFactor: "B30", afterModifiers: "B31", operationalCost: "B34", priceBeforeTax: "B36", finalPrice: "B37", unitPrice: "B38",
  },
};
