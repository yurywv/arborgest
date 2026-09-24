/* Validação dos parâmetros de precificação (tela administrativa). */
import { z } from "zod";
import type { PricingParams } from "./types";

const num = (label: string, o: { gt?: number; gte?: number; lt?: number; lte?: number } = {}) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim().replace(",", "."))
    .refine((v) => v !== "" && Number.isFinite(Number(v)), `${label}: número inválido.`)
    .refine((v) => o.gt === undefined || Number(v) > o.gt, `${label}: deve ser maior que ${o.gt}.`)
    .refine((v) => o.gte === undefined || Number(v) >= o.gte, `${label}: não pode ser menor que ${o.gte}.`)
    .refine((v) => o.lt === undefined || Number(v) < o.lt, `${label}: deve ser menor que ${o.lt}.`)
    .refine((v) => o.lte === undefined || Number(v) <= o.lte, `${label}: não pode ser maior que ${o.lte}.`);

const money = (label: string) => num(label, { gte: 0 });
const fraction = (label: string) => num(label, { gte: 0, lt: 1 });
const productivity = (svc: string, allow4 = true) =>
  z.object({
    1: num(`${svc} — produtividade fácil`, { gt: 0 }), 2: num(`${svc} — produtividade média`, { gt: 0 }), 3: num(`${svc} — produtividade difícil`, { gt: 0 }),
    ...(allow4 ? { 4: num(`${svc} — produtividade muito difícil`, { gt: 0 }).optional() } : {}),
  });
const hints = z.record(z.string(), z.string().trim().max(120)).optional();

const modifier = z.object({
  key: z.string().regex(/^[A-Z0-9_]{2,40}$/, "Código do modificador: letras maiúsculas, números e _."),
  label: z.string().trim().min(2, "Descrição do modificador obrigatória.").max(120),
  factor: num("Fator do modificador", { gt: 0, lte: 10 }),
  active: z.boolean(),
  order: z.coerce.number().int(),
  addsDays: z.coerce.number().int().min(0).max(30),
  legacyInProduct: z.boolean(),
});

const tier = z.object({
  minTrees: z.coerce.number().int().min(0),
  maxTrees: z.coerce.number().int().min(0).nullable(),
  divisor: num("Divisor da licença", { gt: 0 }),
  hours: num("Horas da licença", { gte: 0 }),
});

const serviceType = z.object({
  code: z.coerce.number().int().min(1),
  label: z.string().trim().min(2).max(120),
  factor: num("Fator do tipo de serviço", { gt: 0, lte: 10 }),
  includesLicense: z.boolean().optional(),
  cacambaArvoresPor: num("Árvores por caçamba", { gt: 0 }).optional(),
});

export const paramsSchema = z
  .object({
    engineVersion: z.enum(["V1_LEGACY_EXCEL", "V2_ARBORENT"]),
    general: z.object({
      tecnicoDia: money("Custo técnico/dia"),
      auxiliarDia: money("Custo auxiliar/dia"),
      custoKm: money("Custo por km"),
      alimentacaoPessoaDia: money("Alimentação por pessoa/dia"),
      hospedagemPessoaDia: money("Hospedagem por pessoa/dia"),
      plaquinhaArvore: money("Plaquinha + QR Code"),
      imposto: fraction("Imposto"),
      margem: fraction("Margem desejada"),
      custoFixoMensal: money("Custo fixo mensal"),
      diasProdutivosMes: num("Dias produtivos/mês", { gt: 0, lte: 31 }),
      combustivelLitro: money("Combustível (R$/L)"),
      cacamba: money("Custo caçamba"),
      horasDia: num("Horas por dia", { gt: 0, lte: 24 }),
      supervisaoDia: money("Diária do acompanhamento técnico"),
    }),
    rules: z.object({
      podaPriceMethod: z.enum(["LEGACY", "STANDARD"]),
      minTecnicos: z.coerce.number().int().min(0).max(20),
      auxiliaresPorTecnico: num("Auxiliares por técnico", { gt: 0 }),
    }),
    approval: z.object({
      margemComercial: fraction("Margem mínima — aprovação comercial"),
      margemGerencial: fraction("Margem mínima — aprovação gerencial"),
      descontoAlerta: fraction("Desconto para alerta"),
      fluxoObrigatorio: z.boolean(),
    }),
    services: z.object({
      INVENTARIO: z.object({ productivity: productivity("Inventário", false), difficultyHints: hints }),
      SUPRESSAO: z.object({
        productivity: productivity("Supressão"),
        difficultyHints: hints,
        serviceTypes: z.array(serviceType).min(1),
        licenseTiers: z.array(tier).min(1),
        cacambaArvoresPor: z.object({
          1: num("Árvores/caçamba (fácil)", { gt: 0 }), 2: num("Árvores/caçamba (média)", { gt: 0 }), 3: num("Árvores/caçamba (difícil)", { gt: 0 }),
          4: num("Árvores/caçamba (muito difícil)", { gt: 0 }).optional(),
        }),
        compensacao: z.object({ unidadesPorArvore: money("Mudas por árvore suprimida"), valorUnidade: money("Valor por muda"), custoFixo: money("Custo fixo da compensação") }),
        frete: z.object({ tarifaTonKm: money("Tarifa de frete"), valorMinimo: money("Frete mínimo"), pesoPorMudaKg: money("Peso por muda") }),
        modifiers: z.array(modifier),
      }),
      PODA: z.object({
        productivity: productivity("Poda"),
        difficultyHints: hints,
        serviceTypes: z.array(serviceType).min(1),
        licenseTiers: z.array(tier).min(1),
        modifiers: z.array(modifier),
      }),
    }),
  })
  .superRefine((p, ctx) => {
    if (Number(p.approval.margemGerencial) > Number(p.approval.margemComercial))
      ctx.addIssue({ code: "custom", message: "A margem mínima gerencial não pode ser maior que a comercial.", path: ["approval", "margemGerencial"] });
    for (const svc of ["SUPRESSAO", "PODA"] as const) {
      const keys = p.services[svc].modifiers.map((m) => m.key);
      if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: `${svc}: códigos de modificador repetidos.`, path: ["services", svc, "modifiers"] });
      const tiers = [...p.services[svc].licenseTiers].sort((a, b) => a.minTrees - b.minTrees);
      if (tiers[tiers.length - 1].maxTrees !== null)
        ctx.addIssue({ code: "custom", message: `${svc}: a última faixa de licença deve ser "sem limite".`, path: ["services", svc, "licenseTiers"] });
    }
  });

export function parseParams(raw: unknown): PricingParams {
  return paramsSchema.parse(raw) as unknown as PricingParams;
}

/** Lista legível das diferenças entre duas versões (para o histórico). */
export function diffParams(a: unknown, b: unknown, prefix = ""): { path: string; from: unknown; to: unknown }[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    return [...keys].flatMap((k) => diffParams((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k));
  }
  if (Array.isArray(a) && Array.isArray(b) && a.every((x) => x && typeof x === "object" && "key" in x)) {
    const byKey = (arr: unknown[]) => new Map(arr.map((x) => [(x as { key: string }).key, x]));
    const ma = byKey(a), mb = byKey(b);
    const keys = new Set([...ma.keys(), ...mb.keys()]);
    return [...keys].flatMap((k) => diffParams(ma.get(k), mb.get(k), `${prefix}[${k}]`));
  }
  return [{ path: prefix, from: a, to: b }];
}
