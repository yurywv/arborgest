"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { CheckSquare, Search, Square } from "lucide-react";

export type PickerTree = {
  id: string;
  code: string;
  species: string | null;
  sectorId: string | null;
  sector: string | null;
  height: number | null;
  condition: string | null;
  conditionLabel: string | null;
  risk: string | null;
  riskLabel: string | null;
  recommended: { type: string; label: string }[];
};

const uniq = <T,>(arr: (T | null)[]) => [...new Set(arr.filter((x): x is T => x !== null))];

/** Seleção de exemplares da propriedade com filtros; a quantidade do item passa a ser o nº selecionado. */
export function TreePicker({ trees, selected, onChange }: { trees: PickerTree[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState("");
  const [species, setSpecies] = useState("");
  const [risk, setRisk] = useState("");
  const [condition, setCondition] = useState("");
  const [sector, setSector] = useState("");
  const [intervention, setIntervention] = useState("");
  const [minH, setMinH] = useState("");
  const [maxH, setMaxH] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);

  const opts = useMemo(() => ({
    species: uniq(trees.map((t) => t.species)).sort(),
    sectors: [...new Map(trees.filter((t) => t.sectorId).map((t) => [t.sectorId!, t.sector!])).entries()],
    risks: [...new Map(trees.filter((t) => t.risk).map((t) => [t.risk!, t.riskLabel!])).entries()],
    conditions: [...new Map(trees.filter((t) => t.condition).map((t) => [t.condition!, t.conditionLabel!])).entries()],
    interventions: [...new Map(trees.flatMap((t) => t.recommended.map((r) => [r.type, r.label] as const))).entries()],
  }), [trees]);

  const sel = useMemo(() => new Set(selected), [selected]);
  const visible = useMemo(() => trees.filter((t) =>
    (!q || t.code.toLowerCase().includes(q.toLowerCase()) || (t.species ?? "").toLowerCase().includes(q.toLowerCase())) &&
    (!species || t.species === species) && (!risk || t.risk === risk) && (!condition || t.condition === condition) &&
    (!sector || t.sectorId === sector) && (!intervention || t.recommended.some((r) => r.type === intervention)) &&
    (!minH || (t.height ?? -1) >= Number(minH)) && (!maxH || (t.height ?? Infinity) <= Number(maxH)) &&
    (!onlySelected || sel.has(t.id))), [trees, q, species, risk, condition, sector, intervention, minH, maxH, onlySelected, sel]);

  const allVisibleSelected = visible.length > 0 && visible.every((t) => sel.has(t.id));
  const toggleAll = () => {
    const ids = new Set(selected);
    if (allVisibleSelected) visible.forEach((t) => ids.delete(t.id));
    else visible.forEach((t) => ids.add(t.id));
    onChange([...ids]);
  };
  const toggle = (id: string) => onChange(sel.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  if (!trees.length) return <p className="rounded-xl bg-stone-50 p-3 text-sm text-stone-600">Nenhuma árvore ativa cadastrada na propriedade deste orçamento.</p>;

  const sel2 = (label: string, value: string, set: (v: string) => void, items: [string, string][]) => (
    <label className="min-w-0">
      <span className="mb-0.5 block text-[11px] font-medium text-stone-500">{label}</span>
      <select className="input min-h-10 py-1.5" value={value} onChange={(e) => set(e.target.value)}>
        <option value="">Todos</option>
        {items.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </label>
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="relative sm:col-span-2 lg:col-span-3">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
          <input className="input pl-9" placeholder="Código ou espécie" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar árvore" />
        </label>
        {sel2("Espécie", species, setSpecies, opts.species.map((s) => [s, s]))}
        {sel2("Risco", risk, setRisk, opts.risks)}
        {sel2("Intervenção recomendada", intervention, setIntervention, opts.interventions)}
        {sel2("Setor", sector, setSector, opts.sectors)}
        {sel2("Condição", condition, setCondition, opts.conditions)}
        <div className="grid grid-cols-2 gap-2">
          <label><span className="mb-0.5 block text-[11px] font-medium text-stone-500">Altura mín. (m)</span>
            <input className="input min-h-10 py-1.5" inputMode="decimal" value={minH} onChange={(e) => setMinH(e.target.value)} /></label>
          <label><span className="mb-0.5 block text-[11px] font-medium text-stone-500">Altura máx. (m)</span>
            <input className="input min-h-10 py-1.5" inputMode="decimal" value={maxH} onChange={(e) => setMaxH(e.target.value)} /></label>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm">
        <span><b data-testid="arvores-selecionadas">{selected.length}</b> árvore(s) selecionada(s) · {visible.length} exibida(s)</span>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={toggleAll}>{allVisibleSelected ? "Desmarcar exibidas" : "Selecionar exibidas"}</button>
          <button type="button" className={clsx("btn btn-sm", onlySelected ? "btn-primary" : "btn-secondary")} onClick={() => setOnlySelected((s) => !s)}>Só selecionadas</button>
          {selected.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([])}>Limpar</button>}
        </div>
      </div>

      <ul className="max-h-96 divide-y divide-stone-100 overflow-y-auto rounded-xl border border-stone-200">
        {visible.slice(0, 500).map((t) => (
          <li key={t.id}>
            <button type="button" onClick={() => toggle(t.id)} aria-pressed={sel.has(t.id)}
              className={clsx("flex w-full items-center gap-3 px-3 py-2 text-left text-sm", sel.has(t.id) ? "bg-brand-50" : "hover:bg-stone-50")}>
              {sel.has(t.id) ? <CheckSquare className="size-5 shrink-0 text-brand-600" /> : <Square className="size-5 shrink-0 text-stone-400" />}
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{t.code}</span> <span className="text-stone-600">{t.species ?? "Não identificada"}</span>
                <span className="block truncate text-xs text-stone-500">
                  {[t.sector, t.height ? `${t.height.toLocaleString("pt-BR")} m` : null, t.conditionLabel, t.riskLabel ? `risco ${t.riskLabel.toLowerCase()}` : null,
                    t.recommended.map((r) => r.label).join(", ") || null].filter(Boolean).join(" · ")}
                </span>
              </span>
            </button>
          </li>
        ))}
        {visible.length > 500 && <li className="px-3 py-2 text-xs text-stone-500">Mostrando 500 de {visible.length}. Refine os filtros; "Selecionar exibidas" considera todas as {visible.length}.</li>}
        {!visible.length && <li className="px-3 py-3 text-sm text-stone-500">Nenhuma árvore com esses filtros.</li>}
      </ul>
    </div>
  );
}
