"use client";

/* Simulador de precificação — recalcula a cada alteração no navegador (mesmo motor do servidor).
 * Ao salvar, o servidor refaz o cálculo com a versão de parâmetros do orçamento; o valor do navegador
 * serve apenas de prévia.
 */
import { useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { AlertTriangle, Calculator, ChevronDown, Loader2, Save, TreePine, Zap } from "lucide-react";
import { SERVICES, calculate, type FieldDef } from "@/lib/pricing/registry";
import { fmtBRL, fmtN, fmtPct } from "@/lib/pricing/decimal";
import { toPureLegacy, toV2 } from "@/lib/pricing/defaults";
import { adjustedItemPrice } from "@/lib/pricing/policy";
import type { CalcResult, Difficulty, PricingParams, ServiceCode } from "@/lib/pricing/types";
import { DIFFICULTIES, DIFFICULTY_LABEL } from "@/lib/pricing/types";
import { TreePicker, type PickerTree } from "./tree-picker";

type Values = Record<string, string | boolean | string[]>;

function toValues(inputs: Record<string, unknown>): Values {
  return Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, v === null || v === undefined ? "" : typeof v === "number" ? String(v) : (v as string | boolean | string[])]));
}
/** Formulário vazio: nenhum conteúdo sugerido (caixas desmarcadas, demais campos em branco). */
function emptyValues(service: ServiceCode): Values {
  return Object.fromEntries(SERVICES[service].fields
    .filter((f) => f.kind !== "compensationRule")
    .map((f) => [f.key, f.kind === "bool" ? false : f.kind === "modifiers" ? [] : ""]));
}

const isVisible = (f: FieldDef, v: Values) => !f.showIf || v[f.showIf.key] === f.showIf.equals || String(v[f.showIf.key]) === String(f.showIf.equals);

/** Campos obrigatórios ainda não preenchidos (o preço só é calculado quando todos estiverem informados). */
function missingFields(service: ServiceCode, v: Values) {
  return SERVICES[service].fields
    .filter((f) => !f.optional && isVisible(f, v) && ["int", "decimal", "money", "difficulty", "serviceType", "yesno"].includes(f.kind))
    .filter((f) => v[f.key] === "" || v[f.key] === undefined || v[f.key] === null)
    .map((f) => f.label.replace(/\?$/, ""));
}

/** Converte o formulário em entradas do motor. Campos numéricos opcionais vazios viram null (= padrão dos parâmetros). */
function toInputs(v: Values, service: ServiceCode): Record<string, unknown> {
  const fields = new Map(SERVICES[service].fields.map((f) => [f.key, f]));
  // Aceita "12,5", "1.234,50" e "12.5".
  const num = (x: string, optional: boolean) => {
    const t = x.trim();
    if (t === "") return optional ? null : undefined;
    return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  };
  return Object.fromEntries(Object.entries(v).map(([k, x]) => {
    const f = fields.get(k);
    if (typeof x !== "string" || !f) return [k, x];
    if (f.kind === "text") return [k, x.trim() === "" ? null : x];
    if (f.kind === "select") return [k, x === "" ? "NONE" : x];
    if (f.kind === "yesno") return [k, undefined];
    return [k, num(x, !!f.optional)];
  }));
}

function tryCalc(service: ServiceCode | "", values: Values, params: PricingParams): { result?: CalcResult; error?: string } {
  if (!service) return { error: "Selecione o serviço." };
  const missing = missingFields(service, values);
  if (missing.length) return { error: `Preencha: ${missing.join(", ")}.` };
  try {
    return { result: calculate(service, toInputs(values, service), params).result };
  } catch (e) {
    const issues = (e as { issues?: { message: string }[] }).issues;
    return { error: issues?.[0]?.message ?? (e as Error).message };
  }
}

