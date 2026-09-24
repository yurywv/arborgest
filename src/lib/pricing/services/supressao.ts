/* Supressão arbórea — planilha SUPRESSAO_V0 (motor v1) + ajustes Arborent.
 *  dias = ⌈árvores / produtividade⌉ + dias extras dos modificadores (rede elétrica = +1)
 *         produtividade por nível: fácil (altura ≤ 3 m) · média (> 3 m, longe) · difícil (> 3 m, perto) · muito difícil
 *  custo técnico = dias × técnico/dia × técnicos (⌈auxiliares/4⌉ na planilha)
 *  combustível = litros × preço/litro
 *  caçamba = quantidade (informada ou ⌈árvores / (20 fácil | 10 demais)⌉) × preço unitário (informado ou padrão)
 *  licença = árvores ÷ divisor × custo hora técnico × horas                        (tipo 1)
 *  compensação = mudas × valor por muda + custo fixo; mudas = informadas (lei municipal) ou árvores × mudas/árvore
 *  custo base = técnico + auxiliares + deslocamento + alimentação + hospedagem + combustível (+ compensação no v1)
 *  após modificadores = custo base × Π fatores
 *  operacional = caçamba + rateio fixo + licença + após modificadores (+ compensação no v2)
 *                + acompanhamento técnico + frete (fora dos fatores)
 *  preço = operacional ÷ (1 − margem) ÷ (1 − imposto)
 */
