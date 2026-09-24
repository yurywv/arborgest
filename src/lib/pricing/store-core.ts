/* Persistência das versões de parâmetros. Recebe o PrismaClient (ou transação) por parâmetro para poder
 * ser usada pelo app, pelo seed e pelo bootstrap de deploy (que roda fora do Next.js).
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { LEGACY_EXCEL_PARAMS, PRICING_PARAM_MIGRATIONS, normalizeParams } from "./defaults";
import { SERVICES } from "./registry";
import type { PricingParams, ServiceCode } from "./types";
import { DIFFICULTIES, DIFFICULTY_LABEL } from "./types";

type Tx = PrismaClient | Prisma.TransactionClient;

const GENERAL_LABELS: Record<keyof PricingParams["general"], [string, string]> = {
  tecnicoDia: ["Custo técnico/dia", "R$"],
  auxiliarDia: ["Custo auxiliar/dia", "R$"],
  custoKm: ["Custo por km rodado", "R$/km"],
  alimentacaoPessoaDia: ["Alimentação por pessoa/dia", "R$"],
  hospedagemPessoaDia: ["Hospedagem por pessoa/dia", "R$"],
  plaquinhaArvore: ["Plaquinha + QR Code por árvore", "R$"],
  imposto: ["Imposto", "fração"],
  margem: ["Margem desejada (sobre o preço de venda)", "fração"],
  custoFixoMensal: ["Custo fixo mensal Arborent", "R$"],
  diasProdutivosMes: ["Dias produtivos/mês", "dias"],
  combustivelLitro: ["Preço combustível motosserra", "R$/L"],
  cacamba: ["Custo caçamba", "R$"],
  horasDia: ["Horas por dia padrão", "h"],
  supervisaoDia: ["Diária do acompanhamento técnico", "R$"],
};

/** Linhas normalizadas de uma versão (espelho consultável do snapshot). */
function normalized(raw: PricingParams) {
  const p = normalizeParams(raw);
  const parameters: Prisma.PricingParameterCreateManyVersionInput[] = [
    ...Object.entries(p.general).map(([k, v]) => ({
      group: "GERAL", key: `geral.${k}`, label: GENERAL_LABELS[k as keyof PricingParams["general"]][0], value: v, unit: GENERAL_LABELS[k as keyof PricingParams["general"]][1],
    })),
    { group: "REGRAS", key: "regras.podaPriceMethod", label: "Metodologia de preço da poda", textValue: p.rules.podaPriceMethod },
    { group: "REGRAS", key: "regras.minTecnicos", label: "Quantidade mínima de técnicos por serviço", value: String(p.rules.minTecnicos), unit: "técnicos" },
    { group: "REGRAS", key: "regras.auxiliaresPorTecnico", label: "Auxiliares por técnico", value: p.rules.auxiliaresPorTecnico, unit: "auxiliares" },
    { group: "APROVACAO", key: "aprovacao.margemComercial", label: "Margem mínima para aprovação comercial", value: p.approval.margemComercial, unit: "fração" },
    { group: "APROVACAO", key: "aprovacao.margemGerencial", label: "Margem mínima para aprovação gerencial", value: p.approval.margemGerencial, unit: "fração" },
    { group: "APROVACAO", key: "aprovacao.descontoAlerta", label: "Desconto que exige confirmação", value: p.approval.descontoAlerta, unit: "fração" },
    { group: "APROVACAO", key: "aprovacao.fluxoObrigatorio", label: "Aprovação interna obrigatória", textValue: String(p.approval.fluxoObrigatorio) },
  ];
  const sup = p.services.SUPRESSAO;
  if (sup.compensacao) {
    parameters.push(
      { group: "SUPRESSAO", key: "supressao.compensacao.unidadesPorArvore", label: "Mudas por árvore suprimida (padrão)", value: sup.compensacao.unidadesPorArvore, unit: "mudas" },
      { group: "SUPRESSAO", key: "supressao.compensacao.valorUnidade", label: "Valor por muda", value: sup.compensacao.valorUnidade, unit: "R$" },
      { group: "SUPRESSAO", key: "supressao.compensacao.custoFixo", label: "Custo fixo da compensação", value: sup.compensacao.custoFixo, unit: "R$" },
    );
  }
  if (sup.frete) {
    parameters.push(
      { group: "SUPRESSAO", key: "supressao.frete.tarifaTonKm", label: "Tarifa de frete", value: sup.frete.tarifaTonKm, unit: "R$/t·km" },
      { group: "SUPRESSAO", key: "supressao.frete.valorMinimo", label: "Frete mínimo", value: sup.frete.valorMinimo, unit: "R$" },
      { group: "SUPRESSAO", key: "supressao.frete.pesoPorMudaKg", label: "Peso por muda", value: sup.frete.pesoPorMudaKg, unit: "kg" },
    );
  }
  for (const d of DIFFICULTIES)
    if (sup.cacambaArvoresPor?.[d]) parameters.push({ group: "SUPRESSAO", key: `supressao.cacamba.arvoresPor.${d}`, label: `Árvores por caçamba (${DIFFICULTY_LABEL[d]})`, value: sup.cacambaArvoresPor[d], unit: "árvores" });

  const services = Object.entries(p.services) as [ServiceCode, PricingParams["services"][ServiceCode]][];
  return {
    parameters,
    productivity: services.flatMap(([svc, sp]) =>
      DIFFICULTIES.filter((d) => sp.productivity[d]).map((d) => ({
        serviceCode: svc, difficulty: d, label: [DIFFICULTY_LABEL[d], sp.difficultyHints?.[d]].filter(Boolean).join(" — "), treesPerDay: sp.productivity[d]!,
      }))),
    modifiers: services.flatMap(([svc, sp]) =>
      (sp.modifiers ?? []).map((m) => ({ serviceCode: svc, key: m.key, description: m.label, factor: m.factor, active: m.active, order: m.order, addsDays: m.addsDays, legacyInProduct: m.legacyInProduct }))),
    serviceTypes: services.flatMap(([svc, sp]) =>
      (sp.serviceTypes ?? []).map((t) => ({ serviceCode: svc, code: t.code, label: t.label, factor: t.factor, includesLicense: t.includesLicense ?? null, cacambaArvoresPor: t.cacambaArvoresPor ?? null }))),
    licenseTiers: services.flatMap(([svc, sp]) =>
      (sp.licenseTiers ?? []).map((t) => ({ serviceCode: svc, minTrees: t.minTrees, maxTrees: t.maxTrees, divisor: t.divisor, hours: t.hours }))),
  };
}