export type SimulatorProps = {
  params: PricingParams;
  versionLabel: string;
  services: ServiceCode[]; // serviços ativos
  service?: ServiceCode;
  lockService?: boolean;
  initialInputs?: Record<string, unknown>;
  description?: string | null;
  canSeeCosts: boolean;
  showComparison?: boolean;
  trees?: PickerTree[];
  initialTreeIds?: string[];
  onSave?: (payload: { service: ServiceCode; inputs: Record<string, unknown>; description: string; treeIds: string[]; confirmWarnings: boolean; clientPrice: string }) => Promise<{ ok: boolean; message?: string } | null | void>;
  saveLabel?: string;
  /** Margem de lucro definida no orçamento (fração) — mostra o preço que irá para a proposta. */
  estimateMargin?: string | null;
  /** Leis municipais de compensação ambiental cadastradas. */
  compensationRules?: CompensationRuleOption[];
};

export type CompensationRuleOption = { id: string; city: string; state: string; lawReference: string; seedlingsPerTree: string; freightValue: string | null };

export function PricingSimulator(props: SimulatorProps) {
  const { params, canSeeCosts } = props;
  const [service, setService] = useState<ServiceCode | "">(props.service ?? "");
  const [values, setValues] = useState<Values>(() => (props.service ? { ...emptyValues(props.service), ...toValues(props.initialInputs ?? {}) } : {}));
  const [description, setDescription] = useState(props.description ?? "");
  const [treeIds, setTreeIds] = useState<string[]>(props.initialTreeIds ?? []);
  const [useTrees, setUseTrees] = useState((props.initialTreeIds?.length ?? 0) > 0);
  const [showMemory, setShowMemory] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [serverMsg, setServerMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const def = service ? SERVICES[service] : null;
  const effective: Values = useMemo(() => (useTrees ? { ...values, trees: String(treeIds.length) } : values), [useTrees, values, treeIds]);
  const { result, error } = useMemo(() => tryCalc(service, effective, params), [service, effective, params]);
  const comparison = useMemo(() => {
    if (!props.showComparison) return null;
    const legacy = tryCalc(service, effective, toPureLegacy(params)).result;
    const v2 = tryCalc(service, effective, toV2(params)).result;
    return legacy && v2 ? { legacy, v2 } : null;
  }, [props.showComparison, service, effective, params]);

  const set = (k: string, v: string | boolean | string[]) => {
    setValues((s) => ({ ...s, [k]: v }));
    setServerMsg(null);
  };
  const changeService = (s: ServiceCode | "") => {
    setService(s);
    if (!s) return;
    // Mantém apenas o que o usuário já digitou e existe no novo serviço (dificuldade e tipo têm outro significado).
    setValues((cur) => {
      const empty = emptyValues(s);
      const keep = Object.fromEntries(Object.entries(cur).filter(([k]) => k in empty && !["difficulty", "serviceType"].includes(k)));
      return { ...empty, ...keep };
    });
  };

  const confirmWarnings = result?.warnings.filter((w) => w.level === "confirm") ?? [];
  const sections: { key: FieldDef["section"]; title: string }[] = [
    { key: "QUANTIDADE", title: "Quantidade" },
    { key: "LOGISTICA", title: "Logística" },
    { key: "REGIONAL", title: "Valores regionais" },
    { key: "OPERACAO", title: "Operação" },
    { key: "SERVICO", title: def?.name ?? "" },
    { key: "COMPENSACAO", title: "Compensação ambiental" },
    { key: "FRETE", title: "Frete (mudas e materiais)" },
    { key: "ACOMPANHAMENTO", title: "Acompanhamento técnico" },
    { key: "MODIFICADORES", title: "Modificadores" },
  ];
  const visible = (f: FieldDef) => isVisible(f, values);
  /** Lei municipal escolhida: preenche município, citação, mudas (árvores × mudas/árvore) e frete da cidade. */
  const applyRule = (id: string) => {
    const r = props.compensationRules?.find((x) => x.id === id);
    if (!r) return;
    const trees = Number(effective.trees) || 0;
    setValues((cur) => ({
      ...cur,
      compensationCity: `${r.city}/${r.state}`,
      compensationLaw: r.lawReference,
      seedlings: String(Math.ceil(trees * Number(r.seedlingsPerTree))),
      ...(r.freightValue && (cur.freightMode === "NONE" || !cur.freightMode) ? { freightMode: "FIXED", freightValue: r.freightValue } : {}),
    }));
  };

  async function save() {
    if (!props.onSave || !result || !service) return;
    const svc = service;
    start(async () => {
      const r = await props.onSave!({
        service: svc, inputs: toInputs(effective, svc), description, treeIds: useTrees ? treeIds : [], confirmWarnings: confirm, clientPrice: result.finalPriceRounded,
      });
      if (r && !r.ok) setServerMsg({ ok: false, text: r.message ?? "Falha ao salvar." });
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        <section className="card card-body">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="svc">Serviço</label>
              <select id="svc" className="input" value={service} disabled={props.lockService} onChange={(e) => changeService(e.target.value as ServiceCode | "")}>
                {!service && <option value="">Selecione…</option>}
                {props.services.map((s) => <option key={s} value={s}>{SERVICES[s].name}</option>)}
              </select>
              {def && <p className="mt-1 text-xs text-stone-500">{def.description}</p>}
            </div>
            {props.onSave && (
              <div>
                <label className="label" htmlFor="desc">Descrição do item na proposta</label>
                <input id="desc" className="input" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
              </div>
            )}
          </div>
        </section>

        {def && service && sections.map((sec) => {
          const fields = def.fields.filter((f) => f.section === sec.key && visible(f));
          if (!fields.length) return null;
          return (
            <section key={sec.key} className="card card-body">
              <h2 className="mb-3 text-xs font-bold tracking-wider text-stone-500 uppercase">{sec.title}</h2>
              {sec.key === "QUANTIDADE" && props.trees && (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <button type="button" className={clsx("btn btn-sm", !useTrees ? "btn-primary" : "btn-secondary")} onClick={() => setUseTrees(false)}>Informar quantidade</button>
                  <button type="button" className={clsx("btn btn-sm", useTrees ? "btn-primary" : "btn-secondary")} onClick={() => setUseTrees(true)}>
                    <TreePine className="size-3.5" /> Selecionar árvores cadastradas
                  </button>
                </div>
              )}
              {sec.key === "QUANTIDADE" && useTrees && props.trees ? (
                <TreePicker trees={props.trees} selected={treeIds} onChange={setTreeIds} />
              ) : (
                <div className={clsx("grid gap-4", sec.key !== "MODIFICADORES" && "sm:grid-cols-2")}>
                  {fields.map((f) => <FieldInput key={f.key} f={f} values={values} set={set} params={params} service={service} rules={props.compensationRules} applyRule={applyRule} />)}
                </div>
              )}
            </section>
          );
        })}
        {/* Celular: preço sempre visível acima da navegação inferior */}
        <a href="#simulacao" className="sticky bottom-[5.75rem] z-10 flex items-center justify-between rounded-2xl bg-brand-700 px-4 py-3 text-white shadow-lg lg:hidden">
          <span className="text-xs text-brand-100">{error ? "Verifique os dados" : `${result?.days ?? 0} dia(s) · ${fmtBRL(result?.unitPriceRounded ?? 0)}/árvore`}</span>
          <span className="text-lg font-bold tabular-nums">{result ? fmtBRL(result.finalPriceRounded) : "—"}</span>
        </a>
      </div>

      {/* ── Simulação ── */}
      <aside id="simulacao" className="scroll-mt-20 lg:sticky lg:top-20 lg:self-start">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between bg-brand-700 px-4 py-3 text-white">
            <span className="flex items-center gap-2 text-sm font-semibold"><Calculator className="size-4" /> Simulação</span>
            <span className="text-xs text-brand-100">Parâmetros v{props.versionLabel}</span>
          </div>
          <div className="card-body space-y-3">
            {error ? (
              error.startsWith("Preencha") || error.startsWith("Selecione")
                ? <p role="status" className="rounded-xl bg-stone-100 px-3 py-2 text-sm text-stone-700">{error.replace(/^Preencha:/, "Para calcular, preencha:")}</p>
                : <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
            ) : result ? (
              <>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <Stat k="Árvores" v={fmtN(effective.trees as string || 0)} />
                  <Stat k="Produtividade" v={`${fmtN(result.productivity)}/dia`} />
                  <Stat k="Dias" v={`${result.days}${result.extraDays ? ` (+${result.extraDays})` : ""}`} />
                  <Stat k="Equipe" v={`${result.technicians} téc. + ${result.auxiliaries} aux.`} />
                  {canSeeCosts && <>
                    <Stat k="Custo operacional" v={fmtBRL(result.operationalCost)} />
                    <Stat k="Fatores" v={`× ${fmtN(Number(result.serviceTypeFactor) * Number(result.modifiersFactor))}`} />
                    <Stat k="Margem" v={fmtPct(result.margin)} />
                    <Stat k="Imposto" v={fmtPct(result.tax)} />
                  </>}
                </dl>
                <div className="rounded-xl bg-brand-50 p-3 text-center">
                  <div className="text-xs font-semibold tracking-wide text-brand-800 uppercase">Preço final</div>
                  <div data-testid="preco-final" className="text-3xl font-bold text-brand-900 tabular-nums">{fmtBRL(result.finalPriceRounded)}</div>
                  <div className="text-sm text-brand-800">{fmtBRL(result.unitPriceRounded)} por árvore</div>
                  {canSeeCosts && <div className="mt-1 text-xs text-brand-700">Margem efetiva {fmtPct(result.effectiveMargin)}</div>}
                </div>
                {props.estimateMargin && (() => {
                  const adj = adjustedItemPrice(result, { estimateMargin: props.estimateMargin });
                  return (
                    <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-center text-violet-900">
                      <div className="text-xs font-semibold uppercase">Na proposta, com a margem do orçamento{canSeeCosts ? ` (${fmtPct(props.estimateMargin)})` : ""}</div>
                      <div data-testid="preco-com-margem" className="text-xl font-bold tabular-nums">{fmtBRL(adj.price)}</div>
                      <div className="text-xs">{fmtBRL(adj.price.div(Number(effective.trees) || 1))} por árvore</div>
                    </div>
                  );
                })()}
                {result.warnings.length > 0 && (
                  <ul className="space-y-1.5">
                    {result.warnings.map((w) => (
                      <li key={w.code} className={clsx("flex gap-2 rounded-lg px-2.5 py-2 text-xs", w.level === "confirm" ? "bg-amber-50 text-amber-900" : "bg-sky-50 text-sky-900")}>
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> <span>{w.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {comparison && canSeeCosts && (
                  <div className="rounded-xl border border-stone-200 p-3 text-xs">
                    <div className="mb-1 flex items-center gap-1 font-semibold text-stone-700"><Zap className="size-3.5" /> Legado × padronizado</div>
                    <div className="flex justify-between"><span>Motor v1 (planilha)</span><b className="tabular-nums">{fmtBRL(comparison.legacy.finalPriceRounded)}</b></div>
                    <div className="flex justify-between"><span>Motor v2 (padronizado)</span><b className="tabular-nums">{fmtBRL(comparison.v2.finalPriceRounded)}</b></div>
                    <div className="flex justify-between text-stone-500"><span>Diferença</span>
                      <span className="tabular-nums">{fmtBRL(Number(comparison.v2.finalPriceRounded) - Number(comparison.legacy.finalPriceRounded))}</span></div>
                  </div>
                )}
                <button type="button" className="btn btn-secondary w-full" onClick={() => setShowMemory((s) => !s)} aria-expanded={showMemory}>
                  <ChevronDown className={clsx("size-4 transition", showMemory && "rotate-180")} /> {showMemory ? "Ocultar" : "Ver"} memória de cálculo
                </button>
                {props.onSave && (
                  <>
                    {confirmWarnings.length > 0 && (
                      <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">
                        <input type="checkbox" className="mt-0.5 size-4 accent-amber-600" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
                        Confirmo os valores fora do padrão indicados acima.
                      </label>
                    )}
                    {serverMsg && <p role="alert" className={clsx("rounded-lg px-2.5 py-2 text-xs", serverMsg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800")}>{serverMsg.text}</p>}
                    <button type="button" className="btn btn-primary w-full" disabled={pending || !result || (confirmWarnings.length > 0 && !confirm)} onClick={save}>
                      {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {props.saveLabel ?? "Salvar no orçamento"}
                    </button>
                    <p className="text-center text-[11px] text-stone-500">O servidor recalcula ao salvar; o valor gravado é sempre o do servidor.</p>
                  </>
                )}
              </>
            ) : null}
          </div>
        </div>
        {showMemory && result && <CalcMemory result={result} canSeeCosts={canSeeCosts} />}
      </aside>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-stone-500">{k}</dt>
      <dd className="truncate font-semibold text-stone-900 tabular-nums">{v}</dd>
    </div>
  );
}

function FieldInput({ f, values, set, params, service, rules, applyRule }: {
  f: FieldDef; values: Values; set: (k: string, v: string | boolean | string[]) => void; params: PricingParams; service: ServiceCode;
  rules?: CompensationRuleOption[]; applyRule: (id: string) => void;
}) {
  const id = `sim-${f.key}`;
  const v = values[f.key];
  if (f.kind === "bool")
    return (
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2 has-checked:border-brand-400 has-checked:bg-brand-50">
        <span className="text-sm">
          <span className="font-medium text-stone-800">{f.label}</span>
          {f.hint && <span className="block text-xs text-stone-500">{f.hint}</span>}
        </span>
        <input id={id} type="checkbox" className="size-5 shrink-0 accent-brand-600" checked={!!v} onChange={(e) => set(f.key, e.target.checked)} />
      </label>
    );
  if (f.kind === "difficulty") {
    const sp = params.services[service];
    const levels = DIFFICULTIES.filter((d) => sp.productivity[d]);
    const hint = sp.difficultyHints?.[Number(v) as Difficulty];
    return (
      <div className="sm:col-span-2">
        <span className="label">{f.label}</span>
        <div className={clsx("grid gap-1.5", levels.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")} role="radiogroup" aria-label={f.label}>
          {levels.map((d) => (
            <button key={d} type="button" role="radio" aria-checked={String(v) === String(d)} title={sp.difficultyHints?.[d]}
              className={clsx("btn btn-sm h-auto flex-col py-1.5", String(v) === String(d) ? "btn-primary" : "btn-secondary")} onClick={() => set(f.key, String(d))}>
              {DIFFICULTY_LABEL[d]}
              <span className="text-[10px] font-normal opacity-80">{fmtN(sp.productivity[d]!)} árv./dia</span>
            </button>
          ))}
        </div>
        {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
      </div>
    );
  }
  if (f.kind === "yesno")
    return (
      <fieldset className="sm:col-span-2">
        <legend className="label">{f.label}</legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={f.label}>
          {([[true, "Sim"], [false, "Não"]] as const).map(([val, lbl]) => (
            <label key={lbl} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 has-checked:border-brand-400 has-checked:bg-brand-50">
              <input type="radio" id={`${id}-${val ? "sim" : "nao"}`} name={id} className="size-4 accent-brand-600" checked={v === val} onChange={() => set(f.key, val)} />
              <span className="text-sm font-medium">{lbl}</span>
            </label>
          ))}
        </div>
        {f.hint && <p className="mt-1 text-xs text-stone-500">{f.hint}</p>}
      </fieldset>
    );
  if (f.kind === "select")
    return (
      <div>
        <label className="label" htmlFor={id}>{f.label}</label>
        <select id={id} className="input" value={String(v ?? "")} onChange={(e) => set(f.key, e.target.value)}>
          {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    );
  if (f.kind === "compensationRule")
    return (
      <div className="sm:col-span-2">
        <label className="label" htmlFor={id}>{f.label}</label>
        <select id={id} className="input" value="" onChange={(e) => applyRule(e.target.value)} disabled={!rules?.length}>
          <option value="">{rules?.length ? "Preencher a partir de uma lei cadastrada…" : "Nenhuma lei municipal cadastrada (Administração › Parâmetros de preço)"}</option>
          {(rules ?? []).map((r) => <option key={r.id} value={r.id}>{r.city}/{r.state} — {r.lawReference} ({fmtN(r.seedlingsPerTree)} mudas/árvore)</option>)}
        </select>
        <p className="mt-1 text-xs text-stone-500">Preenche município, lei, mudas (árvores × mudas por árvore) e frete da cidade. Os campos continuam editáveis.</p>
      </div>
    );
  if (f.kind === "text")
    return (
      <div className={clsx(f.key === "compensationLaw" && "sm:col-span-2")}>
        <label className="label" htmlFor={id}>{f.label}</label>
        <input id={id} className="input" value={String(v ?? "")} maxLength={300} onChange={(e) => set(f.key, e.target.value)} />
        {f.hint && <p className="mt-1 text-xs text-stone-500">{f.hint}</p>}
      </div>
    );
  if (f.kind === "serviceType")
    return (
      <div>
        <label className="label" htmlFor={id}>{f.label}</label>
        <select id={id} className="input" value={String(v ?? "")} onChange={(e) => set(f.key, e.target.value)}>
          <option value="">Selecione…</option>
          {(params.services[service].serviceTypes ?? []).map((t) => (
            <option key={t.code} value={t.code}>{t.label}{Number(t.factor) !== 1 ? ` (× ${fmtN(t.factor)})` : ""}</option>
          ))}
        </select>
      </div>
    );
  if (f.kind === "modifiers") {
    const selected = (v as string[]) ?? [];
    const mods = (params.services[service].modifiers ?? []).filter((m) => m.active).sort((a, b) => a.order - b.order);
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {mods.map((m) => (
          <label key={m.key} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2 has-checked:border-brand-400 has-checked:bg-brand-50">
            <input type="checkbox" className="size-5 shrink-0 accent-brand-600" checked={selected.includes(m.key)}
              onChange={(e) => set(f.key, e.target.checked ? [...selected, m.key] : selected.filter((k) => k !== m.key))} />
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-medium text-stone-800">{m.label}</span>
              <span className="block text-xs text-stone-500">× {fmtN(m.factor)}{m.addsDays ? ` · +${m.addsDays} dia` : ""}</span>
            </span>
          </label>
        ))}
      </div>
    );
  }
  return (
    <div>
      <label className="label" htmlFor={id}>{f.label}</label>
      <div className="relative">
        <input id={id} className={clsx("input", f.suffix && "pr-12")} inputMode={f.kind === "int" ? "numeric" : "decimal"} autoComplete="off" value={String(v ?? "")} onChange={(e) => set(f.key, e.target.value)} />
        {f.suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-stone-400">{f.suffix}</span>}
      </div>
      {f.hint && <p className="mt-1 text-xs text-stone-500">{f.hint}</p>}
    </div>
  );
}

const GROUP_TITLE: Record<string, string> = { QTD: "Quantidades e equipe", CUSTO: "Custos", FATOR: "Fatores", TOTAL: "Totais", PRECO: "Preço" };

export function CalcMemory({ result, canSeeCosts }: { result: CalcResult; canSeeCosts: boolean }) {
  const groups = (["QTD", "CUSTO", "FATOR", "TOTAL", "PRECO"] as const).filter((g) => canSeeCosts || g === "QTD" || g === "PRECO");
  return (
    <section className="card mt-4" aria-label="Memória de cálculo">
      <header className="border-b border-stone-100 px-4 py-3 text-sm font-semibold">Memória de cálculo</header>
      <div className="divide-y divide-stone-100">
        {groups.map((g) => {
          const rows = result.components.filter((c) => c.group === g && (canSeeCosts || !["precoAntesImposto"].includes(c.key)));
          if (!rows.length) return null;
          return (
            <div key={g} className="px-4 py-3">
              <h3 className="mb-2 text-[11px] font-bold tracking-wider text-stone-500 uppercase">{GROUP_TITLE[g]}</h3>
              <ul className="space-y-2">
                {rows.map((c) => (
                  <li key={c.key} className="text-sm">
                    <div className="flex justify-between gap-2"><span className="text-stone-700">{c.label}</span><b className="tabular-nums">{c.display}</b></div>
                    <div className="text-xs text-stone-500">{c.formula}</div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {canSeeCosts && (
          <div className="px-4 py-3 text-xs text-stone-500">
            Margem {fmtPct(result.margin)} · imposto {fmtPct(result.tax)} · margem efetiva {fmtPct(result.effectiveMargin)} ·
            {result.priceMethod === "LEGACY_PODA" ? " metodologia legada da poda" : " margem sobre o preço de venda"}.
          </div>
        )}
      </div>
    </section>
  );
}
