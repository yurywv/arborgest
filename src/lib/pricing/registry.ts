/* Registro de serviços precificáveis.
 * Para adicionar um serviço (plantio, transplante, laudo…):
 *   1. crie ./services/<servico>.ts com a função de cálculo;
 *   2. declare aqui código, nome, entradas (zod), valores padrão e campos de formulário;
 *   3. inclua os parâmetros do serviço em PricingParams.services (defaults + tela administrativa).
 * Orçamentos, propostas, PDF, auditoria e indicadores funcionam sem alterações.
 */
import { z } from "zod";
import { calcInventario } from "./services/inventario";
import { calcSupressao } from "./services/supressao";
import { calcPoda } from "./services/poda";
import { calcGeneral } from "./services/general";
import { SERVICE_LABELS, type CatalogService } from "@/lib/catalogs";
import { EngineError } from "./engine";
import { normalizeParams } from "./defaults";
import type { CalcResult, GeneralServiceCode, PricingParams, ServiceCode, ServiceInputs } from "./types";
import { isCoreService } from "./types";

const intMsg = (label: string) => ({ error: `${label}: informe um número inteiro.` });
const nonNeg = (label: string, max: number) =>
  z.coerce.number({ error: `${label}: número inválido.` }).min(0, `${label} não pode ser negativo.`).max(max, `${label}: valor acima do limite (${max}).`);
const nonNegInt = (label: string, max: number) => nonNeg(label, max).int(intMsg(label).error);
/** Número opcional: vazio/ausente = null (usa o padrão dos parâmetros); nunca negativo. */
const optNonNeg = (label: string, max: number, int = false) =>
  z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : typeof v === "string" ? Number(v.replace(",", ".")) : v),
    (int ? z.number({ error: `${label}: número inválido.` }).int(intMsg(label).error) : z.number({ error: `${label}: número inválido.` }))
      .min(0, `${label} não pode ser negativo.`).max(max, `${label}: valor acima do limite (${max}).`).nullable(),
  );
const optText = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v ?? null), z.string().trim().max(max).nullable());

const base = {
  trees: nonNegInt("Número de árvores", 100_000),
  distanceKm: nonNeg("Distância", 20_000),
  difficulty: z.coerce.number().int().min(1).max(4) as z.ZodType<1 | 2 | 3 | 4>,
  auxiliaries: nonNegInt("Auxiliares", 200),
  lodging: z.boolean(),
  toll: nonNeg("Pedágio", 100_000),
  mealCost: optNonNeg("Alimentação por pessoa/dia", 10_000).optional(),
  lodgingCost: optNonNeg("Hospedagem por pessoa/dia", 10_000).optional(),
};
const fieldOp = {
  serviceType: z.coerce.number().int(),
  cacamba: z.boolean(),
  cacambaQty: optNonNeg("Quantidade de caçambas", 10_000, true).optional(),
  cacambaUnitPrice: optNonNeg("Preço unitário da caçamba", 1_000_000).optional(),
  fuelLiters: nonNeg("Litros de combustível", 100_000),
  modifiers: z.array(z.string().max(40)).max(30),
  supervision: z.boolean().optional().default(false),
  supervisionDays: optNonNeg("Dias de acompanhamento técnico", 1_000).optional(),
};

const general = z.object({
  trees: nonNegInt("Quantidade", 1_000_000).min(1, "Informe a quantidade."),
  days: z.coerce.number({ error: "Dias de trabalho: número inválido." }).min(0.5, "Informe os dias de trabalho (mínimo meio dia).").max(1_000, "Dias acima do limite."),
  technicians: nonNegInt("Técnicos", 100),
  auxiliaries: nonNegInt("Auxiliares", 200),
  distanceKm: nonNeg("Distância", 20_000),
  toll: nonNeg("Pedágio", 100_000),
  lodging: z.boolean(),
  mealCost: optNonNeg("Alimentação por pessoa/dia", 10_000).optional(),
  lodgingCost: optNonNeg("Hospedagem por pessoa/dia", 10_000).optional(),
  materials: optNonNeg("Materiais e insumos", 100_000_000).optional(),
  thirdParty: optNonNeg("Terceiros e taxas", 100_000_000).optional(),
});

