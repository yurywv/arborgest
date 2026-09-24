/* Pricing Engine — núcleo comum a todos os serviços.
 *
 * Cada serviço (inventário, supressão, poda…) é um módulo em ./services que declara suas entradas e
 * a função de cálculo; o registro fica em ./registry. Para criar um novo serviço basta um novo módulo
 * + parâmetros na versão vigente — o restante do sistema (orçamentos, propostas, PDF) é genérico.
 */
import { D, type DecimalT, ceil, dec, fmtBRL, fmtN, fmtPct, money, s } from "./decimal";
import type {
  BaseInputs, CalcComponent, CalcResult, CalcWarning, ComponentGroup, Difficulty, EngineVersion, FieldOperationInputs, ModifierDef,
  PricingParams, ServiceCode,
} from "./types";
import { DIFFICULTY_LABEL } from "./types";

export class EngineError extends Error {}

/** Derivados dos parâmetros gerais. */
export function derived(p: PricingParams) {
  const g = p.general;
  const horas = dec(g.horasDia);
  return {
    custoFixoDia: dec(g.custoFixoMensal).div(dec(g.diasProdutivosMes)),
    horaTecnico: dec(g.tecnicoDia).div(horas),
    horaAuxiliar: dec(g.auxiliarDia).div(horas),
  };
}

/** Regras efetivas: o motor v2 impõe metodologia padronizada da poda e ao menos 1 técnico. */
export function effectiveRules(p: PricingParams) {
  return p.engineVersion === "V2_ARBORENT"
    ? { ...p.rules, podaPriceMethod: "STANDARD" as const, minTecnicos: Math.max(1, p.rules.minTecnicos) }
    : p.rules;
}

/** Registro incremental da memória de cálculo. */
export class Calc {
  components: CalcComponent[] = [];
  warnings: CalcWarning[] = [];
  add(key: string, label: string, value: DecimalT, formula: string, group: ComponentGroup = "CUSTO", kind: "money" | "num" | "pct" = "money") {
    const display = kind === "money" ? fmtBRL(value) : kind === "pct" ? fmtPct(value) : fmtN(value);
    this.components.push({ key, label, value: s(value), display, formula, group });
    return value;
  }
  warn(code: string, message: string, level: CalcWarning["level"] = "info") {
    if (!this.warnings.some((w) => w.code === code)) this.warnings.push({ code, message, level });
  }
}

const plural = (n: number | DecimalT, one: string, many: string) => `${fmtN(n as number)} ${Number(n) === 1 ? one : many}`;

