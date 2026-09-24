/* Relatório técnico "Validação da lógica legada de precificação".
 * Gera os dados (paridade com o Excel, divergências com exemplos numéricos, comparativo v1 × v2) a partir
 * do próprio motor — usado pela página /admin/precificacao/validacao e por scripts/pricing-parity/report.mts.
 */
import excel from "./parity/excel-results.json";
import { SCENARIOS, type Scenario } from "./parity/scenarios";
import { LEGACY_EXCEL_PARAMS, toV2 } from "./defaults";
import { calculate } from "./registry";
import { fmtBRL, fmtPct } from "./decimal";
import type { CalcResult, PricingParams } from "./types";

type Expected = Record<string, number>;
const EXACT = new Set(["days", "persons", "modifiersFactor", "serviceTypeFactor"]);

function value(r: CalcResult, key: string) {
  return key in r.costs ? Number(r.costs[key]) : Number((r as unknown as Record<string, unknown>)[key]);
}

export function parityRows(params: PricingParams = LEGACY_EXCEL_PARAMS) {
  return SCENARIOS.map((sc) => {
    const expected = (excel.results as Record<string, Expected>)[sc.id];
    const r = calculate(sc.service, sc.inputs, params).result;
    const checks = Object.entries(expected).map(([k, want]) => {
      const got = value(r, k);
      const diff = Math.abs(got - want);
      return { key: k, excel: want, engine: got, diff, ok: diff <= (EXACT.has(k) ? 1e-9 : 0.01) };
    });
    return { scenario: sc, checks, ok: checks.every((c) => c.ok), maxDiff: Math.max(...checks.filter((c) => !EXACT.has(c.key)).map((c) => c.diff)), excelPrice: expected.finalPrice, enginePrice: Number(r.finalPrice) };
  });
}

const run = (sc: Scenario, p: PricingParams = LEGACY_EXCEL_PARAMS) => calculate(sc.service, sc.inputs, p).result;
const byId = (id: string) => SCENARIOS.find((s) => s.id === id)!;

export function comparisonRows() {
  return SCENARIOS.map((sc) => {
    const v1 = run(sc);
    const v2 = run(sc, toV2(LEGACY_EXCEL_PARAMS));
    const a = Number(v1.finalPriceRounded), b = Number(v2.finalPriceRounded);
    return { scenario: sc, v1, v2, diff: b - a, diffPct: a ? (b - a) / a : 0 };
  });
}

export type Finding = { n: number; title: string; evidence: string; impact: string; treatment: string; recommendation: string };

