"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/form";
import type { ActionState } from "@/lib/action-state";

export type PickRow = { id: string; kind: "inspection" | "risk"; date: string; tree: string; label: string; place: string };

/** Seleção múltipla de inspeções/avaliações de risco do cliente para vincular (nada vem marcado). */
export function BasisPicker({ action, rows }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; rows: PickRow[] }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const f = q.trim().toLowerCase();
  const shown = rows.filter((r) => !f || `${r.tree} ${r.label} ${r.place}`.toLowerCase().includes(f));
  const toggle = (k: string) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  if (!rows.length) return <p className="text-sm text-stone-500">Não há outras inspeções ou avaliações de risco das árvores deste cliente.</p>;
  return (
    <ActionForm action={action} className="space-y-2" refreshOnSuccess onSuccess={() => setSel([])}>
      <label className="block"><span className="mb-0.5 block text-[11px] font-medium text-stone-500">Filtrar (código da árvore, espécie, propriedade, classificação)</span>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" /></label>
      <div className="flex items-center justify-between text-xs text-stone-500">
        <span>{sel.length} selecionado(s) de {rows.length}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSel((s) => [...new Set([...s, ...shown.map((r) => `${r.kind}:${r.id}`)])])}>Marcar exibidos</button>
      </div>
      <ul className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-stone-200 p-2" data-testid="basis-picker">
        {shown.map((r) => {
          const k = `${r.kind}:${r.id}`;
          return (
            <li key={k}>
              <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm hover:bg-stone-50">
                <input type="checkbox" className="size-5 accent-brand-600" checked={sel.includes(k)} onChange={() => toggle(k)} />
                <span className="min-w-0 flex-1 truncate"><span className="font-mono">{r.tree}</span> · {r.kind === "inspection" ? "Inspeção" : "Avaliação de risco"} {r.date} · <b>{r.label}</b> <span className="text-stone-500">· {r.place}</span></span>
              </label>
            </li>
          );
        })}
      </ul>
      {sel.filter((k) => k.startsWith("inspection:")).map((k) => <input key={k} type="hidden" name="inspectionIds" value={k.slice(11)} />)}
      {sel.filter((k) => k.startsWith("risk:")).map((k) => <input key={k} type="hidden" name="riskIds" value={k.slice(5)} />)}
      <SubmitButton variant="secondary">Vincular selecionados</SubmitButton>
    </ActionForm>
  );
}