/** Dias, equipe e custos de mão de obra/logística comuns a todos os serviços. */
export function commonBlock(
  service: ServiceCode,
  p: PricingParams,
  inp: BaseInputs,
  calc: Calc,
  opts: { extraDays?: number; techniciansCharged: "FIXED_ONE" | "TEAM" },
) {
  const g = p.general;
  const sp = p.services[service];
  const rawProd = sp.productivity[inp.difficulty as Difficulty];
  if (rawProd === undefined || rawProd === "") throw new EngineError(`Nível de dificuldade "${DIFFICULTY_LABEL[inp.difficulty as Difficulty] ?? inp.difficulty}" indisponível para este serviço.`);
  const prod = dec(rawProd);
  if (prod.lte(0)) throw new EngineError("Produtividade deve ser maior que zero.");
  const hint = sp.difficultyHints?.[inp.difficulty as Difficulty];
  // Valores regionais informados no item prevalecem sobre o padrão dos parâmetros.
  const has = (v: number | null | undefined) => v !== null && v !== undefined;
  const meal = has(inp.mealCost) ? dec(inp.mealCost!) : dec(g.alimentacaoPessoaDia);
  const lodgingDay = has(inp.lodgingCost) ? dec(inp.lodgingCost!) : dec(g.hospedagemPessoaDia);
  const mealTag = has(inp.mealCost) ? " (valor regional)" : "";
  const lodgingTag = has(inp.lodgingCost) ? " (valor regional)" : "";
  const n = dec(inp.trees);
  const baseDays = ceil(n.div(prod));
  const extraDays = opts.extraDays ?? 0;
  const days = baseDays.plus(extraDays);

  // Equipe — regra da planilha: técnicos = ⌈auxiliares / 4⌉; pessoas = auxiliares + técnicos.
  const rules = effectiveRules(p);
  const perTech = dec(rules.auxiliaresPorTecnico);
  if (perTech.lte(0)) throw new EngineError("Auxiliares por técnico deve ser maior que zero.");
  const techFormula = ceil(dec(inp.auxiliaries).div(perTech));
  const technicians = D.max(techFormula, rules.minTecnicos);
  const persons = technicians.plus(inp.auxiliaries);
  const techCharged = opts.techniciansCharged === "FIXED_ONE" ? dec(1) : technicians;

  calc.add("arvores", "Quantidade", n, plural(n, "árvore", "árvores"), "QTD", "num");
  calc.add("produtividade", "Produtividade", prod, `${fmtN(prod)} árvores/dia (${DIFFICULTY_LABEL[inp.difficulty as Difficulty]}${hint ? ` — ${hint}` : ""})`, "QTD", "num");
  calc.add("dias", "Dias estimados", days,
    `⌈${fmtN(n)} ÷ ${fmtN(prod)}⌉ = ${fmtN(baseDays)}${extraDays ? ` + ${extraDays} (rede elétrica) = ${fmtN(days)}` : ""}`, "QTD", "num");
  calc.add("equipe", "Equipe", persons,
    `${plural(technicians, "técnico", "técnicos")} + ${plural(inp.auxiliaries, "auxiliar", "auxiliares")} = ${plural(persons, "pessoa", "pessoas")}` +
      (rules.minTecnicos > 0 ? ` (mínimo de ${rules.minTecnicos} técnico(s))` : " (⌈auxiliares ÷ " + fmtN(perTech) + "⌉ técnicos, regra da planilha)"),
    "QTD", "num");

  if (technicians.isZero() && rules.minTecnicos === 0)
    calc.warn("ZERO_TECNICOS", "Com 0 auxiliares a regra da planilha resulta em 0 técnicos na equipe (e sem custo técnico em supressão/poda). Confirme ou defina \"Quantidade mínima de técnicos\" nos parâmetros.", "confirm");
  if (persons.isZero())
    calc.warn("ZERO_PESSOAS", "Equipe com 0 pessoas: deslocamento, alimentação e hospedagem ficam zerados.", "confirm");

  const tecnico = calc.add("tecnico", "Técnico", days.mul(dec(g.tecnicoDia)).mul(techCharged),
    `${plural(days, "dia", "dias")} × ${fmtBRL(g.tecnicoDia)} × ${plural(techCharged, "técnico", "técnicos")}` +
      (opts.techniciansCharged === "FIXED_ONE" ? " (inventário: 1 técnico)" : ""));
  const auxiliares = calc.add("auxiliares", "Auxiliares", days.mul(dec(g.auxiliarDia)).mul(inp.auxiliaries),
    `${plural(days, "dia", "dias")} × ${fmtBRL(g.auxiliarDia)} × ${plural(inp.auxiliaries, "auxiliar", "auxiliares")}`);
  const deslocamento = calc.add("deslocamento", "Deslocamento",
    dec(inp.distanceKm).mul(dec(g.custoKm)).plus(dec(inp.toll)).mul(days).mul(persons),
    `(${fmtN(inp.distanceKm)} km × ${fmtBRL(g.custoKm)} + pedágio ${fmtBRL(inp.toll)}) × ${plural(days, "dia", "dias")} × ${plural(persons, "pessoa", "pessoas")}`);
  const alimentacao = calc.add("alimentacao", "Alimentação", days.mul(persons).mul(meal),
    `${plural(days, "dia", "dias")} × ${plural(persons, "pessoa", "pessoas")} × ${fmtBRL(meal)}${mealTag}`);
  const hospedagem = calc.add("hospedagem", "Hospedagem",
    inp.lodging ? days.mul(persons).mul(lodgingDay) : dec(0),
    inp.lodging ? `${plural(days, "dia", "dias")} × ${plural(persons, "pessoa", "pessoas")} × ${fmtBRL(lodgingDay)}${lodgingTag}` : "Sem hospedagem");
  const rateio = calc.add("rateioFixo", "Rateio custo fixo", days.mul(derived(p).custoFixoDia),
    `${plural(days, "dia", "dias")} × ${fmtBRL(derived(p).custoFixoDia)}/dia (${fmtBRL(g.custoFixoMensal)} ÷ ${fmtN(g.diasProdutivosMes)} dias)`);

  if (inp.trees > 5000) calc.warn("MUITAS_ARVORES", `Quantidade muito alta (${inp.trees} árvores).`, "confirm");
  if (inp.distanceKm > 2000) calc.warn("DISTANCIA_ALTA", `Distância muito alta (${inp.distanceKm} km ida+volta).`, "confirm");
  if (days.gt(120)) calc.warn("DIAS_ALTOS", `Operação longa: ${fmtN(days)} dias estimados.`, "confirm");
  if (inp.auxiliaries > 30) calc.warn("EQUIPE_GRANDE", `Equipe muito grande (${inp.auxiliaries} auxiliares).`, "confirm");

  return { n, prod, baseDays, extraDays, days, technicians, techCharged, persons, tecnico, auxiliares, deslocamento, alimentacao, hospedagem, rateio, meal, lodgingDay };
}

