import { CheckCircle2, XCircle } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { fmtBRL, fmtPct } from "@/lib/pricing/decimal";
import { REPORT_META, comparisonRows, fmtDiff, legacyFindings, parityRows } from "@/lib/pricing/legacy-report";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Validação da lógica legada de precificação" };

export default async function LegacyValidationPage() {
  await requirePermission("pricing:params");
  const parity = parityRows();
  const passed = parity.filter((r) => r.ok).length;
  const findings = legacyFindings();
  const comparison = comparisonRows();
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader back={{ href: "/admin/precificacao", label: "Parâmetros de precificação" }} title="Validação da lógica legada de precificação"
        subtitle="Relatório técnico da migração da planilha para o Pricing Engine v1 — LEGACY EXCEL" />

      <Card title="1. Base da validação">
        <ul className="space-y-1 text-sm">
          <li>Planilha: <b>{REPORT_META.source}</b> <span className="font-mono text-xs break-all text-stone-500">SHA-256 {REPORT_META.sha256}</span></li>
          <li>Resultados de referência calculados pelo próprio <b>Microsoft Excel {REPORT_META.excelVersion}</b> em {fmtDateTime(REPORT_META.generatedAt)} (script <code>npm run pricing:parity</code>).</li>
          <li>Tolerância financeira: R$ 0,01 por componente; dias, pessoas e fatores: exatos.</li>
          <li className="flex items-center gap-2">Resultado: {passed === parity.length ? <Badge tone="green">{passed}/{parity.length} cenários idênticos ao Excel</Badge> : <Badge tone="red">{passed}/{parity.length} cenários</Badge>}</li>
        </ul>
      </Card>

      <Card title="2. Paridade por cenário (motor v1 × Excel)" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Cenário</th><th>Descrição</th><th className="text-right">Preço Excel</th><th className="text-right">Preço sistema</th><th className="text-right">Maior dif.</th><th /></tr></thead>
            <tbody>
              {parity.map((r) => (
                <tr key={r.scenario.id}>
                  <td className="font-mono text-xs">{r.scenario.id}</td>
                  <td className="text-xs">{r.scenario.title}<div className="text-stone-500">{r.checks.length} valores conferidos</div></td>
                  <td className="text-right tabular-nums">{fmtBRL(r.excelPrice)}</td>
                  <td className="text-right tabular-nums">{fmtBRL(r.enginePrice)}</td>
                  <td className="text-right text-xs tabular-nums">{fmtDiff(r.maxDiff)}</td>
                  <td>{r.ok ? <CheckCircle2 className="size-5 text-emerald-600" aria-label="ok" /> : <XCircle className="size-5 text-red-600" aria-label="divergente" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="3. Divergências e regras da planilha (não alteradas sem registro)">
        <ol className="space-y-5">
          {findings.map((f) => (
            <li key={f.n}>
              <h3 className="font-semibold">{f.n}. {f.title}</h3>
              <dl className="mt-1 grid gap-1.5 text-sm">
                <div><dt className="inline font-medium text-stone-600">Evidência: </dt><dd className="inline">{f.evidence}</dd></div>
                <div><dt className="inline font-medium text-stone-600">Impacto: </dt><dd className="inline">{f.impact}</dd></div>
                <div><dt className="inline font-medium text-stone-600">Tratamento no sistema: </dt><dd className="inline">{f.treatment}</dd></div>
                <div><dt className="inline font-medium text-stone-600">Recomendação: </dt><dd className="inline">{f.recommendation}</dd></div>
              </dl>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="4. Preço legado × preço revisado (motor v1 × motor v2)" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Cenário</th><th className="text-right">v1 legado</th><th className="text-right">Margem v1</th><th className="text-right">v2 padronizado</th><th className="text-right">Margem v2</th><th className="text-right">Diferença</th></tr></thead>
            <tbody>
              {comparison.map((c) => (
                <tr key={c.scenario.id}>
                  <td className="text-xs"><span className="font-mono">{c.scenario.id}</span> {c.scenario.title}</td>
                  <td className="text-right tabular-nums">{fmtBRL(c.v1.finalPriceRounded)}</td>
                  <td className="text-right text-xs tabular-nums">{fmtPct(c.v1.effectiveMargin)}</td>
                  <td className="text-right tabular-nums">{fmtBRL(c.v2.finalPriceRounded)}</td>
                  <td className="text-right text-xs tabular-nums">{fmtPct(c.v2.effectiveMargin)}</td>
                  <td className="text-right tabular-nums">{c.diff === 0 ? "—" : `${fmtBRL(c.diff)} (${fmtPct(c.diffPct)})`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="p-4 text-xs text-stone-500">O motor v2 só pode ser ativado após validação administrativa registrada (Parâmetros › Pricing Engine). Até lá, a versão vigente reproduz a planilha.</p>
      </Card>

      <Card title="5. Precisão e arredondamentos">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Cálculos em <b>Decimal</b> (decimal.js, 34 dígitos) — nenhum float JavaScript em valores monetários.</li>
          <li>Arredondamento para cima (⌈⌉) apenas onde a planilha usa ARREDONDAR.PARA.CIMA: dias, técnicos por auxiliares e nº de caçambas.</li>
          <li>Preço final e preço por árvore arredondados a centavos (meio para cima) somente no final; componentes intermediários sem arredondamento, como no Excel.</li>
          <li>Banco de dados: valores monetários em <code>Decimal(14,2)</code>, fatores e margens em <code>Decimal(10,6)</code>; o snapshot JSON guarda os valores com precisão total.</li>
          <li>Totais do orçamento e da proposta somam os preços dos itens já arredondados (o cliente vê a soma exata). Margens de aprovação comparadas com 0,01% de precisão.</li>
        </ul>
      </Card>

      <Card title="6. Arquitetura e imutabilidade">
        <div id="arquitetura" className="space-y-2 text-sm">
          <p>Cada alteração de parâmetros cria uma nova <b>versão</b> (PricingParameterVersion) com snapshot imutável; cada orçamento guarda a versão usada e cada cálculo salvo guarda um <b>snapshot JSON</b> (entradas, parâmetros, regras, fatores, resultados, usuário, data, versão, hash SHA-256). A tela do cálculo reconstrói o resultado a partir do snapshot e confere a integridade.</p>
          <p>Novos serviços (plantio, transplante, avaliação de risco, laudos…) são módulos em <code>src/lib/pricing/services</code> registrados em <code>src/lib/pricing/registry.ts</code>; orçamentos, propostas, PDF, auditoria e indicadores são genéricos.</p>
          <p>O simulador recalcula no navegador a cada alteração; o servidor repete o cálculo ao salvar e só o valor do servidor é gravado.</p>
        </div>
      </Card>
    </div>
  );
}
