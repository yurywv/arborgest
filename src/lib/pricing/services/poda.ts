/* Poda — planilha PODA_V0.
 *  dias = ⌈árvores / produtividade⌉ + dias extras dos modificadores (rede elétrica = +1)
 *  caçamba = ⌈árvores / (100 só limpeza | 50 demais)⌉ × valor caçamba             (se usa caçamba)
 *  licença = árvores ÷ (5 se < 10 | 10) × custo hora técnico × (4 | 8) h           (se precisa licença)
 *  custo base = técnico + auxiliares + deslocamento + alimentação + hospedagem + combustível
 *  após modificadores = custo base × fator do tipo de poda × Π fatores
 *  operacional = caçamba + rateio fixo + licença + após modificadores
 *  preço: metodologia configurável ("Metodologia de preço da poda"):
 *    LEGADO (planilha):   preço final = operacional ÷ (1 − imposto)      ← margem NÃO aplicada
 *    PADRONIZADA:         preço final = operacional ÷ (1 − margem) ÷ (1 − imposto)
 */
import { Calc, EngineError, buildResult, commonBlock, derived, effectiveRules, licenseTier, modifiersBlock, priceBlock } from "../engine";
import { ceil, dec, fmtBRL, fmtN } from "../decimal";
import type { CalcResult, PodaInputs, PricingParams } from "../types";

export function calcPoda(p: PricingParams, inp: PodaInputs): CalcResult {
  const calc = new Calc();
  const sp = p.services.PODA;
  const type = sp.serviceTypes?.find((t) => t.code === inp.serviceType);
  if (!type) throw new EngineError("Tipo de poda inválido.");
  const typeFactor = dec(type.factor);
  if (typeFactor.lte(0)) throw new EngineError("Fator do tipo de poda deve ser maior que zero.");

  const mods = modifiersBlock(p, "PODA", inp.modifiers, calc);
  const c = commonBlock("PODA", p, inp, calc, { extraDays: mods.extraDays, techniciansCharged: "TEAM" });
  const g = p.general;

  const combustivel = calc.add("combustivel", "Combustível motosserra", dec(inp.fuelLiters).mul(dec(g.combustivelLitro)),
    `${fmtN(inp.fuelLiters)} L × ${fmtBRL(g.combustivelLitro)}`);

  let cacamba = dec(0);
  if (inp.cacamba) {
    const por = dec(type.cacambaArvoresPor ?? 50);
    const qtd = ceil(dec(inp.trees).div(por));
    cacamba = calc.add("cacamba", "Caçamba", qtd.mul(dec(g.cacamba)), `⌈${inp.trees} ÷ ${fmtN(por)}⌉ = ${fmtN(qtd)} caçamba(s) × ${fmtBRL(g.cacamba)}`);
  } else calc.add("cacamba", "Caçamba", cacamba, "Não utiliza caçamba");

  let licenca = dec(0);
  if (inp.license) {
    const tier = licenseTier(p, "PODA", inp.trees);
    licenca = calc.add("licenca", "Licenciamento", dec(inp.trees).div(dec(tier.divisor)).mul(derived(p).horaTecnico).mul(dec(tier.hours)),
      `${inp.trees} ÷ ${fmtN(tier.divisor)} × ${fmtBRL(derived(p).horaTecnico)}/h × ${fmtN(tier.hours)} h`);
  } else calc.add("licenca", "Licenciamento", licenca, "Sem licença");

  const baseCost = c.tecnico.plus(c.auxiliares).plus(c.deslocamento).plus(c.alimentacao).plus(c.hospedagem).plus(combustivel);
  calc.add("custoBase", "Custo base (antes dos fatores)", baseCost, "Técnico + auxiliares + deslocamento + alimentação + hospedagem + combustível", "TOTAL");
  calc.add("fatorTipo", "Fator tipo de poda", typeFactor, `${type.label}: ${fmtN(typeFactor)}`, "FATOR", "num");
  const afterModifiers = calc.add("aposModificadores", "Valor após modificadores", baseCost.mul(typeFactor).mul(mods.factor),
    `${fmtBRL(baseCost)} × ${fmtN(typeFactor)} × ${fmtN(mods.factor)}`, "TOTAL");
  const operational = cacamba.plus(c.rateio).plus(licenca).plus(afterModifiers);
  calc.add("custoOperacional", "Custo operacional", operational, "Caçamba + rateio fixo + licenciamento + valor após modificadores", "TOTAL");

  const method = effectiveRules(p).podaPriceMethod === "LEGACY" ? "LEGACY_PODA" : "STANDARD";
  const price = priceBlock(p, operational, inp.trees, calc, method);
  return buildResult({
    service: "PODA", engineVersion: p.engineVersion, calc, common: c,
    costs: {
      tecnico: c.tecnico, auxiliares: c.auxiliares, deslocamento: c.deslocamento, alimentacao: c.alimentacao,
      hospedagem: c.hospedagem, combustivel, cacamba, licenca, rateioFixo: c.rateio,
    },
    baseCost, serviceTypeFactor: typeFactor, mods, afterModifiers, operational, price, method, auxiliaries: inp.auxiliaries,
  });
}
