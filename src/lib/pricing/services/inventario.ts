/* Inventário arbóreo — planilha INVENTARIO_V0.
 *  dias = ⌈árvores / produtividade⌉
 *  custo técnico = dias × técnico/dia            (v1: sempre 1 técnico; v2: técnicos da equipe)
 *  operacional = técnico + auxiliares + deslocamento + alimentação + hospedagem + plaquinhas + rateio fixo
 *  preço = operacional ÷ (1 − margem) ÷ (1 − imposto)
 */
import { Calc, buildResult, commonBlock, priceBlock } from "../engine";
import { dec, fmtBRL } from "../decimal";
import type { CalcResult, InventarioInputs, PricingParams } from "../types";

export function calcInventario(p: PricingParams, inp: InventarioInputs): CalcResult {
  const calc = new Calc();
  const v1 = p.engineVersion === "V1_LEGACY_EXCEL";
  const c = commonBlock("INVENTARIO", p, inp, calc, { techniciansCharged: v1 ? "FIXED_ONE" : "TEAM" });
  const plaquinhas = calc.add("plaquinhas", "Plaquetas + QR Code", dec(inp.trees).mul(dec(p.general.plaquinhaArvore)),
    `${inp.trees} árvores × ${fmtBRL(p.general.plaquinhaArvore)}`);
  const costs = {
    tecnico: c.tecnico, auxiliares: c.auxiliares, deslocamento: c.deslocamento, alimentacao: c.alimentacao,
    hospedagem: c.hospedagem, plaquinhas, rateioFixo: c.rateio,
  };
  const operational = Object.values(costs).reduce((a, b) => a.plus(b), dec(0));
  calc.add("custoOperacional", "Custo operacional", operational, "Soma de todos os custos", "TOTAL");
  const price = priceBlock(p, operational, inp.trees, calc, "STANDARD");
  return buildResult({
    service: "INVENTARIO", engineVersion: p.engineVersion, calc, common: c, costs, baseCost: operational,
    afterModifiers: operational, operational, price, method: "STANDARD", auxiliaries: inp.auxiliaries,
  });
}
