/* Tipos do motor de precificação. Código puro (sem acesso a banco), usado no servidor e no navegador.
 * Valores numéricos de parâmetros trafegam como string decimal para não perder precisão.
 */

export type EngineVersion = "V1_LEGACY_EXCEL" | "V2_ARBORENT";
export const ENGINE_LABEL: Record<EngineVersion, string> = {
  V1_LEGACY_EXCEL: "Motor v1 — Legado Excel",
  V2_ARBORENT: "Motor v2 — Arborent padronizado",
};

/** Serviços com fórmula própria (produtividade por árvore, parâmetros por serviço). */
export type CoreServiceCode = "INVENTARIO" | "SUPRESSAO" | "PODA";
/** Demais serviços do catálogo comercial: custo por diárias de equipe informadas (sem produtividade por árvore). */
export type GeneralServiceCode = "AVALIACAO_RISCO" | "CONSULTORIA" | "LICENCIAMENTO" | "MANEJO" | "MANUTENCAO" | "PLANTIO" | "FITOSSANIDADE";
export type ServiceCode = CoreServiceCode | GeneralServiceCode;
export const CORE_SERVICE_CODES: CoreServiceCode[] = ["INVENTARIO", "SUPRESSAO", "PODA"];
export const isCoreService = (c: ServiceCode): c is CoreServiceCode => (CORE_SERVICE_CODES as string[]).includes(c);
export type Difficulty = 1 | 2 | 3 | 4;
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { 1: "Fácil", 2: "Média", 3: "Difícil", 4: "Muito difícil" };
export const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4];

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
  /** Custo diário do profissional de acompanhamento técnico (poda/supressão). */
  supervisaoDia: Dec;
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

/** Níveis 1–3 obrigatórios; o nível 4 ("muito difícil") existe apenas nos serviços que o definem. */
export type Productivity = { 1: Dec; 2: Dec; 3: Dec; 4?: Dec };

export interface ServiceParams {
  productivity: Productivity; // árvores/dia
  /** Descrição de cada nível (ex.: "altura > 3 m, local perto"). */
  difficultyHints?: Partial<Record<Difficulty, string>>;
  serviceTypes?: ServiceTypeDef[];
  licenseTiers?: LicenseTier[];
  cacambaArvoresPor?: Partial<Record<Difficulty, Dec>>; // supressão: por dificuldade
  /** unidadesPorArvore = mudas por árvore suprimida (padrão quando não informado); valorUnidade = valor por muda. */
  compensacao?: { unidadesPorArvore: Dec; valorUnidade: Dec; custoFixo: Dec };
  /** Frete calculado = distância (km) × peso (t) × tarifa, com valor mínimo. */
  frete?: { tarifaTonKm: Dec; valorMinimo: Dec; pesoPorMudaKg: Dec };
  modifiers?: ModifierDef[];
}

export interface PricingParams {
  engineVersion: EngineVersion;
  general: GeneralParams;
  rules: RuleParams;
  approval: ApprovalParams;
  services: Record<CoreServiceCode, ServiceParams>;
}

// ── Entradas ──
export interface BaseInputs {
  trees: number;
  distanceKm: number; // ida + volta
  difficulty: Difficulty;
  auxiliaries: number;
  lodging: boolean;
  toll: number; // pedágio (R$)
  /** Valores regionais (null/ausente = padrão dos parâmetros). */
  mealCost?: number | null; // alimentação por pessoa/dia
  lodgingCost?: number | null; // hospedagem por pessoa/dia
}
export type InventarioInputs = BaseInputs;

/** Campos comuns às operações de campo (supressão e poda). */
export interface FieldOperationInputs extends BaseInputs {
  serviceType: number;
  cacamba: boolean;
  cacambaQty?: number | null; // null = calculada pela regra de árvores por caçamba
  cacambaUnitPrice?: number | null; // null = custo padrão da caçamba
  fuelLiters: number;
  modifiers: string[];
  /** Acompanhamento técnico: profissional presente na operação (diária + alimentação + hospedagem + transporte). */
  supervision?: boolean;
  supervisionDays?: number | null; // null = dias estimados da operação
}
export type FreightMode = "NONE" | "FIXED" | "CALC";
export interface SupressaoInputs extends FieldOperationInputs {
  // serviceType: 1 = Licenciamento + Supressão, 2 = Apenas supressão
  compensation: boolean;
  seedlings?: number | null; // mudas a plantar (null = árvores × mudas por árvore)
  seedlingUnitPrice?: number | null; // valor por muda (null = padrão)
  compensationLaw?: string | null; // lei municipal aplicável (citação)
  compensationCity?: string | null;
  freightMode?: FreightMode;
  freightValue?: number | null; // FIXED: valor do frete para a cidade
  freightDistanceKm?: number | null; // CALC
  freightWeightKg?: number | null; // CALC (null = mudas × peso por muda)
}
export interface PodaInputs extends FieldOperationInputs {
  // serviceType: 1 = Limpeza + Raleamento, 2 = Só limpeza, 3 = Só raleamento
  license: boolean;
}
/** Serviços por diárias: quantidade (na unidade do serviço), dias de equipe e custos diretos informados. */
export interface GeneralInputs {
  trees: number; // quantidade na unidade do serviço (árvores, mudas, visitas…)
  days: number; // dias de equipe em campo/trabalho
  technicians: number;
  auxiliaries: number;
  distanceKm: number;
  toll: number;
  lodging: boolean;
  mealCost?: number | null;
  lodgingCost?: number | null;
  materials?: number | null; // insumos/materiais (R$)
  thirdParty?: number | null; // serviços de terceiros, taxas e emolumentos (R$)
}
export type ServiceInputs = InventarioInputs | SupressaoInputs | PodaInputs | GeneralInputs;

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
  /** Informações complementares (mudas, lei aplicável, caçambas, dias de acompanhamento…). */
  details?: Record<string, string | number | null>;
  components: CalcComponent[];
  warnings: CalcWarning[];
}