/** Cria uma nova versão ATIVA de parâmetros (a anterior é desativada; nada é apagado). */
export async function publishParamsVersion(tx: Tx, params: PricingParams, opts: { description: string; userId?: string | null; v2ValidatedNote?: string | null }) {
  const major = params.engineVersion === "V2_ARBORENT" ? 2 : 1;
  const last = await tx.pricingParameterVersion.findFirst({ where: { major }, orderBy: { minor: "desc" }, select: { minor: true } });
  const minor = last ? last.minor + 1 : 0;
  await tx.pricingParameterVersion.updateMany({ where: { active: true }, data: { active: false } });
  const n = normalized(params);
  return tx.pricingParameterVersion.create({
    data: {
      major, minor, label: `${major}.${minor}`, engineVersion: params.engineVersion, description: opts.description, active: true,
      snapshot: params as unknown as Prisma.InputJsonValue, createdById: opts.userId ?? null,
      v2ValidatedAt: opts.v2ValidatedNote ? new Date() : null, v2ValidatedNote: opts.v2ValidatedNote ?? null,
      parameters: { createMany: { data: n.parameters } },
      productivity: { createMany: { data: n.productivity } },
      modifiers: { createMany: { data: n.modifiers } },
      serviceTypes: { createMany: { data: n.serviceTypes } },
      licenseTiers: { createMany: { data: n.licenseTiers } },
    },
  });
}

/** Garante catálogo de serviços e a versão inicial "1.0 — legado Excel". Idempotente. */
export async function ensurePricingSetup(db: PrismaClient) {
  let order = 0;
  for (const s of Object.values(SERVICES)) {
    await db.pricingService.upsert({
      where: { code: s.code },
      create: { code: s.code, name: s.name, description: s.description, unit: s.unit, order: order++ },
      update: {},
    });
  }
  const count = await db.pricingParameterVersion.count();
  if (count === 0) {
    await db.$transaction(async (tx) => {
      await publishParamsVersion(tx, LEGACY_EXCEL_PARAMS, {
        description: "Versão inicial — Pricing Engine v1 (LEGACY EXCEL): reproduz a planilha Arborent_Precificacao_final_v2.xlsx.",
      });
    });
    return { created: true };
  }
  return { created: false };
}

/** Aplica, uma única vez, as mudanças de parâmetros registradas (cada uma gera NOVA versão). */
export async function applyPricingParamMigrations(db: PrismaClient) {
  const applied: string[] = [];
  for (const m of PRICING_PARAM_MIGRATIONS) {
    const key = `pricing_param_migration:${m.id}`;
    if (await db.setting.findUnique({ where: { key } })) continue;
    await db.$transaction(async (tx) => {
      const active = await tx.pricingParameterVersion.findFirstOrThrow({ where: { active: true } });
      const next = m.apply(active.snapshot as unknown as PricingParams);
      const v = await publishParamsVersion(tx, next, { description: m.description });
      await tx.pricingAuditLog.create({
        data: { action: "PARAMETROS", entity: "PricingParameterVersion", entityId: v.id, field: `versão ${active.label} → ${v.label}`, justification: m.description },
      });
      await tx.setting.create({ data: { key, value: v.label } });
      applied.push(`${m.id} → v${v.label}`);
    });
  }
  return applied;
}
