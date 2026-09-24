/* Supressão arbórea — planilha SUPRESSAO_V0.
 *  dias = ⌈árvores / produtividade⌉ + dias extras dos modificadores (rede elétrica = +1)
 *  custo técnico = dias × técnico/dia × técnicos (⌈auxiliares/4⌉ na planilha)
 *  combustível = litros × preço/litro
 *  caçamba = ⌈árvores / (20 fácil | 10 média/difícil)⌉ × valor caçamba            (se usa caçamba)
 *  licença = árvores ÷ divisor × custo hora técnico × horas                        (tipo 1)
 *  compensação = árvores × unidades × valor unidade + custo fixo                   (se houver)
 *  custo base = técnico + auxiliares + deslocamento + alimentação + hospedagem + combustível (+ compensação no v1)
 *  após modificadores = custo base × Π fatores
 *  operacional = caçamba + rateio fixo + licença + após modificadores (+ compensação no v2)
 *  preço = operacional ÷ (1 − margem) ÷ (1 − imposto)
 */
import { Calc, EngineError, buildResult, commonBlock, derived, licenseTier, modifiersBlock, priceBlock } from "../engine";
import { ceil, dec, fmtBRL, fmtN } from "../decimal";
import type { CalcResult, Difficulty, PricingParams, SupressaoInputs } from "../types";

export function calcSupressao(p: PricingParams, inp: SupressaoInputs): CalcResult {
  const calc = new Calc();
  const sp = p.services.SUPRESSAO;
  const v1 = p.engineVersion === "V1_LEGACY_EXCEL";
  const type = sp.serviceTypes?.find((t) => t.code === inp.serviceType);
  if (!type) throw new EngineError("Tipo de serviço de supressão inválido.");

  const mods = modifiersBlock(p, "SUPRESSAO", inp.modifiers, calc);
  const c = commonBlock("SUPRESSAO", p, inp, calc, { extraDays: mods.extraDays, techniciansCharged: "TEAM" });
  const g = p.general;

  const combustivel = calc.add("combustivel", "Combustível motosserra", dec(inp.fuelLiters).mul(dec(g.combustivelLitro)),
    `${fmtN(inp.fuelLiters)} L × ${fmtBRL(g.combustivelLitro)}`);

  let cacamba = dec(0);
  if (inp.cacamba) {
    const por = dec(sp.cacambaArvoresPor?.[inp.difficulty as Difficulty] ?? 10);
    const qtd = ceil(dec(inp.trees).div(por));
    cacamba = calc.add("cacamba", "Caçamba", qtd.mul(dec(g.cacamba)), `⌈${inp.trees} ÷ ${fmtN(por)}⌉ = ${fmtN(qtd)} caçamba(s) × ${fmtBRL(g.cacamba)}`);
  } else calc.add("cacamba", "Caçamba", cacamba, "Não utiliza caçamba");

  let licenca = dec(0);
  if (type.includesLicense) {
    const tier = licenseTier(p, "SUPRESSAO", inp.trees);
    licenca = calc.add("licenca", "Licenciamento", dec(inp.trees).div(dec(tier.divisor)).mul(derived(p).horaTecnico).mul(dec(tier.hours)),
      `${inp.trees} ÷ ${fmtN(tier.divisor)} × ${fmtBRL(derived(p).horaTecnico)}/h × ${fmtN(tier.hours)} h`);
  } else calc.add("licenca", "Licenciamento", licenca, "Não incluído (apenas supressão)");

  let compensacao = dec(0);
  if (inp.compensation) {
    const k = sp.compensacao!;
    compensacao = calc.add("compensacao", "Compensação ambiental",
      dec(inp.trees).mul(dec(k.unidadesPorArvore)).mul(dec(k.valorUnidade)).plus(dec(k.custoFixo)),
      `${inp.trees} árvores × ${fmtN(k.unidadesPorArvore)} unidades × ${fmtBRL(k.valorUnidade)} + ${fmtBRL(k.custoFixo)} fixo` +
        (v1 ? " (v1: entra no custo base e é multiplicada pelos modificadores)" : ""));
  } else calc.add("compensacao", "Compensação ambiental", compensacao, "Sem compensação");

  const labor = c.tecnico.plus(c.auxiliares).plus(c.deslocamento).plus(c.alimentacao).plus(c.hospedagem).plus(combustivel);
  const baseCost = v1 ? labor.plus(compensacao) : labor;
  calc.add("custoBase", "Custo base (antes dos fatores)", baseCost,
    v1 ? "Técnico + auxiliares + deslocamento + alimentação + hospedagem + combustível + compensação"
       : "Técnico + auxiliares + deslocamento + alimentação + hospedagem + combustível", "TOTAL");
  const afterModifiers = calc.add("aposModificadores", "Valor após modificadores", baseCost.mul(mods.factor),
    `${fmtBRL(baseCost)} × ${fmtN(mods.factor)}`, "TOTAL");
  let operational = cacamba.plus(c.rateio).plus(licenca).plus(afterModifiers);
  if (!v1) operational = operational.plus(compensacao);
  calc.add("custoOperacional", "Custo operacional", operational,
    `Caçamba + rateio fixo + licenciamento + valor após modificadores${v1 ? "" : " + compensação"}`, "TOTAL");

  const price = priceBlock(p, operational, inp.trees, calc, "STANDARD");
  return buildResult({
    service: "SUPRESSAO", engineVersion: p.engineVersion, calc, common: c,
    costs: {
      tecnico: c.tecnico, auxiliares: c.auxiliares, deslocamento: c.deslocamento, alimentacao: c.alimentacao,
      hospedagem: c.hospedagem, combustivel, cacamba, licenca, compensacao, rateioFixo: c.rateio,
    },
    baseCost, mods, afterModifiers, operational, price, method: "STANDARD", auxiliaries: inp.auxiliaries,
  });
}