export const INPUT_SCHEMAS = {
  AVALIACAO_RISCO: general, CONSULTORIA: general, LICENCIAMENTO: general, MANEJO: general, MANUTENCAO: general, PLANTIO: general, FITOSSANIDADE: general,
  INVENTARIO: z.object(base),
  SUPRESSAO: z.object({
    ...base,
    ...fieldOp,
    compensation: z.boolean(),
    seedlings: optNonNeg("Mudas a plantar", 1_000_000, true).optional(),
    seedlingUnitPrice: optNonNeg("Valor por muda", 100_000).optional(),
    compensationLaw: optText(300).optional(),
    compensationCity: optText(120).optional(),
    freightMode: z.enum(["NONE", "FIXED", "CALC"]).optional().default("NONE"),
    freightValue: optNonNeg("Valor do frete", 10_000_000).optional(),
    freightDistanceKm: optNonNeg("Distância do frete", 20_000).optional(),
    freightWeightKg: optNonNeg("Peso do frete", 10_000_000).optional(),
  }),
  PODA: z.object({
    ...base,
    ...fieldOp,
    license: z.boolean(),
  }),
} satisfies Record<ServiceCode, z.ZodType>;

export type FieldKind = "int" | "decimal" | "money" | "bool" | "yesno" | "text" | "select" | "difficulty" | "serviceType" | "modifiers" | "compensationRule";
export type FieldSection = "CUSTOS" | "QUANTIDADE" | "LOGISTICA" | "REGIONAL" | "OPERACAO" | "SERVICO" | "COMPENSACAO" | "FRETE" | "ACOMPANHAMENTO" | "MODIFICADORES";
export type FieldDef = {
  key: string; label: string; kind: FieldKind; section: FieldSection; suffix?: string; hint?: string;
  /** Campo opcional: vazio = valor padrão dos parâmetros (ou regra automática). */
  optional?: boolean;
  /** Exibe só quando outro campo tem o valor indicado (ex.: cacamba = true). */
  showIf?: { key: string; equals: unknown };
  options?: { value: string; label: string }[];
};

const BASE_FIELDS: FieldDef[] = [
  { key: "trees", label: "Árvores", kind: "int", section: "QUANTIDADE" },
  { key: "distanceKm", label: "Distância ida + volta", kind: "decimal", section: "LOGISTICA", suffix: "km" },
  { key: "toll", label: "Pedágio (por dia/viagem)", kind: "money", section: "LOGISTICA", suffix: "R$" },
  { key: "lodging", label: "Hospedagem", kind: "bool", section: "LOGISTICA" },
  { key: "mealCost", label: "Alimentação por pessoa/dia", kind: "money", section: "REGIONAL", suffix: "R$", optional: true, hint: "Valor da região do projeto. Em branco, usa o valor padrão dos parâmetros." },
  { key: "lodgingCost", label: "Hospedagem por pessoa/dia", kind: "money", section: "REGIONAL", suffix: "R$", optional: true, hint: "Usado quando há hospedagem. Em branco, usa o valor padrão dos parâmetros." },
  { key: "difficulty", label: "Dificuldade", kind: "difficulty", section: "OPERACAO" },
  { key: "auxiliaries", label: "Auxiliares", kind: "int", section: "OPERACAO" },
];
const CACAMBA_FIELDS: FieldDef[] = [
  { key: "cacamba", label: "Utiliza caçamba", kind: "bool", section: "SERVICO" },
  { key: "cacambaQty", label: "Quantidade de caçambas", kind: "int", section: "SERVICO", optional: true, showIf: { key: "cacamba", equals: true }, hint: "Em branco = calculada pela regra de árvores por caçamba." },
  { key: "cacambaUnitPrice", label: "Preço unitário da caçamba", kind: "money", section: "SERVICO", suffix: "R$", optional: true, showIf: { key: "cacamba", equals: true }, hint: "Em branco, usa o valor padrão dos parâmetros." },
];
const SUPERVISION_FIELDS: FieldDef[] = [
  { key: "supervision", label: "Haverá acompanhamento técnico?", kind: "yesno", section: "ACOMPANHAMENTO",
    hint: "Profissional presente na operação: diária, alimentação, hospedagem e transporte." },
  { key: "supervisionDays", label: "Dias de acompanhamento", kind: "decimal", section: "ACOMPANHAMENTO", optional: true, showIf: { key: "supervision", equals: true }, hint: "Em branco = mesmos dias da operação." },
];