export function legacyFindings(): Finding[] {
  const p3 = run(byId("POD-3"));
  const p3std = run(byId("POD-3"), { ...LEGACY_EXCEL_PARAMS, rules: { ...LEGACY_EXCEL_PARAMS.rules, podaPriceMethod: "STANDARD" } });
  const s6 = run(byId("SUP-6"));
  const s6min = run(byId("SUP-6"), { ...LEGACY_EXCEL_PARAMS, rules: { ...LEGACY_EXCEL_PARAMS.rules, minTecnicos: 1 } });
  const i3 = run(byId("INV-3"));
  const sup1 = calculate("SUPRESSAO", { ...byId("SUP-1").inputs, modifiers: ["REDE_ELETRICA"] }, LEGACY_EXCEL_PARAMS).result;
  const sup1b = run(byId("SUP-1"));
  const s4 = run(byId("SUP-4"));
  const s4v2 = run(byId("SUP-4"), toV2(LEGACY_EXCEL_PARAMS));
  const d1 = calculate("SUPRESSAO", { ...byId("SUP-3").inputs, trees: 1 }, LEGACY_EXCEL_PARAMS).result;

  return [
    {
      n: 1, title: "Divergência na aplicação da margem da Poda",
      evidence: "PODA_V0!B36 = B34/(1−margem) (preço antes do imposto), mas PODA_V0!B37 = B34/(1−imposto) — usa o custo operacional (B34) e não B36. Em INVENTARIO_V0!B23 e SUPRESSAO_V0!B37 o preço final é B22/B36 ÷ (1−imposto).",
      impact: `A margem de 35% não é aplicada na poda: margem efetiva ≈ ${fmtPct(p3.effectiveMargin)}. Cenário POD-3 (48 árvores): legado ${fmtBRL(p3.finalPriceRounded)} × padronizado ${fmtBRL(p3std.finalPriceRounded)} (${fmtPct((Number(p3std.finalPrice) - Number(p3.finalPrice)) / Number(p3.finalPrice))} a mais).`,
      treatment: "Regra configurável \"Metodologia de preço da poda\": A) LEGADO DA PLANILHA (padrão da versão 1.0, para paridade) ou B) METODOLOGIA PADRONIZADA. A escolha é gravada em cada versão de parâmetros; a tela avisa quando o legado está ativo e o orçamento exige alçada de diretoria (margem < 25%).",
      recommendation: "Adotar B) após validação comercial. O motor v2 usa sempre a metodologia padronizada.",
    },
    {
      n: 2, title: "Possibilidade de zero técnicos quando auxiliares = 0",
      evidence: "SUPRESSAO_V0!B17 e PODA_V0!B17 = dias × técnico/dia × ROUNDUP(auxiliares/4). Com B5 = 0, ROUNDUP(0/4) = 0.",
      impact: `Cenário SUP-6 (5 árvores, 0 auxiliares): custo técnico ${fmtBRL(s6.costs.tecnico)} e preço ${fmtBRL(s6.finalPriceRounded)}. Com mínimo de 1 técnico: ${fmtBRL(s6min.finalPriceRounded)}.`,
      treatment: "Parâmetro \"Quantidade mínima de técnicos por serviço\" (0 = reproduz a planilha; ≥ 1 = regra revisada), gravado na versão. Com 0, o simulador exige confirmação explícita quando a equipe resulta em 0 técnicos.",
      recommendation: "Definir mínimo = 1 (motor v2 impõe no mínimo 1).",
    },
    {
      n: 3, title: "Possibilidade de número total de pessoas = 0",
      evidence: "Nº de pessoas = B5 + ROUNDUP(B5/4) nas três abas (INVENTARIO_V0!B9, SUPRESSAO_V0!B15, PODA_V0!B15). No inventário, porém, o custo técnico (B12) cobra sempre 1 técnico, que não é contado como pessoa.",
      impact: `Cenário INV-3 (100 árvores, 0 auxiliares, 40 km): ${i3.persons} pessoas — deslocamento ${fmtBRL(i3.costs.deslocamento)} e alimentação ${fmtBRL(i3.costs.alimentacao)}, embora o técnico seja cobrado (${fmtBRL(i3.costs.tecnico)}). Mesmo com auxiliares, o técnico do inventário só entra como pessoa pela fórmula ⌈aux/4⌉.`,
      treatment: "Reproduzido no motor v1; aviso com confirmação obrigatória quando pessoas = 0. O mínimo de técnicos (item 2) também corrige a contagem de pessoas.",
      recommendation: "Motor v2: pessoas = técnicos (mínimo 1) + auxiliares, e o inventário cobra os técnicos da equipe.",
    },
    {
      n: 4, title: "Uso da proximidade de rede elétrica para adicionar um dia",
      evidence: "SUPRESSAO_V0!B14 e PODA_V0!B14 = ROUNDUP(árvores/produtividade) + IF(rede elétrica = 1; 1; 0). O fator do modificador é 1,00.",
      impact: `Cenário SUP-1 (12 árvores): ${sup1b.days} dia(s) → ${sup1.days} com rede elétrica; preço ${fmtBRL(sup1b.finalPriceRounded)} → ${fmtBRL(sup1.finalPriceRounded)}. O dia extra é somado sem produtividade e também aumenta rateio fixo, alimentação e deslocamento.`,
      treatment: "Preservado: o modificador tem o comportamento adicional \"+1 dia\" (campo configurável \"dias extras\" em cada modificador), independente do fator.",
      recommendation: "Manter o dia extra como parâmetro explícito; avaliar se deve ser por operação ou proporcional ao nº de árvores próximas à rede.",
    },
    {
      n: 5, title: "Modificadores cadastrados que não participam da multiplicação final",
      evidence: "SUPRESSAO_V0!B31 = PRODUCT(IF(E17…), IF(E19…), IF(E21…), IF(E22…), IF(E23…), IF(E24…), IF(E20…)) — omite E18 (rede elétrica). PODA_V0!B30 omite E17 (rede elétrica). Todos os demais 7 modificadores de cada aba participam.",
      impact: "Com o fator atual (1,00) não há efeito. Se o fator de rede elétrica for alterado na planilha, a mudança seria ignorada silenciosamente.",
      treatment: "Cada modificador tem a marcação \"Na planilha\" (participa do produto no motor v1). Rede elétrica está desmarcada, reproduzindo a planilha; se seu fator ≠ 1, o motor v1 exibe aviso de fator ignorado. O motor v2 multiplica todos os modificadores ligados.",
      recommendation: "Usar o motor v2 ou marcar \"Na planilha\" caso se queira aplicar um fator à rede elétrica.",
    },
    {
      n: 6, title: "Diferenças de metodologia entre Inventário, Poda e Supressão",
      evidence: [
        "Inventário: 1 técnico fixo no custo (B12 sem ⌈aux/4⌉), sem modificadores, sem combustível/caçamba/licença, com plaquetas + QR Code.",
        "Supressão: técnicos = ⌈aux/4⌉; licenciamento em 3 faixas (1–5 ÷5×4 h; 6–9 ÷9×6 h; ≥10 ÷10×8 h) só no tipo 1; caçamba ⌈n/20⌉ (fácil) ou ⌈n/10⌉ (média/difícil); compensação ambiental DENTRO do custo base (B30 = SUM(B17:B22)+B28), portanto multiplicada pelos modificadores.",
        "Poda: licenciamento em 2 faixas (<10 ÷5×4 h; ≥10 ÷10×8 h) por opção; caçamba pelo tipo de poda (÷100 só limpeza; ÷50 demais); fator do tipo de poda (1,07/1,00/1,05); preço sem margem (item 1).",
        "Caçamba, rateio fixo e licenciamento não são afetados pelos modificadores nas duas abas.",
      ].join(" "),
      impact: `Cenário SUP-4 (todos os modificadores, com compensação): v1 ${fmtBRL(s4.finalPriceRounded)} × v2 ${fmtBRL(s4v2.finalPriceRounded)} — no v2 a compensação (valor regulatório) não é multiplicada pelos fatores operacionais e os técnicos têm mínimo 1.`,
      treatment: "Cada serviço é um módulo próprio do Pricing Engine que reproduz exatamente sua aba; as diferenças ficam documentadas na memória de cálculo de cada item.",
      recommendation: "Harmonizar no motor v2: compensação fora dos fatores; técnicos da equipe cobrados em todos os serviços.",
    },
    {
      n: 7, title: "Observações adicionais (sem alteração no motor v1)",
      evidence: "Deslocamento = (km × custo/km + pedágio) × dias × PESSOAS — distância e pedágio são cobrados por pessoa, não por veículo. Produtividade difícil 0,33 árvore/dia gera ⌈1/0,33⌉ = 4 dias para 1 árvore (1/0,33 = 3,03). Rótulo \"Material úmido/seco (1=úmido, 0=seco)\".",
      impact: `Supressão difícil de 1 árvore: ${d1.days} dias. Deslocamento com 4 pessoas custa 4× o de 1 veículo.`,
      treatment: "Reproduzido fielmente no v1 e v2 (sem mudança silenciosa).",
      recommendation: "Revisar com a operação: custo de deslocamento por veículo e produtividade difícil = 1/3 (0,3333…).",
    },
  ];
}

export const REPORT_META = { source: excel.source, sha256: excel.sourceSha256, excelVersion: excel.excelVersion, generatedAt: excel.generatedAt };

export const fmtDiff = (d: number) => (d < 1e-6 ? "< R$ 0,000001" : `R$ ${d.toFixed(6).replace(".", ",")}`);