/** Caçamba: quantidade e preço unitário podem ser informados (valores regionais); senão, regra de árvores por caçamba. */
export function cacambaBlock(p: PricingParams, inp: FieldOperationInputs, calc: Calc, arvoresPor: DecimalT) {
  if (!inp.cacamba) {
    calc.add("cacamba", "Caçamba", dec(0), "Não utiliza caçamba");
    return { cost: dec(0), qty: 0 };
  }
  const informedQty = inp.cacambaQty !== null && inp.cacambaQty !== undefined;
  const informedPrice = inp.cacambaUnitPrice !== null && inp.cacambaUnitPrice !== undefined;
  if (arvoresPor.lte(0) && !informedQty) throw new EngineError("Árvores por caçamba deve ser maior que zero.");
  const qty = informedQty ? dec(inp.cacambaQty!) : ceil(dec(inp.trees).div(arvoresPor));
  const unit = informedPrice ? dec(inp.cacambaUnitPrice!) : dec(p.general.cacamba);
  const cost = calc.add("cacamba", "Caçamba", qty.mul(unit),
    `${informedQty ? `${fmtN(qty)} caçamba(s) informada(s)` : `⌈${inp.trees} ÷ ${fmtN(arvoresPor)}⌉ = ${fmtN(qty)} caçamba(s)`} × ${fmtBRL(unit)}${informedPrice ? " (preço regional)" : ""}`);
  return { cost, qty: qty.toNumber() };
}

/**
 * Acompanhamento técnico (poda/supressão): diária do profissional + alimentação, hospedagem (se houver) e transporte
 * pelos dias de presença. Fora dos fatores de dificuldade (custo por dia de presença).
 */
export function supervisionBlock(p: PricingParams, inp: FieldOperationInputs, calc: Calc, c: ReturnType<typeof commonBlock>) {
  if (!inp.supervision) return { total: dec(0), days: 0 };
  const informed = inp.supervisionDays !== null && inp.supervisionDays !== undefined;
  const d = informed ? dec(inp.supervisionDays!) : c.days;
  const daily = dec(p.general.supervisaoDia);
  const dd = plural(d, "dia", "dias");
  const diaria = calc.add("supervisao", "Acompanhamento técnico — diária", d.mul(daily), `${dd}${informed ? " (informado)" : " (dias da operação)"} × ${fmtBRL(daily)}`);
  const alim = calc.add("supervisaoAlimentacao", "Acompanhamento técnico — alimentação", d.mul(c.meal), `${dd} × ${fmtBRL(c.meal)}`);
  const hosp = calc.add("supervisaoHospedagem", "Acompanhamento técnico — hospedagem", inp.lodging ? d.mul(c.lodgingDay) : dec(0),
    inp.lodging ? `${dd} × ${fmtBRL(c.lodgingDay)}` : "Sem hospedagem");
  const transp = calc.add("supervisaoTransporte", "Acompanhamento técnico — transporte",
    dec(inp.distanceKm).mul(dec(p.general.custoKm)).plus(dec(inp.toll)).mul(d),
    `(${fmtN(inp.distanceKm)} km × ${fmtBRL(p.general.custoKm)} + pedágio ${fmtBRL(inp.toll)}) × ${dd}`);
  return { total: diaria.plus(alim).plus(hosp).plus(transp), days: d.toNumber() };
}

/** Produto dos modificadores ligados. No motor v1 só entram os que a planilha multiplica. */
export function modifiersBlock(p: PricingParams, service: ServiceCode, selected: string[], calc: Calc) {
  const defs = (p.services[service].modifiers ?? []).filter((m) => selected.includes(m.key));
  const v1 = p.engineVersion === "V1_LEGACY_EXCEL";
  let factor = dec(1);
  const applied: { key: string; label: string; factor: string; inProduct: boolean }[] = [];
  let extraDays = 0;
  for (const m of defs as ModifierDef[]) {
    const f = dec(m.factor);
    if (f.lte(0)) throw new EngineError(`Fator do modificador "${m.label}" deve ser maior que zero.`);
    const inProduct = v1 ? m.legacyInProduct : true;
    if (inProduct) factor = factor.mul(f);
    else if (!f.eq(1)) calc.warn(`MOD_IGNORADO_${m.key}`, `"${m.label}" tem fator ${fmtN(f)}, mas o motor legado (planilha) não o multiplica.`);
    extraDays += m.addsDays;
    applied.push({ key: m.key, label: m.label, factor: s(f), inProduct });
  }
  const inProd = applied.filter((a) => a.inProduct);
  calc.add("fatorModificadores", "Fator modificadores", factor,
    inProd.length ? `${inProd.map((a) => fmtN(a.factor)).join(" × ")} = ${fmtN(factor)} (${inProd.map((a) => a.label).join("; ")})` : "Nenhum modificador (1)",
    "FATOR", "num");
  return { factor, applied, extraDays };
}