/** Campos dos serviços por diárias (a quantidade usa a unidade do serviço). */
const generalFields = (unitLabel: string): FieldDef[] => [
  { key: "trees", label: `Quantidade (${unitLabel})`, kind: "int", section: "QUANTIDADE" },
  { key: "days", label: "Dias de trabalho", kind: "decimal", section: "QUANTIDADE", suffix: "dias", hint: "Dias de equipe em campo/escritório para executar o serviço." },
  { key: "technicians", label: "Técnicos", kind: "int", section: "OPERACAO" },
  { key: "auxiliaries", label: "Auxiliares", kind: "int", section: "OPERACAO" },
  { key: "distanceKm", label: "Distância ida + volta", kind: "decimal", section: "LOGISTICA", suffix: "km" },
  { key: "toll", label: "Pedágio (por dia/viagem)", kind: "money", section: "LOGISTICA", suffix: "R$" },
  { key: "lodging", label: "Hospedagem", kind: "bool", section: "LOGISTICA" },
  { key: "mealCost", label: "Alimentação por pessoa/dia", kind: "money", section: "REGIONAL", suffix: "R$", optional: true, hint: "Valor da região do projeto. Em branco, usa o valor padrão dos parâmetros." },
  { key: "lodgingCost", label: "Hospedagem por pessoa/dia", kind: "money", section: "REGIONAL", suffix: "R$", optional: true, hint: "Usado quando há hospedagem. Em branco, usa o valor padrão dos parâmetros." },
  { key: "materials", label: "Materiais e insumos", kind: "money", section: "CUSTOS", suffix: "R$", optional: true, hint: "Mudas, produtos, equipamentos alugados… Em branco = sem custo." },
  { key: "thirdParty", label: "Terceiros, taxas e emolumentos", kind: "money", section: "CUSTOS", suffix: "R$", optional: true, hint: "Laboratório, taxas de órgãos ambientais, subcontratados… Em branco = sem custo." },
];

export type ServiceDef = {
  code: ServiceCode;
  name: string;
  shortName: string;
  unit: string;
  description: string;
  serviceTypeLabel?: string;
  /** Serviço correspondente no catálogo comercial (oportunidades e ordens de serviço). */
  osService: CatalogService;
  /** A quantidade é de árvores (permite vincular exemplares ao item). */
  perTree: boolean;
  unitPlural: string;
  fields: FieldDef[];
  defaults: ServiceInputs;
  calculate: (p: PricingParams, inputs: never) => CalcResult;
};

function generalDef(code: GeneralServiceCode, unit: string, unitPlural: string, perTree: boolean, description: string): ServiceDef {
  return {
    code, name: SERVICE_LABELS[code], shortName: SERVICE_LABELS[code], unit, unitPlural, perTree, osService: code, description,
    fields: generalFields(unitPlural),
    defaults: { trees: 1, days: 1, technicians: 1, auxiliaries: 0, distanceKm: 0, toll: 0, lodging: false, mealCost: null, lodgingCost: null, materials: null, thirdParty: null },
    calculate: calcGeneral(code, { one: unit, many: unitPlural }) as ServiceDef["calculate"],
  };
}

