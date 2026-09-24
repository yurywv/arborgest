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
import { EngineError } from "./engine";
import type { CalcResult, PricingParams, ServiceCode, ServiceInputs } from "./types";

const intMsg = (label: string) => ({ error: `${label}: informe um número inteiro.` });
const nonNeg = (label: string, max: number) =>
  z.coerce.number({ error: `${label}: número inválido.` }).min(0, `${label} não pode ser negativo.`).max(max, `${label}: valor acima do limite (${max}).`);
const nonNegInt = (label: string, max: number) => nonNeg(label, max).int(intMsg(label).error);

const base = {
  trees: nonNegInt("Número de árvores", 100_000),
  distanceKm: nonNeg("Distância", 20_000),
  difficulty: z.coerce.number().int().min(1).max(3) as z.ZodType<1 | 2 | 3>,
  auxiliaries: nonNegInt("Auxiliares", 200),
  lodging: z.boolean(),
  toll: nonNeg("Pedágio", 100_000),
};

export const INPUT_SCHEMAS = {
  INVENTARIO: z.object(base),
  SUPRESSAO: z.object({
    ...base,
    serviceType: z.coerce.number().int(),
    compensation: z.boolean(),
    cacamba: z.boolean(),
    fuelLiters: nonNeg("Litros de combustível", 100_000),
    modifiers: z.array(z.string().max(40)).max(30),
  }),
  PODA: z.object({
    ...base,
    serviceType: z.coerce.number().int(),
    license: z.boolean(),
    cacamba: z.boolean(),
    fuelLiters: nonNeg("Litros de combustível", 100_000),
    modifiers: z.array(z.string().max(40)).max(30),
  }),
} satisfies Record<ServiceCode, z.ZodType>;

export type FieldKind = "int" | "decimal" | "money" | "bool" | "difficulty" | "serviceType" | "modifiers";
export type FieldDef = { key: string; label: string; kind: FieldKind; section: "QUANTIDADE" | "LOGISTICA" | "OPERACAO" | "SERVICO" | "MODIFICADORES"; suffix?: string; hint?: string };

const BASE_FIELDS: FieldDef[] = [
  { key: "trees", label: "Árvores", kind: "int", section: "QUANTIDADE" },
  { key: "distanceKm", label: "Distância ida + volta", kind: "decimal", section: "LOGISTICA", suffix: "km" },
  { key: "toll", label: "Pedágio (por dia/viagem)", kind: "money", section: "LOGISTICA", suffix: "R$" },
  { key: "lodging", label: "Hospedagem", kind: "bool", section: "LOGISTICA" },
  { key: "difficulty", label: "Dificuldade", kind: "difficulty", section: "OPERACAO" },
  { key: "auxiliaries", label: "Auxiliares", kind: "int", section: "OPERACAO" },
];

export type ServiceDef = {
  code: ServiceCode;
  name: string;
  shortName: string;
  unit: string;
  description: string;
  serviceTypeLabel?: string;
  /** Serviço correspondente na ordem de serviço (catálogo SERVICES). */
  osService: string;
  fields: FieldDef[];
  defaults: ServiceInputs;
  calculate: (p: PricingParams, inputs: never) => CalcResult;
};

export const SERVICES: Record<ServiceCode, ServiceDef> = {
  INVENTARIO: {
    code: "INVENTARIO", name: "Inventário arbóreo", shortName: "Inventário", unit: "árvore", osService: "INVENTARIO",
    description: "Cadastro georreferenciado com plaqueta e QR Code por exemplar.",
    fields: BASE_FIELDS,
    defaults: { trees: 100, distanceKm: 0, difficulty: 2, auxiliaries: 1, lodging: false, toll: 0 },
    calculate: calcInventario as ServiceDef["calculate"],
  },
  SUPRESSAO: {
    code: "SUPRESSAO", name: "Supressão arbórea", shortName: "Supressão", unit: "árvore", osService: "REMOCAO",
    description: "Remoção de exemplares, com ou sem licenciamento e compensação ambiental.",
    serviceTypeLabel: "Tipo de serviço",
    fields: [
      ...BASE_FIELDS,
      { key: "serviceType", label: "Tipo de serviço", kind: "serviceType", section: "SERVICO" },
      { key: "compensation", label: "Compensação ambiental", kind: "bool", section: "SERVICO" },
      { key: "cacamba", label: "Utiliza caçamba", kind: "bool", section: "SERVICO" },
      { key: "fuelLiters", label: "Combustível motosserra (total)", kind: "decimal", section: "SERVICO", suffix: "L" },
      { key: "modifiers", label: "Modificadores", kind: "modifiers", section: "MODIFICADORES" },
    ],
    defaults: { trees: 1, distanceKm: 0, difficulty: 2, auxiliaries: 2, lodging: false, toll: 0, serviceType: 1, compensation: false, cacamba: false, fuelLiters: 0, modifiers: [] },
    calculate: calcSupressao as ServiceDef["calculate"],
  },
  PODA: {
    code: "PODA", name: "Poda", shortName: "Poda", unit: "árvore", osService: "PODA",
    description: "Poda de limpeza e/ou raleamento, com licença e caçamba opcionais.",
    serviceTypeLabel: "Tipo de poda",
    fields: [
      ...BASE_FIELDS,
      { key: "serviceType", label: "Tipo de poda", kind: "serviceType", section: "SERVICO" },
      { key: "license", label: "Necessita licença", kind: "bool", section: "SERVICO" },
      { key: "cacamba", label: "Utiliza caçamba", kind: "bool", section: "SERVICO" },
      { key: "fuelLiters", label: "Combustível motosserra (total)", kind: "decimal", section: "SERVICO", suffix: "L" },
      { key: "modifiers", label: "Modificadores", kind: "modifiers", section: "MODIFICADORES" },
    ],
    defaults: { trees: 1, distanceKm: 0, difficulty: 2, auxiliaries: 2, lodging: false, toll: 0, serviceType: 1, license: false, cacamba: false, fuelLiters: 0, modifiers: [] },
    calculate: calcPoda as ServiceDef["calculate"],
  },
};

export const SERVICE_CODES = Object.keys(SERVICES) as ServiceCode[];
export const isServiceCode = (v: unknown): v is ServiceCode => typeof v === "string" && v in SERVICES;

/** Valida entradas e calcula. Lança EngineError/ZodError com mensagens legíveis. */
export function calculate(service: ServiceCode, rawInputs: unknown, params: PricingParams): { inputs: ServiceInputs; result: CalcResult } {
  const def = SERVICES[service];
  if (!def) throw new EngineError("Serviço desconhecido.");
  const inputs = INPUT_SCHEMAS[service].parse(rawInputs) as ServiceInputs;
  if ("modifiers" in inputs) {
    const valid = new Set((params.services[service].modifiers ?? []).filter((m) => m.active).map((m) => m.key));
    const bad = inputs.modifiers.find((m) => !valid.has(m));
    if (bad) throw new EngineError(`Modificador indisponível: ${bad}.`);
  }
  return { inputs, result: def.calculate(params, inputs as never) };
}
