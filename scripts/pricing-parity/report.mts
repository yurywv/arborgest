/* Gera docs/precificacao/validacao-logica-legada.md a partir do motor e dos resultados do Excel.
 * Uso: npx tsx scripts/pricing-parity/report.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPORT_META, comparisonRows, fmtDiff, legacyFindings, parityRows } from "../../src/lib/pricing/legacy-report";
import { fmtBRL, fmtPct } from "../../src/lib/pricing/decimal";

const parity = parityRows();
const ok = parity.filter((r) => r.ok).length;
const lines: string[] = [
  "# Validação da lógica legada de precificação",
  "",
  "Relatório técnico da migração da planilha **" + REPORT_META.source + "** para o *Pricing Engine v1 — LEGACY EXCEL*.",
  "Gerado por `npx tsx scripts/pricing-parity/report.mts`. A mesma análise está no sistema em *Administração › Parâmetros de preço › Validação da lógica legada*.",
  "",
  "## 1. Base da validação",
  "",
  `- Planilha: \`${REPORT_META.source}\` — SHA-256 \`${REPORT_META.sha256}\``,
  `- Resultados de referência calculados pelo próprio Microsoft Excel ${REPORT_META.excelVersion} em ${REPORT_META.generatedAt} (\`npm run pricing:parity\`, que preenche os inputs via AppleScript, recalcula e lê as células).`,
  "- Tolerância financeira: R$ 0,01 por componente; dias, pessoas e fatores exatos.",
  `- **Resultado: ${ok}/${parity.length} cenários idênticos ao Excel** (teste automatizado \`src/lib/pricing/__tests__/parity.test.ts\`).`,
  "",
  "## 2. Paridade por cenário",
  "",
  "| Cenário | Descrição | Valores conferidos | Preço Excel | Preço sistema | Maior diferença | OK |",
  "|---|---|---:|---:|---:|---:|:-:|",
  ...parity.map((r) => `| ${r.scenario.id} | ${r.scenario.title} | ${r.checks.length} | ${fmtBRL(r.excelPrice)} | ${fmtBRL(r.enginePrice)} | ${fmtDiff(r.maxDiff)} | ${r.ok ? "✅" : "❌"} |`),
  "",
  "## 3. Divergências e regras da planilha",
  "",
  "Nenhuma destas regras foi alterada silenciosamente: o motor v1 as reproduz e cada uma tem parâmetro/opção registrada na versão de parâmetros.",
  "",
  ...legacyFindings().flatMap((f) => [
    `### ${f.n}. ${f.title}`, "",
    `- **Evidência:** ${f.evidence}`, `- **Impacto:** ${f.impact}`, `- **Tratamento no sistema:** ${f.treatment}`, `- **Recomendação:** ${f.recommendation}`, "",
  ]),
  "## 4. Preço legado × preço revisado",
  "",
  "| Cenário | v1 legado | Margem v1 | v2 padronizado | Margem v2 | Diferença |",
  "|---|---:|---:|---:|---:|---:|",
  ...comparisonRows().map((c) => `| ${c.scenario.id} — ${c.scenario.title} | ${fmtBRL(c.v1.finalPriceRounded)} | ${fmtPct(c.v1.effectiveMargin)} | ${fmtBRL(c.v2.finalPriceRounded)} | ${fmtPct(c.v2.effectiveMargin)} | ${c.diff === 0 ? "—" : `${fmtBRL(c.diff)} (${fmtPct(c.diffPct)})`} |`),
  "",
  "Motor v2 (Arborent padronizado): metodologia padronizada na poda; mínimo de 1 técnico; todos os modificadores ligados multiplicados; compensação ambiental fora dos fatores operacionais; inventário cobra os técnicos da equipe. Ativação apenas após validação administrativa registrada.",
  "",
  "## 5. Precisão e arredondamentos",
  "",
  "- Cálculos em Decimal (decimal.js, 34 dígitos); nenhum float JavaScript em valores monetários.",
  "- ⌈⌉ apenas onde a planilha usa ARREDONDAR.PARA.CIMA: dias, técnicos por auxiliares e nº de caçambas.",
  "- Preço final e preço por árvore arredondados a centavos (meio para cima) somente no fim; intermediários com precisão total.",
  "- Banco: dinheiro em `Decimal(14,2)`, fatores/margens em `Decimal(10,6)`; snapshot JSON com precisão total.",
  "- Totais de orçamento/proposta somam os preços de itens já arredondados; alçadas de margem comparadas com precisão de 0,01%.",
  "",
];
const dest = path.join(import.meta.dirname, "../../docs/precificacao/validacao-logica-legada.md");
mkdirSync(path.dirname(dest), { recursive: true });
writeFileSync(dest, lines.join("\n"));
console.log(`✓ ${path.relative(process.cwd(), dest)} (${ok}/${parity.length} cenários ok)`);