const CORE: Record<"INVENTARIO" | "SUPRESSAO" | "PODA", ServiceDef> = {
  INVENTARIO: {
    code: "INVENTARIO", name: SERVICE_LABELS.INVENTARIO, shortName: SERVICE_LABELS.INVENTARIO, unit: "árvore", unitPlural: "árvores", perTree: true, osService: "INVENTARIO",
    description: "Cadastro georreferenciado com plaqueta e QR Code por exemplar.",
    fields: BASE_FIELDS,
    defaults: { trees: 100, distanceKm: 0, difficulty: 2, auxiliaries: 1, lodging: false, toll: 0, mealCost: null, lodgingCost: null },
    calculate: calcInventario as ServiceDef["calculate"],
  },
  SUPRESSAO: {
    code: "SUPRESSAO", name: SERVICE_LABELS.REMOCAO, shortName: SERVICE_LABELS.REMOCAO, unit: "árvore", unitPlural: "árvores", perTree: true, osService: "REMOCAO",
    description: "Remoção de exemplares, com ou sem licenciamento e compensação ambiental.",
    serviceTypeLabel: "Tipo de serviço",
    fields: [
      ...BASE_FIELDS,
      { key: "serviceType", label: "Tipo de serviço", kind: "serviceType", section: "SERVICO" },
      ...CACAMBA_FIELDS,
      { key: "fuelLiters", label: "Combustível motosserra (total)", kind: "decimal", section: "SERVICO", suffix: "L" },
      { key: "compensation", label: "Compensação ambiental", kind: "bool", section: "COMPENSACAO" },
      { key: "compensationRule", label: "Lei municipal (cadastro)", kind: "compensationRule", section: "COMPENSACAO", showIf: { key: "compensation", equals: true } },
      { key: "compensationCity", label: "Município", kind: "text", section: "COMPENSACAO", optional: true, showIf: { key: "compensation", equals: true } },
      { key: "compensationLaw", label: "Lei aplicável (citação)", kind: "text", section: "COMPENSACAO", optional: true, showIf: { key: "compensation", equals: true },
        hint: "Número e artigo da lei do município." },
      { key: "seedlings", label: "Mudas a plantar", kind: "int", section: "COMPENSACAO", optional: true, showIf: { key: "compensation", equals: true }, hint: "Quantidade exigida pela lei do município." },
      { key: "seedlingUnitPrice", label: "Valor por muda", kind: "money", section: "COMPENSACAO", suffix: "R$", optional: true, showIf: { key: "compensation", equals: true } },
      { key: "freightMode", label: "Frete", kind: "select", section: "FRETE",
        options: [{ value: "", label: "Sem frete" }, { value: "FIXED", label: "Valor por cidade (informado)" }, { value: "CALC", label: "Calcular por distância e peso" }] },
      { key: "freightValue", label: "Valor do frete", kind: "money", section: "FRETE", suffix: "R$", optional: true, showIf: { key: "freightMode", equals: "FIXED" } },
      { key: "freightDistanceKm", label: "Distância do frete", kind: "decimal", section: "FRETE", suffix: "km", optional: true, showIf: { key: "freightMode", equals: "CALC" } },
      { key: "freightWeightKg", label: "Peso transportado", kind: "decimal", section: "FRETE", suffix: "kg", optional: true, showIf: { key: "freightMode", equals: "CALC" } },
      ...SUPERVISION_FIELDS,
      { key: "modifiers", label: "Modificadores", kind: "modifiers", section: "MODIFICADORES" },
    ],
    defaults: {
      trees: 1, distanceKm: 0, difficulty: 2, auxiliaries: 2, lodging: false, toll: 0, mealCost: null, lodgingCost: null, serviceType: 1,
      compensation: false, seedlings: null, seedlingUnitPrice: null, compensationLaw: null, compensationCity: null,
      freightMode: "NONE", freightValue: null, freightDistanceKm: null, freightWeightKg: null,
      cacamba: false, cacambaQty: null, cacambaUnitPrice: null, fuelLiters: 0, modifiers: [], supervision: true, supervisionDays: null,
    },
    calculate: calcSupressao as ServiceDef["calculate"],
  },
  PODA: {
    code: "PODA", name: SERVICE_LABELS.PODA, shortName: SERVICE_LABELS.PODA, unit: "árvore", unitPlural: "árvores", perTree: true, osService: "PODA",
    description: "Poda de limpeza e/ou raleamento, com licença e caçamba opcionais.",
    serviceTypeLabel: "Tipo de poda",
    fields: [
      ...BASE_FIELDS,
      { key: "serviceType", label: "Tipo de poda", kind: "serviceType", section: "SERVICO" },
      { key: "license", label: "Necessita licença", kind: "bool", section: "SERVICO" },
      ...CACAMBA_FIELDS,
      { key: "fuelLiters", label: "Combustível motosserra (total)", kind: "decimal", section: "SERVICO", suffix: "L" },
      ...SUPERVISION_FIELDS,
      { key: "modifiers", label: "Modificadores", kind: "modifiers", section: "MODIFICADORES" },
    ],
    defaults: {
      trees: 1, distanceKm: 0, difficulty: 2, auxiliaries: 2, lodging: false, toll: 0, mealCost: null, lodgingCost: null, serviceType: 1,
      license: false, cacamba: false, cacambaQty: null, cacambaUnitPrice: null, fuelLiters: 0, modifiers: [], supervision: true, supervisionDays: null,
    },
    calculate: calcPoda as ServiceDef["calculate"],
  },
};

