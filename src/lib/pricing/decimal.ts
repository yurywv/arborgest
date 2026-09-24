/* Aritmética decimal para cálculos financeiros (decimal.js, 34 dígitos significativos).
 *
 * POLÍTICA DE ARREDONDAMENTO
 *  - Todos os cálculos intermediários usam precisão total (sem arredondar), como o Excel.
 *  - Dias estimados: ARREDONDAR.PARA.CIMA (ceil) — regra de negócio da planilha.
 *  - Técnicos por auxiliares, nº de caçambas: ceil.
 *  - Saída: preço final e preço por árvore são arredondados a 2 casas (meio para cima) somente ao final.
 *    Os componentes exibidos são arredondados apenas para exibição; os totais usam os valores completos.
 *  - Totais de orçamento/proposta somam os preços finais JÁ arredondados de cada item (o que o cliente vê soma).
 */
import Decimal from "decimal.js";

// toExpNeg/toExpPos: toString() nunca usa notação exponencial (valores vão para o banco e para a tela).
export const D = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -40, toExpPos: 40 });
export type DecimalT = InstanceType<typeof D>;

export const dec = (v: Decimal.Value | null | undefined) => new D(v === null || v === undefined || v === "" ? 0 : v);
export const ceil = (v: DecimalT) => v.ceil();
export const money = (v: DecimalT) => v.toDecimalPlaces(2, D.ROUND_HALF_UP);
export const s = (v: DecimalT) => v.toString();

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 2 });

export const fmtBRL = (v: Decimal.Value) => brl.format(Number(money(dec(v))) || 0); // "|| 0" evita "-R$ 0,00"
export const fmtN = (v: Decimal.Value) => num.format(Number(dec(v)));
export const fmtPct = (v: Decimal.Value) => pct.format(Number(dec(v)));