import {
  Calc, EngineError, buildResult, cacambaBlock, commonBlock, derived, licenseTier, modifiersBlock, priceBlock, supervisionBlock,
} from "../engine";
import { D, dec, fmtBRL, fmtN } from "../decimal";
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
  const has = (v: number | null | undefined) => v !== null && v !== undefined;

  const combustivel = calc.add("combustivel", "Combustível motosserra", dec(inp.fuelLiters).mul(dec(g.combustivelLitro)),
    `${fmtN(inp.fuelLiters)} L × ${fmtBRL(g.combustivelLitro)}`);

  const porDif = sp.cacambaArvoresPor?.[inp.difficulty as Difficulty] ?? (inp.difficulty === 1 ? "20" : "10");
  const cac = cacambaBlock(p, inp, calc, dec(porDif));

  let licenca = dec(0);
  if (type.includesLicense) {
    const tier = licenseTier(p, "SUPRESSAO", inp.trees);
    licenca = calc.add("licenca", "Licenciamento", dec(inp.trees).div(dec(tier.divisor)).mul(derived(p).horaTecnico).mul(dec(tier.hours)),
      `${inp.trees} ÷ ${fmtN(tier.divisor)} × ${fmtBRL(derived(p).horaTecnico)}/h × ${fmtN(tier.hours)} h`);
  } else calc.add("licenca", "Licenciamento", licenca, "Não incluído (apenas supressão)");

  // Compensação ambiental: mudas conforme a lei municipal (ou a regra padrão de mudas por árvore).
  let compensacao = dec(0);
  let seedlings = dec(0);
  const k = sp.compensacao!;
  const law = inp.compensationLaw?.trim() || null;
  if (inp.compensation) {
    seedlings = has(inp.seedlings) ? dec(inp.seedlings!) : dec(inp.trees).mul(dec(k.unidadesPorArvore));
    const unit = has(inp.seedlingUnitPrice) ? dec(inp.seedlingUnitPrice!) : dec(k.valorUnidade);
    const origin = has(inp.seedlings)
      ? `${fmtN(seedlings)} muda(s) informada(s)${law ? ` — ${law}` : ""}`
      : `${inp.trees} árvores × ${fmtN(k.unidadesPorArvore)} mudas = ${fmtN(seedlings)} mudas${law ? ` — ${law}` : ""}`;
    compensacao = calc.add("compensacao", "Compensação ambiental",
      seedlings.mul(unit).plus(dec(k.custoFixo)),
      `${origin} × ${fmtBRL(unit)}${has(inp.seedlingUnitPrice) ? " (valor regional)" : ""} + ${fmtBRL(k.custoFixo)} fixo` +
        (v1 ? " (v1: entra no custo base e é multiplicada pelos modificadores)" : ""));
    if (has(inp.seedlings) && !law) calc.warn("COMPENSACAO_SEM_LEI", "Quantidade de mudas informada sem citar a lei municipal aplicável.");
  } else calc.add("compensacao", "Compensação ambiental", compensacao, "Sem compensação");

  // Frete (mudas/materiais): valor da cidade ou distância × peso × tarifa. Fora dos fatores.
  let frete = dec(0);
  const mode = inp.freightMode ?? "NONE";
  if (mode === "FIXED") {
    frete = calc.add("frete", "Frete", dec(inp.freightValue ?? 0), `Valor informado${inp.compensationCity ? ` para ${inp.compensationCity}` : ""}`);
  } else if (mode === "CALC") {
    const f = sp.frete ?? { tarifaTonKm: "0", valorMinimo: "0", pesoPorMudaKg: "0" };
    const weightKg = has(inp.freightWeightKg) ? dec(inp.freightWeightKg!) : seedlings.mul(dec(f.pesoPorMudaKg));
    const dist = dec(inp.freightDistanceKm ?? 0);
    const raw = dist.mul(weightKg.div(1000)).mul(dec(f.tarifaTonKm));
    frete = calc.add("frete", "Frete", D.max(raw, dec(f.valorMinimo)),
      `${fmtN(dist)} km × ${fmtN(weightKg.div(1000))} t${has(inp.freightWeightKg) ? "" : ` (${fmtN(seedlings)} mudas × ${fmtN(f.pesoPorMudaKg)} kg)`} × ${fmtBRL(f.tarifaTonKm)}/t·km` +
        (dec(f.valorMinimo).gt(raw) ? ` → mínimo ${fmtBRL(f.valorMinimo)}` : ""));
    if (dec(f.tarifaTonKm).isZero()) calc.warn("FRETE_SEM_TARIFA", "Tarifa de frete (R$/t·km) não configurada nos parâmetros; informe o valor do frete ou configure a tarifa.");
  }

  const sup = supervisionBlock(p, inp, calc, c);

  const labor = c.tecnico.plus(c.auxiliares).plus(c.deslocamento).plus(c.alimentacao).plus(c.hospedagem).plus(combustivel);
  const baseCost = v1 ? labor.plus(compensacao) : labor;
  calc.add("custoBase", "Custo base (antes dos fatores)", baseCost,
    v1 ? "Técnico + auxiliares + deslocamento + alimentação + hospedagem + combustível + compensação"
       : "Técnico + auxiliares + deslocamento + alimentação + hospedagem + combustível", "TOTAL");
  const afterModifiers = calc.add("aposModificadores", "Valor após modificadores", baseCost.mul(mods.factor),
    `${fmtBRL(baseCost)} × ${fmtN(mods.factor)}`, "TOTAL");
  let operational = cac.cost.plus(c.rateio).plus(licenca).plus(afterModifiers).plus(sup.total).plus(frete);
  if (!v1) operational = operational.plus(compensacao);
  calc.add("custoOperacional", "Custo operacional", operational,
    `Caçamba + rateio fixo + licenciamento + valor após modificadores${v1 ? "" : " + compensação"}` +
      `${sup.total.isZero() ? "" : " + acompanhamento técnico"}${frete.isZero() ? "" : " + frete"}`, "TOTAL");

  const price = priceBlock(p, operational, inp.trees, calc, "STANDARD");
  return buildResult({
    service: "SUPRESSAO", engineVersion: p.engineVersion, calc, common: c,
    costs: {
      tecnico: c.tecnico, auxiliares: c.auxiliares, deslocamento: c.deslocamento, alimentacao: c.alimentacao,
      hospedagem: c.hospedagem, combustivel, cacamba: cac.cost, licenca, compensacao, rateioFixo: c.rateio,
      supervisao: sup.total, frete,
    },
    baseCost, mods, afterModifiers, operational, price, method: "STANDARD", auxiliaries: inp.auxiliaries,
    details: {
      cacambaQty: cac.qty, supervisionDays: sup.days, seedlings: inp.compensation ? seedlings.toNumber() : 0,
      compensationLaw: inp.compensation ? law : null, compensationCity: inp.compensation ? inp.compensationCity?.trim() || null : null,
      mealCost: c.meal.toString(), lodgingCost: c.lodgingDay.toString(),
    },
  });
}
