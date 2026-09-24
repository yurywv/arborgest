/* Valores iniciais — reproduzem a planilha "Arborent_Precificacao_final_v2.xlsx".
 * Usados APENAS para criar a primeira versão de parâmetros (bootstrap/seed). Em operação, o motor lê
 * sempre a versão de parâmetros gravada no banco (Administração › Precificação).
 */
import type { ModifierDef, PricingParams } from "./types";

const MODIFIERS: ModifierDef[] = [
  { key: "ALTURA", label: "Altura elevada / técnicas especiais", factor: "1.03", active: true, order: 1, addsDays: 0, legacyInProduct: true },
  { key: "REDE_ELETRICA", label: "Proximidade de rede elétrica", factor: "1.00", active: true, order: 2, addsDays: 1, legacyInProduct: false },
  { key: "ACESSO_DIFICIL", label: "Acesso difícil / área confinada", factor: "1.05", active: true, order: 3, addsDays: 0, legacyInProduct: true },
  { key: "RESIDUOS_EXTRA", label: "Volume extra de resíduos", factor: "1.02", active: true, order: 4, addsDays: 0, legacyInProduct: true },
  { key: "ANIMAIS", label: "Animais / insetos / vertebrados", factor: "1.065", active: true, order: 5, addsDays: 0, legacyInProduct: true },
  { key: "MATERIAL_UMIDO", label: "Material úmido", factor: "1.05", active: true, order: 6, addsDays: 0, legacyInProduct: true },
  { key: "VEGETACAO_INTERFERENTE", label: "Vegetação interferente", factor: "1.02", active: true, order: 7, addsDays: 0, legacyInProduct: true },
  { key: "CONCRETO", label: "Concreto", factor: "1.08", active: true, order: 8, addsDays: 0, legacyInProduct: true },
];

export const LEGACY_EXCEL_PARAMS: PricingParams = {
  engineVersion: "V1_LEGACY_EXCEL",
  general: {
    tecnicoDia: "400",
    auxiliarDia: "200",
    custoKm: "1",
    alimentacaoPessoaDia: "50",
    hospedagemPessoaDia: "200",
    plaquinhaArvore: "6.15",
    imposto: "0.11",
    margem: "0.35",
    custoFixoMensal: "8500",
    diasProdutivosMes: "20",
    combustivelLitro: "6",
    cacamba: "1000",
    horasDia: "8",
  },
  rules: { podaPriceMethod: "LEGACY", minTecnicos: 0, auxiliaresPorTecnico: "4" },
  approval: { margemComercial: "0.35", margemGerencial: "0.25", descontoAlerta: "0.15", fluxoObrigatorio: true },
  services: {
    INVENTARIO: { productivity: { 1: "100", 2: "50", 3: "40" } },
    SUPRESSAO: {
      productivity: { 1: "10", 2: "2", 3: "0.33" },
      serviceTypes: [
        { code: 1, label: "Licenciamento + Supressão", factor: "1", includesLicense: true },
        { code: 2, label: "Apenas supressão", factor: "1", includesLicense: false },
      ],
      licenseTiers: [
        { minTrees: 1, maxTrees: 5, divisor: "5", hours: "4" },
        { minTrees: 6, maxTrees: 9, divisor: "9", hours: "6" },
        { minTrees: 10, maxTrees: null, divisor: "10", hours: "8" },
      ],
      cacambaArvoresPor: { 1: "20", 2: "10", 3: "10" },
      compensacao: { unidadesPorArvore: "15", valorUnidade: "15", custoFixo: "400" },
      modifiers: MODIFIERS,
    },
    PODA: {
      productivity: { 1: "8", 2: "5", 3: "0.33" },
      serviceTypes: [
        { code: 1, label: "Limpeza + Raleamento", factor: "1.07", cacambaArvoresPor: "50" },
        { code: 2, label: "Apenas limpeza", factor: "1.00", cacambaArvoresPor: "100" },
        { code: 3, label: "Apenas raleamento", factor: "1.05", cacambaArvoresPor: "50" },
      ],
      licenseTiers: [
        { minTrees: 1, maxTrees: 9, divisor: "5", hours: "4" },
        { minTrees: 10, maxTrees: null, divisor: "10", hours: "8" },
      ],
      modifiers: MODIFIERS,
    },
  },
};

/** Mesmos valores com o motor v2 (Arborent padronizado). As regras v2 são impostas pelo motor (effectiveRules). */
export function toV2(p: PricingParams): PricingParams {
  return { ...p, engineVersion: "V2_ARBORENT" };
}

/** Parâmetros "puramente legados" (v1 com regras idênticas à planilha), para comparação. */
export function toPureLegacy(p: PricingParams): PricingParams {
  return { ...p, engineVersion: "V1_LEGACY_EXCEL", rules: { ...p.rules, podaPriceMethod: "LEGACY", minTecnicos: 0 } };
}
