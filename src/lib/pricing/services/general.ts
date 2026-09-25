/* Serviços por diárias de equipe — avaliação de risco, consultoria, licenciamento ambiental, manejo,
 * manutenção periódica, plantio e tratamento fitossanitário.
 * Não há produtividade por árvore: os dias de trabalho e a equipe são informados no orçamento.
 *  equipe = técnicos (informados) + auxiliares
 *  mão de obra/logística = mesmas regras dos demais serviços (técnico/dia, auxiliar/dia, km, pedágio,
 *                          alimentação, hospedagem — valores regionais quando informados) + rateio fixo por dia
 *  operacional = mão de obra/logística + materiais/insumos + terceiros/taxas
 *  preço = operacional ÷ (1 − margem) ÷ (1 − imposto)
 */
import { Calc, EngineError, buildResult, laborBlock, priceBlock } from "../engine";
import { dec, fmtBRL, fmtN } from "../decimal";
import type { CalcResult, GeneralInputs, GeneralServiceCode, PricingParams } from "../types";

export type UnitLabel = { one: string; many: string };

export function calcGeneral(service: GeneralServiceCode, unit: UnitLabel) {
  return (p: PricingParams, inp: GeneralInputs): CalcResult => {
    const calc = new Calc();
    const g = p.general;
    const has = (v: number | null | undefined) => v !== null && v !== undefined;
    if (inp.trees <= 0) throw new EngineError("Informe a quantidade.");
    if (inp.days <= 0) throw new EngineError("Informe os dias de trabalho.");
    const n = dec(inp.trees);
    const days = dec(inp.days);
    const technicians = dec(inp.technicians);
    const persons = technicians.plus(inp.auxiliaries);
    const meal = has(inp.mealCost) ? dec(inp.mealCost!) : dec(g.alimentacaoPessoaDia);
    const lodgingDay = has(inp.lodgingCost) ? dec(inp.lodgingCost!) : dec(g.hospedagemPessoaDia);

    calc.add("arvores", "Quantidade", n, `${fmtN(n)} ${inp.trees === 1 ? unit.one : unit.many}`, "QTD", "num");
    calc.add("dias", "Dias de trabalho", days, `${fmtN(days)} dia(s) informado(s)`, "QTD", "num");
    calc.add("equipe", "Equipe", persons, `${fmtN(technicians)} técnico(s) + ${fmtN(inp.auxiliaries)} auxiliar(es) = ${fmtN(persons)} pessoa(s)`, "QTD", "num");
    if (persons.isZero()) calc.warn("ZERO_PESSOAS", "Equipe com 0 pessoas: mão de obra, deslocamento, alimentação e hospedagem ficam zerados.", "confirm");

    const l = laborBlock(p, inp, calc, {
      days, persons, techCharged: technicians, meal, lodgingDay,
      mealTag: has(inp.mealCost) ? " (valor regional)" : "", lodgingTag: has(inp.lodgingCost) ? " (valor regional)" : "", techNote: "",
    });
    const materiais = calc.add("materiais", "Materiais e insumos", dec(inp.materials ?? 0), has(inp.materials) ? "Valor informado" : "Não informado");
    const terceiros = calc.add("terceiros", "Terceiros, taxas e emolumentos", dec(inp.thirdParty ?? 0), has(inp.thirdParty) ? "Valor informado" : "Não informado");
    const costs = {
      tecnico: l.tecnico, auxiliares: l.auxiliares, deslocamento: l.deslocamento, alimentacao: l.alimentacao, hospedagem: l.hospedagem,
      materiais, terceiros, rateioFixo: l.rateio,
    };
    const operational = Object.values(costs).reduce((a, b) => a.plus(b), dec(0));
    calc.add("custoOperacional", "Custo operacional", operational, "Mão de obra + logística + materiais + terceiros + rateio fixo", "TOTAL");
    if (days.gt(120)) calc.warn("DIAS_ALTOS", `Operação longa: ${fmtN(days)} dias.`, "confirm");
    if (inp.distanceKm > 2000) calc.warn("DISTANCIA_ALTA", `Distância muito alta (${inp.distanceKm} km ida+volta).`, "confirm");

    const price = priceBlock(p, operational, inp.trees, calc, "STANDARD", unit);
    return buildResult({
      service, engineVersion: p.engineVersion, calc,
      common: { days, baseDays: days, extraDays: 0, prod: dec(0), technicians, techCharged: technicians, persons },
      costs, baseCost: operational, afterModifiers: operational, operational, price, method: "STANDARD", auxiliaries: inp.auxiliaries,
      details: { mealCost: meal.toString(), lodgingCost: lodgingDay.toString(), unit: unit.one },
    });
  };
}

export { fmtBRL };