/** Margem, imposto e preço final. */
export function priceBlock(p: PricingParams, operational: DecimalT, trees: number, calc: Calc, method: "STANDARD" | "LEGACY_PODA") {
  const m = dec(p.general.margem);
  const t = dec(p.general.imposto);
  if (m.gte(1) || m.lt(0)) throw new EngineError("Margem deve estar entre 0% e 99,99%.");
  if (t.gte(1) || t.lt(0)) throw new EngineError("Imposto deve estar entre 0% e 99,99%.");
  const priceBeforeTax = calc.add("precoAntesImposto", "Preço antes do imposto", operational.div(D.sub(1, m)),
    `${fmtBRL(operational)} ÷ (1 − ${fmtPct(m)}) — margem sobre o preço de venda`, "PRECO");
  const finalPrice =
    method === "LEGACY_PODA"
      ? calc.add("precoFinal", "Preço final", operational.div(D.sub(1, t)),
          `${fmtBRL(operational)} ÷ (1 − ${fmtPct(t)}) — METODOLOGIA LEGADA DA PODA: aplica só o imposto sobre o custo (margem não aplicada)`, "PRECO")
      : calc.add("precoFinal", "Preço final", priceBeforeTax.div(D.sub(1, t)), `${fmtBRL(priceBeforeTax)} ÷ (1 − ${fmtPct(t)})`, "PRECO");
  const unit = trees > 0 ? finalPrice.div(trees) : dec(0);
  calc.add("precoUnitario", "Preço por árvore", unit, trees > 0 ? `${fmtBRL(finalPrice)} ÷ ${trees}` : "Sem árvores", "PRECO");
  const net = finalPrice.mul(D.sub(1, t));
  const effectiveMargin = net.isZero() ? dec(0) : net.minus(operational).div(net);
  if (method === "LEGACY_PODA")
    calc.warn("PODA_LEGADO", "Metodologia legada da poda (planilha): o preço final não aplica a margem — margem efetiva ≈ 0%. Veja Administração › Precificação.");
  return { margin: m, tax: t, priceBeforeTax, finalPrice, unit, effectiveMargin };
}

export function buildResult(args: {
  service: ServiceCode; engineVersion: EngineVersion; calc: Calc;
  common: ReturnType<typeof commonBlock>; costs: Record<string, DecimalT>; baseCost: DecimalT;
  serviceTypeFactor?: DecimalT; mods?: ReturnType<typeof modifiersBlock>; afterModifiers: DecimalT;
  operational: DecimalT; price: ReturnType<typeof priceBlock>; method: "STANDARD" | "LEGACY_PODA"; auxiliaries: number;
  details?: Record<string, string | number | null>;
}): CalcResult {
  const { common: c, price } = args;
  return {
    service: args.service,
    engineVersion: args.engineVersion,
    days: c.days.toNumber(),
    baseDays: c.baseDays.toNumber(),
    extraDays: c.extraDays,
    productivity: s(c.prod),
    technicians: c.technicians.toNumber(),
    techniciansCharged: c.techCharged.toNumber(),
    auxiliaries: args.auxiliaries,
    persons: c.persons.toNumber(),
    costs: Object.fromEntries(Object.entries(args.costs).map(([k, v]) => [k, s(v)])),
    baseCost: s(args.baseCost),
    serviceTypeFactor: s(args.serviceTypeFactor ?? dec(1)),
    modifiersFactor: s(args.mods?.factor ?? dec(1)),
    modifiersApplied: args.mods?.applied ?? [],
    afterModifiers: s(args.afterModifiers),
    operationalCost: s(args.operational),
    margin: s(price.margin),
    tax: s(price.tax),
    priceBeforeTax: s(price.priceBeforeTax),
    finalPrice: s(price.finalPrice),
    unitPrice: s(price.unit),
    finalPriceRounded: s(money(price.finalPrice)),
    unitPriceRounded: s(money(price.unit)),
    effectiveMargin: s(price.effectiveMargin),
    priceMethod: args.method,
    details: args.details ?? {},
    components: args.calc.components,
    warnings: args.calc.warnings,
  };
}

/** Faixa de licenciamento (divisor/horas) conforme a quantidade de árvores. */
export function licenseTier(p: PricingParams, service: ServiceCode, trees: number) {
  const tiers = p.services[service].licenseTiers ?? [];
  const t = tiers.find((x) => trees >= x.minTrees && (x.maxTrees === null || trees <= x.maxTrees)) ?? tiers[tiers.length - 1];
  if (!t) throw new EngineError("Faixas de licenciamento não configuradas.");
  return t;
}
