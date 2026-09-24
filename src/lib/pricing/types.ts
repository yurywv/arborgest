/* Tipos do motor de precificação. Código puro (sem acesso a banco), usado no servidor e no navegador.
 * Valores numéricos de parâmetros trafegam como string decimal para não perder precisão.
 */

export type EngineVersion = "V1_LEGACY_EXCEL" | "V2_ARBORENT";
export const ENGINE_LABEL: Record<EngineVersion, string> = {
  V1_LEGACY_EXCEL: "Motor v1 — Legado Excel",
  V2_ARBORENT: "Motor v2 — Arborent padronizado",
};

export type ServiceCode = "INVENTARIO" | "SUPRESSAO" | "PODA";
export type Difficulty = 1 | 2 | 3;
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { 1: "Fácil", 2: "Média", 3: "Difícil" };

/** "LEGACY": preço final da poda = custo operacional / (1 − imposto) — margem ignorada, como na planilha.
 *  "STANDARD": preço = custo / (1 − margem) / (1 − imposto), igual a inventário e supressão. */
export type PodaPriceMethod = "LEGACY" | "STANDARD";

export type Dec = string; // decimal serializado ("400", "0.11", "6.15")

export interface GeneralParams {
  tecnicoDia: Dec;
  auxiliarDia: Dec;
  custoKm: Dec;
  alimentacaoPessoaDia: Dec;
  hospedagemPessoaDia: Dec;
  plaquinhaArvore: Dec;
  imposto: Dec; // fração (0.11)
  margem: Dec; // fração sobre o preço de venda (0.35)
  custoFixoMensal: Dec;
  diasProdutivosMes: Dec;
  combustivelLitro: Dec;
  cacamba: Dec;
  horasDia: Dec;
}

export interface RuleParams {
  podaPriceMethod: PodaPriceMethod;
  /** 0 = reproduz a planilha (técnicos = ⌈auxiliares/4⌉, podendo ser zero); ≥1 = mínimo operacional. */
  minTecnicos: number;
  auxiliaresPorTecnico: Dec; // 4 na planilha
}

export interface ApprovalParams {
  /** Margem efetiva ≥ este valor: o próprio comercial aprova. */
  margemComercial: Dec;
  /** Margem efetiva ≥ este valor (e < comercial): exige gestor. Abaixo: diretoria/administração. */
  margemGerencial: Dec;
  /** Desconto (%) acima do qual se pede confirmação explícita. */
  descontoAlerta: Dec;
  /** Fluxo de aprovação interna obrigatório antes de gerar/enviar proposta. */
  fluxoObrigatorio: boolean;
}

export interface ModifierDef {
  key: string;
  label: string;
  factor: Dec;
  active: boolean; // disponível para seleção
  order: number;
  addsDays: number; // comportamento adicional: dias extras quando ligado (rede elétrica = 1)
  /** Participa do PRODUTO de fatores no motor v1 (a planilha omite "rede elétrica"). */
  legacyInProduct: boolean;
}

export interface LicenseTier {
  minTrees: number;
  maxTrees: number | null; // null = sem limite
  divisor: Dec;
  hours: Dec;
}

export interface ServiceTypeDef {
  code: number;
  label: string;
  factor: Dec; // fator do tipo (poda); 1 quando não se aplica
  includesLicense?: boolean; // supressão: tipo 1 inclui licenciamento
  cacambaArvoresPor?: Dec; // poda: árvores por caçamba conforme o tipo
}

export interface ServiceParams {
  productivity: Record<Difficulty, Dec>; // árvores/dia
  serviceTypes?: ServiceTypeDef[];
  licenseTiers?: LicenseTier[];
  cacambaArvoresPor?: Record<Difficulty, Dec>; // supressão: por dificuldade
  compensacao?: { unidadesPorArvore: Dec; valorUnidade: Dec; custoFixo: Dec };
  modifiers?: ModifierDef[];
}

export interface PricingParams {
  engineVersion: EngineVersion;
  general: GeneralParams;
  rules: RuleParams;
  approval: ApprovalParams;
  services: Record<ServiceCode, ServiceParams>;
}

// ── Entradas ──
export interface BaseInputs {
  trees: number;
  distanceKm: number; // ida + volta
  difficulty: Difficulty;
  auxiliaries: number;
  lodging: boolean;
  toll: number; // pedágio (R$)
}
export type InventarioInputs = BaseInputs;
export interface SupressaoInputs extends BaseInputs {
  serviceType: number; // 1 = Licenciamento + Supressão, 2 = Apenas supressão
  compensation: boolean;
  cacamba: boolean;
  fuelLiters: number;
  modifiers: string[];
}
export interface PodaInputs extends BaseInputs {
  serviceType: number; // 1 = Limpeza + Raleamento, 2 = Só limpeza, 3 = Só raleamento
  license: boolean;
  cacamba: boolean;
  fuelLiters: number;
  modifiers: string[];
}
export type ServiceInputs = InventarioInputs | SupressaoInputs | PodaInputs;

// ── Resultado ──
export type ComponentGroup = "QTD" | "CUSTO" | "FATOR" | "TOTAL" | "PRECO";
export interface CalcComponent {
  key: string;
  label: string;
  value: Dec; // valor com precisão total
  display: string; // valor formatado (R$ ou número)
  formula: string; // memória de cálculo legível
  group: ComponentGroup;
}

export interface CalcWarning {
  code: string;
  message: string;
  /** "confirm": exige confirmação explícita para salvar. "info": apenas aviso. */
  level: "info" | "confirm";
}

export interface CalcResult {
  service: ServiceCode;
  engineVersion: EngineVersion;
  days: number;
  baseDays: number;
  extraDays: number;
  productivity: Dec;
  technicians: number;
  techniciansCharged: number; // técnicos cobrados no custo técnico
  auxiliaries: number;
  persons: number;
  costs: Record<string, Dec>; // componentes de custo (precisão total)
  baseCost: Dec;
  serviceTypeFactor: Dec;
  modifiersFactor: Dec;
  modifiersApplied: { key: string; label: string; factor: Dec; inProduct: boolean }[];
  afterModifiers: Dec;
  operationalCost: Dec;
  margin: Dec;
  tax: Dec;
  priceBeforeTax: Dec;
  finalPrice: Dec; // precisão total
  unitPrice: Dec;
  finalPriceRounded: Dec; // arredondado a centavos (valor que vai para o orçamento)
  unitPriceRounded: Dec;
  /** Margem efetiva = (preço × (1 − imposto) − custo operacional) / (preço × (1 − imposto)). */
  effectiveMargin: Dec;
  priceMethod: "STANDARD" | "LEGACY_PODA";
  components: CalcComponent[];
  warnings: CalcWarning[];
}