const GENERAL: Record<GeneralServiceCode, ServiceDef> = {
  AVALIACAO_RISCO: generalDef("AVALIACAO_RISCO", "árvore", "árvores", true, "Avaliação de risco e laudo técnico por exemplar (visual, tomografia, resistografia)."),
  CONSULTORIA: generalDef("CONSULTORIA", "serviço", "serviços", false, "Consultoria técnica em arborização e gestão arbórea."),
  LICENCIAMENTO: generalDef("LICENCIAMENTO", "processo", "processos", false, "Elaboração e acompanhamento de processos de licenciamento ambiental."),
  MANEJO: generalDef("MANEJO", "serviço", "serviços", false, "Manejo arbóreo: conjunto de intervenções planejadas."),
  MANUTENCAO: generalDef("MANUTENCAO", "visita", "visitas", false, "Manutenção periódica programada (visitas recorrentes)."),
  PLANTIO: generalDef("PLANTIO", "muda", "mudas", false, "Plantio de mudas, com preparo de cova e insumos."),
  FITOSSANIDADE: generalDef("FITOSSANIDADE", "árvore", "árvores", true, "Tratamento fitossanitário de exemplares (pragas e doenças)."),
};

/** Na ordem do catálogo comercial (mesma lista do cadastro de oportunidades). */
export const SERVICES: Record<ServiceCode, ServiceDef> = Object.fromEntries(
  (Object.keys(SERVICE_LABELS) as CatalogService[]).map((k) => {
    const d = k === "REMOCAO" ? CORE.SUPRESSAO : k in CORE ? CORE[k as keyof typeof CORE] : GENERAL[k as GeneralServiceCode];
    return [d.code, d];
  }),
) as Record<ServiceCode, ServiceDef>;

export const SERVICE_CODES = Object.keys(SERVICES) as ServiceCode[];
export const isServiceCode = (v: unknown): v is ServiceCode => typeof v === "string" && v in SERVICES;

/** Valida entradas e calcula. Lança EngineError/ZodError com mensagens legíveis. */
export function calculate(service: ServiceCode, rawInputs: unknown, rawParams: PricingParams): { inputs: ServiceInputs; result: CalcResult } {
  const params = normalizeParams(rawParams);
  const def = SERVICES[service];
  if (!def) throw new EngineError("Serviço desconhecido.");
  const inputs = INPUT_SCHEMAS[service].parse(rawInputs) as ServiceInputs;
  if ("modifiers" in inputs && isCoreService(service)) {
    const valid = new Set((params.services[service].modifiers ?? []).filter((m) => m.active).map((m) => m.key));
    const bad = inputs.modifiers.find((m) => !valid.has(m));
    if (bad) throw new EngineError(`Modificador indisponível: ${bad}.`);
  }
  return { inputs, result: def.calculate(params, inputs as never) };
}
