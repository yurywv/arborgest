"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import { dec, fmtBRL } from "@/lib/pricing/decimal";
import { diffParams, paramsSchema } from "@/lib/pricing/params-schema";
import { DIFFICULTIES, DIFFICULTY_LABEL, type Difficulty, type ModifierDef, type PricingParams } from "@/lib/pricing/types";
import { normalizeParams } from "@/lib/pricing/defaults";
import { publishParams } from "./actions";

type Svc = "SUPRESSAO" | "PODA";

const toPct = (f: string) => { try { return dec(f).mul(100).toDecimalPlaces(4).toString().replace(".", ","); } catch { return f; } };
const fromPct = (p: string) => { const t = p.trim().replace(",", "."); if (t === "" || Number.isNaN(Number(t))) return p; return dec(t).div(100).toString(); };
const norm = (v: string) => v.trim().replace(",", ".");

export function ParamsEditor({ initial: rawInitial, versionLabel, v2Validated }: { initial: PricingParams; versionLabel: string; v2Validated: boolean }) {
  const initial = useMemo(() => normalizeParams(rawInitial), [rawInitial]);
  const [p, setP] = useState<PricingParams>(() => structuredClone(initial));
  const [desc, setDesc] = useState("");
  const [v2ok, setV2ok] = useState(false);
  const [v2note, setV2note] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const upd = (fn: (d: PricingParams) => void) => setP((cur) => { const d = structuredClone(cur); fn(d); return d; });
  const changes = useMemo(() => diffParams(initial, p), [initial, p]);
  const validation = useMemo(() => paramsSchema.safeParse(p), [p]);
  const derived = useMemo(() => {
    try {
      const g = p.general;
      return { fixoDia: dec(norm(g.custoFixoMensal)).div(dec(norm(g.diasProdutivosMes))), horaTec: dec(norm(g.tecnicoDia)).div(dec(norm(g.horasDia))), horaAux: dec(norm(g.auxiliarDia)).div(dec(norm(g.horasDia))) };
    } catch { return null; }
  }, [p]);
  const needsV2 = p.engineVersion === "V2_ARBORENT" && initial.engineVersion !== "V2_ARBORENT";

  const submit = () => start(async () => {
    setMsg(null);
    const r = await publishParams(JSON.stringify(p), desc, needsV2 ? { confirmed: v2ok, note: v2note } : null);
    if (r?.ok) { setMsg({ ok: true, text: r.message ?? "Publicado." }); setDesc(""); router.refresh(); }
    else setMsg({ ok: false, text: r?.message ?? "Falha ao publicar." });
  });

  const num = (label: string, value: string, set: (v: string) => void, suffix?: string, hint?: string) => (
    <label className="block">
      <span className="label">{label}</span>
      <span className="relative block">
        <input className={clsx("input", suffix && "pr-14")} inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-stone-400">{suffix}</span>}
      </span>
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
  const money = (k: keyof PricingParams["general"], label: string, suffix = "R$") => num(label, p.general[k], (v) => upd((d) => { d.general[k] = norm(v); }), suffix);
  const pct = (label: string, value: string, set: (frac: string) => void, hint?: string) => num(label, toPct(value), (v) => set(fromPct(v)), "%", hint);

  return (
    <div className="space-y-4">
      <Section title="Motor de cálculo e metodologias" description={`Versão vigente: v${versionLabel}. Toda publicação cria uma nova versão; orçamentos existentes não mudam.`}>
        <fieldset className="sm:col-span-2">
          <legend className="label">Pricing Engine</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {([["V1_LEGACY_EXCEL", "v1 — LEGACY EXCEL", "Reproduz a planilha (validado por testes de paridade com o Excel)."],
               ["V2_ARBORENT", "v2 — ARBORENT PADRONIZADO", "Margem aplicada na poda, mínimo de 1 técnico, todos os fatores multiplicados, compensação fora dos fatores, técnicos da equipe cobrados no inventário."]] as const).map(([v, t, h]) => (
              <label key={v} className="flex cursor-pointer gap-3 rounded-xl border border-stone-200 p-3 has-checked:border-brand-500 has-checked:bg-brand-50">
                <input type="radio" name="engine" className="mt-1 accent-brand-600" checked={p.engineVersion === v} onChange={() => upd((d) => { d.engineVersion = v; })} />
                <span className="text-sm"><b>{t}</b><span className="block text-xs text-stone-600">{h}</span></span>
              </label>
            ))}
          </div>
          {needsV2 && (
            <div className="mt-3 space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p><b>Validação administrativa obrigatória.</b> Revise o comparativo legado × padronizado em <a className="link" href="/admin/precificacao/validacao" target="_blank">Validação da lógica legada</a> antes de ativar o v2. {v2Validated && "(Já houve validação anterior registrada.)"}</p>
              <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 size-4" checked={v2ok} onChange={(e) => setV2ok(e.target.checked)} /> Declaro que analisei o comparativo e aprovo o motor v2.</label>
              <label className="block">
                <span className="label">Resumo da análise do comparativo (mínimo 10 caracteres)</span>
                <textarea className="input" rows={2} value={v2note} onChange={(e) => setV2note(e.target.value)} />
              </label>
            </div>
          )}
        </fieldset>

        <div className="sm:col-span-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-950">
          <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" /> Metodologia de preço da poda — divergência na planilha</p>
          <p className="mt-1">A planilha calcula <code>preço antes do imposto = custo ÷ (1 − margem)</code>, mas o preço final da poda usa <code>custo ÷ (1 − imposto)</code>, <b>ignorando a margem</b> (margem efetiva ≈ 0%). Inventário e supressão aplicam margem e imposto.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {([["LEGACY", "A) Legado da planilha", "preço = custo ÷ (1 − imposto)"], ["STANDARD", "B) Metodologia padronizada", "preço = custo ÷ (1 − margem) ÷ (1 − imposto)"]] as const).map(([v, t, f]) => (
              <label key={v} className="flex cursor-pointer gap-2 rounded-lg border border-orange-200 bg-white p-2.5 has-checked:border-brand-500">
                <input type="radio" name="poda" className="mt-1 accent-brand-600" checked={p.rules.podaPriceMethod === v} onChange={() => upd((d) => { d.rules.podaPriceMethod = v; })} disabled={p.engineVersion === "V2_ARBORENT"} />
                <span><b>{t}</b><span className="block text-xs">{f}</span></span>
              </label>
            ))}
          </div>
          {p.engineVersion === "V2_ARBORENT" && <p className="mt-1 text-xs">No motor v2 a metodologia padronizada é sempre usada.</p>}
        </div>

        <div className="sm:col-span-2 grid gap-4 rounded-xl border border-stone-200 p-3 sm:grid-cols-2">
          {num("Quantidade mínima de técnicos por serviço", String(p.rules.minTecnicos), (v) => upd((d) => { d.rules.minTecnicos = Math.max(0, Math.trunc(Number(v) || 0)); }), "téc.",
            "0 = reproduz a planilha (0 auxiliares ⇒ 0 técnicos e 0 pessoas). 1 ou mais = regra operacional revisada.")}
          {num("Auxiliares por técnico", p.rules.auxiliaresPorTecnico, (v) => upd((d) => { d.rules.auxiliaresPorTecnico = norm(v); }), "aux.", "Técnicos = ⌈auxiliares ÷ este valor⌉ (planilha: 4).")}
        </div>
      </Section>

      <Section title="Parâmetros gerais" description="Configurações › Precificação › Parâmetros Gerais">
        {money("tecnicoDia", "Custo técnico/dia")}
        {money("auxiliarDia", "Custo auxiliar/dia")}
        {money("custoKm", "Custo por km rodado", "R$/km")}
        {money("alimentacaoPessoaDia", "Alimentação por pessoa/dia")}
        {money("hospedagemPessoaDia", "Hospedagem por pessoa/dia")}
        {money("plaquinhaArvore", "Plaquinha + QR Code por árvore")}
        {money("custoFixoMensal", "Custo fixo mensal Arborent")}
        {money("diasProdutivosMes", "Dias produtivos/mês", "dias")}
        {money("combustivelLitro", "Combustível motosserra", "R$/L")}
        {money("cacamba", "Custo caçamba")}
        {money("horasDia", "Horas por dia padrão", "h")}
        {money("supervisaoDia", "Diária do acompanhamento técnico (poda/supressão)")}
        <div className="rounded-xl bg-stone-50 p-3 text-sm sm:col-span-2">
          <b>Calculados automaticamente:</b>{" "}
          {derived ? <>custo fixo/dia {fmtBRL(derived.fixoDia)} · custo hora técnico {fmtBRL(derived.horaTec)} · custo hora auxiliar {fmtBRL(derived.horaAux)}</> : "valores inválidos"}
        </div>
      </Section>

      <Section title="Margem, impostos e aprovação">
        {pct("Imposto", p.general.imposto, (v) => upd((d) => { d.general.imposto = v; }))}
        {pct("Margem desejada (sobre o preço de venda)", p.general.margem, (v) => upd((d) => { d.general.margem = v; }), "Preço = custo ÷ (1 − margem) ÷ (1 − imposto). Não é markup.")}
        {pct("Margem mínima — aprovação pelo comercial", p.approval.margemComercial, (v) => upd((d) => { d.approval.margemComercial = v; }), "Margem efetiva ≥ este valor: o comercial aprova.")}
        {pct("Margem mínima — aprovação gerencial", p.approval.margemGerencial, (v) => upd((d) => { d.approval.margemGerencial = v; }), "Entre este valor e o comercial: gestor. Abaixo: diretoria/administração.")}
        {pct("Desconto que exige confirmação", p.approval.descontoAlerta, (v) => upd((d) => { d.approval.descontoAlerta = v; }))}
        <label className="flex items-center gap-3 self-end rounded-xl border border-stone-200 p-3">
          <input type="checkbox" className="size-5 accent-brand-600" checked={p.approval.fluxoObrigatorio} onChange={(e) => upd((d) => { d.approval.fluxoObrigatorio = e.target.checked; })} />
          <span className="text-sm"><b>Aprovação interna obrigatória</b><span className="block text-xs text-stone-500">Rascunho → aprovação → proposta → cliente</span></span>
        </label>
      </Section>

      <Section title="Produtividade (árvores/dia)" description="Deixe &quot;Muito difícil&quot; em branco para não oferecer o 4º nível no serviço.">
        <div className="overflow-x-auto sm:col-span-2">
          <table className="table">
            <thead><tr><th>Serviço</th>{DIFFICULTIES.map((d) => <th key={d}>{DIFFICULTY_LABEL[d]}</th>)}</tr></thead>
            <tbody>
              {(["INVENTARIO", "SUPRESSAO", "PODA"] as const).map((s) => (
                <tr key={s}>
                  <td className="font-medium">{s === "INVENTARIO" ? "Inventário" : s === "SUPRESSAO" ? "Supressão" : "Poda"}</td>
                  {DIFFICULTIES.map((d) => (
                    <td key={d}>
                      {s === "INVENTARIO" && d === 4 ? <span className="text-stone-400">—</span> : (
                        <input aria-label={`${s} ${DIFFICULTY_LABEL[d]}`} className="input min-h-9 w-24 py-1" inputMode="decimal" value={p.services[s].productivity[d] ?? ""}
                          onChange={(e) => upd((x) => {
                            const v = norm(e.target.value);
                            if (d === 4 && v === "") delete x.services[s].productivity[4];
                            else x.services[s].productivity[d] = v;
                          })} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sm:col-span-2">
          <p className="mb-1 text-sm font-medium">Descrição dos níveis da supressão (altura / local)</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {DIFFICULTIES.filter((d) => p.services.SUPRESSAO.productivity[d]).map((d) => (
              <label key={d} className="block text-xs"><span className="mb-0.5 block text-stone-500">{DIFFICULTY_LABEL[d]}</span>
                <input className="input min-h-9 py-1" value={p.services.SUPRESSAO.difficultyHints?.[d] ?? ""}
                  onChange={(e) => upd((x) => { x.services.SUPRESSAO.difficultyHints = { ...x.services.SUPRESSAO.difficultyHints, [d]: e.target.value }; })} />
              </label>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Supressão — tipos, licenciamento, caçamba e compensação">
        <div className="sm:col-span-2 space-y-2">
          {p.services.SUPRESSAO.serviceTypes!.map((t, i) => (
            <div key={t.code} className="grid grid-cols-[3rem_1fr_auto] items-center gap-2">
              <span className="text-sm text-stone-500">Tipo {t.code}</span>
              <input className="input min-h-9 py-1" value={t.label} onChange={(e) => upd((d) => { d.services.SUPRESSAO.serviceTypes![i].label = e.target.value; })} />
              <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!!t.includesLicense} onChange={(e) => upd((d) => { d.services.SUPRESSAO.serviceTypes![i].includesLicense = e.target.checked; })} /> inclui licença</label>
            </div>
          ))}
        </div>
        <TierTable svc="SUPRESSAO" p={p} upd={upd} />
        {DIFFICULTIES.filter((d) => p.services.SUPRESSAO.productivity[d]).map((d: Difficulty) => num(`Árvores por caçamba — ${DIFFICULTY_LABEL[d]}`, p.services.SUPRESSAO.cacambaArvoresPor?.[d] ?? "10", (v) => upd((x) => { x.services.SUPRESSAO.cacambaArvoresPor = { ...x.services.SUPRESSAO.cacambaArvoresPor, [d]: norm(v) }; }), "árv."))}
        {num("Mudas por árvore suprimida (padrão)", p.services.SUPRESSAO.compensacao!.unidadesPorArvore, (v) => upd((x) => { x.services.SUPRESSAO.compensacao!.unidadesPorArvore = norm(v); }), "un.")}
        {num("Valor por muda", p.services.SUPRESSAO.compensacao!.valorUnidade, (v) => upd((x) => { x.services.SUPRESSAO.compensacao!.valorUnidade = norm(v); }), "R$")}
        {num("Custo fixo da compensação", p.services.SUPRESSAO.compensacao!.custoFixo, (v) => upd((x) => { x.services.SUPRESSAO.compensacao!.custoFixo = norm(v); }), "R$",
          "Compensação = mudas × valor por muda + custo fixo. Mudas = quantidade da lei municipal informada no item ou árvores × mudas por árvore (planilha: 15 × 15 + 400).")}
        {num("Tarifa de frete", p.services.SUPRESSAO.frete!.tarifaTonKm, (v) => upd((x) => { x.services.SUPRESSAO.frete!.tarifaTonKm = norm(v); }), "R$/t·km",
          "Frete calculado = distância × peso (t) × tarifa. O item também aceita o valor do frete por cidade.")}
        {num("Frete mínimo", p.services.SUPRESSAO.frete!.valorMinimo, (v) => upd((x) => { x.services.SUPRESSAO.frete!.valorMinimo = norm(v); }), "R$")}
        {num("Peso médio por muda", p.services.SUPRESSAO.frete!.pesoPorMudaKg, (v) => upd((x) => { x.services.SUPRESSAO.frete!.pesoPorMudaKg = norm(v); }), "kg")}
      </Section>

      <Section title="Poda — tipos, fatores, caçamba e licenciamento">
        <div className="overflow-x-auto sm:col-span-2">
          <table className="table">
            <thead><tr><th>Tipo</th><th>Descrição</th><th>Fator</th><th>Árvores por caçamba</th></tr></thead>
            <tbody>
              {p.services.PODA.serviceTypes!.map((t, i) => (
                <tr key={t.code}>
                  <td>{t.code}</td>
                  <td><input className="input min-h-9 py-1" value={t.label} onChange={(e) => upd((d) => { d.services.PODA.serviceTypes![i].label = e.target.value; })} /></td>
                  <td><input className="input min-h-9 w-24 py-1" inputMode="decimal" value={t.factor} onChange={(e) => upd((d) => { d.services.PODA.serviceTypes![i].factor = norm(e.target.value); })} /></td>
                  <td><input className="input min-h-9 w-24 py-1" inputMode="decimal" value={t.cacambaArvoresPor ?? ""} onChange={(e) => upd((d) => { d.services.PODA.serviceTypes![i].cacambaArvoresPor = norm(e.target.value); })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TierTable svc="PODA" p={p} upd={upd} />
      </Section>

      {(["SUPRESSAO", "PODA"] as Svc[]).map((svc) => <ModifierTable key={svc} svc={svc} p={p} upd={upd} />)}

      <section className="card card-body sticky bottom-[5.75rem] z-10 space-y-3 border-brand-200 md:bottom-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <b>{changes.length ? `${changes.length} alteração(ões) em relação à v${versionLabel}` : "Nenhuma alteração"}</b>
          {!validation.success && <span className="text-red-700">{validation.error.issues[0]?.message}</span>}
        </div>
        {changes.length > 0 && (
          <details className="text-xs"><summary className="cursor-pointer text-stone-600">Ver alterações</summary>
            <ul className="mt-2 max-h-40 space-y-0.5 overflow-auto font-mono">
              {changes.map((c) => <li key={c.path}>{c.path}: <span className="text-red-700 line-through">{JSON.stringify(c.from)}</span> → <span className="text-emerald-700">{JSON.stringify(c.to)}</span></li>)}
            </ul>
          </details>
        )}
        <label className="block">
          <span className="label">Descrição/motivo da nova versão <span className="text-red-600">*</span></span>
          <input className="input" autoComplete="off" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </label>
        {msg && <p role="alert" className={clsx("rounded-lg px-3 py-2 text-sm", msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800")}>{msg.text}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" disabled={pending || !changes.length || !validation.success || desc.trim().length < 5} onClick={submit}>
            {pending && <Loader2 className="size-4 animate-spin" />} Publicar nova versão
          </button>
          <button type="button" className="btn btn-secondary" disabled={!changes.length} onClick={() => setP(structuredClone(initial))}>Descartar alterações</button>
        </div>
      </section>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="card card-body">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-stone-500">{description}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function TierTable({ svc, p, upd }: { svc: Svc; p: PricingParams; upd: (fn: (d: PricingParams) => void) => void }) {
  const tiers = p.services[svc].licenseTiers!;
  return (
    <div className="overflow-x-auto sm:col-span-2">
      <p className="mb-1 text-sm font-medium">Licenciamento — custo = árvores ÷ divisor × custo hora técnico × horas</p>
      <table className="table">
        <thead><tr><th>De (árvores)</th><th>Até</th><th>Divisor</th><th>Horas</th><th /></tr></thead>
        <tbody>
          {tiers.map((t, i) => (
            <tr key={i}>
              <td><input className="input min-h-9 w-20 py-1" inputMode="numeric" value={t.minTrees} onChange={(e) => upd((d) => { d.services[svc].licenseTiers![i].minTrees = Number(e.target.value) || 0; })} /></td>
              <td><input className="input min-h-9 w-20 py-1" inputMode="numeric" value={t.maxTrees ?? ""} onChange={(e) => upd((d) => { d.services[svc].licenseTiers![i].maxTrees = e.target.value === "" ? null : Number(e.target.value); })} /></td>
              <td><input className="input min-h-9 w-20 py-1" inputMode="decimal" value={t.divisor} onChange={(e) => upd((d) => { d.services[svc].licenseTiers![i].divisor = norm(e.target.value); })} /></td>
              <td><input className="input min-h-9 w-20 py-1" inputMode="decimal" value={t.hours} onChange={(e) => upd((d) => { d.services[svc].licenseTiers![i].hours = norm(e.target.value); })} /></td>
              <td>{tiers.length > 1 && <button type="button" aria-label="Remover faixa" className="btn btn-ghost btn-sm" onClick={() => upd((d) => { d.services[svc].licenseTiers!.splice(i, 1); })}><Trash2 className="size-3.5" /></button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn btn-ghost btn-sm mt-1" onClick={() => upd((d) => { d.services[svc].licenseTiers!.push({ minTrees: 0, maxTrees: null, divisor: "10", hours: "8" }); })}><Plus className="size-3.5" /> Faixa</button>
    </div>
  );
}

function ModifierTable({ svc, p, upd }: { svc: Svc; p: PricingParams; upd: (fn: (d: PricingParams) => void) => void }) {
  const mods = p.services[svc].modifiers!;
  const set = (i: number, patch: Partial<ModifierDef>) => upd((d) => { Object.assign(d.services[svc].modifiers![i], patch); });
  return (
    <section className="card card-body">
      <h2 className="text-base font-semibold">Modificadores — {svc === "SUPRESSAO" ? "Supressão" : "Poda"}</h2>
      <p className="mt-0.5 text-sm text-stone-500">Os fatores ligados são <b>multiplicados</b> (não somados). &quot;Na planilha&quot; indica se o motor v1 inclui o fator no produto — a planilha não multiplica &quot;rede elétrica&quot;.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="table">
          <thead><tr><th>Ordem</th><th>Descrição</th><th>Fator</th><th>+ dias</th><th>Ativo</th><th>Na planilha</th><th>Código</th></tr></thead>
          <tbody>
            {mods.map((m, i) => (
              <tr key={m.key + i}>
                <td><input className="input min-h-9 w-16 py-1" inputMode="numeric" value={m.order} onChange={(e) => set(i, { order: Number(e.target.value) || 0 })} /></td>
                <td><input className="input min-h-9 min-w-56 py-1" value={m.label} onChange={(e) => set(i, { label: e.target.value })} /></td>
                <td><input className="input min-h-9 w-24 py-1" inputMode="decimal" value={m.factor} onChange={(e) => set(i, { factor: norm(e.target.value) })} /></td>
                <td><input className="input min-h-9 w-16 py-1" inputMode="numeric" value={m.addsDays} onChange={(e) => set(i, { addsDays: Number(e.target.value) || 0 })} /></td>
                <td><input type="checkbox" className="size-5 accent-brand-600" checked={m.active} onChange={(e) => set(i, { active: e.target.checked })} aria-label="Ativo" /></td>
                <td><input type="checkbox" className="size-5 accent-brand-600" checked={m.legacyInProduct} onChange={(e) => set(i, { legacyInProduct: e.target.checked })} aria-label="Incluído no produto (motor v1)" /></td>
                <td className="font-mono text-xs">{m.key}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn btn-ghost btn-sm mt-2 self-start"
        onClick={() => upd((d) => { const n = d.services[svc].modifiers!.length + 1; d.services[svc].modifiers!.push({ key: `NOVO_${n}`, label: "Novo modificador", factor: "1.00", active: true, order: n, addsDays: 0, legacyInProduct: true }); })}>
        <Plus className="size-3.5" /> Modificador
      </button>
    </section>
  );
}
