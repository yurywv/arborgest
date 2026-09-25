"use client";
import { useMemo, useState } from "react";
import type { WorkOrder } from "@prisma/client";
import { ActionForm, Field, FormActions, FormSection, NumberField, SelectField, TextArea, useFormCtx } from "@/components/form";
import { INTERVENTION_TYPES, PRIORITY, SERVICES, WORK_ORDER_ORIGIN, WORK_ORDER_STATUS, enumOptions, type Option } from "@/lib/catalogs";
import type { ProposalOption, TreeOption } from "@/lib/options";
import { toInputDate } from "@/lib/format";
import { saveWorkOrder } from "./actions";

type WO = Omit<WorkOrder, "cost"> & { cost: number | null; treeIds: string[] };

function TreeChecklist({ trees, selected, onChange }: { trees: TreeOption[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState("");
  const { errors } = useFormCtx();
  const shown = trees.filter((t) => !q || t.label.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="sm:col-span-2">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="label mb-0">Árvores ({selected.length} selecionada(s))</span>
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([...new Set([...selected, ...shown.map((t) => t.id)])])}>Marcar visíveis</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([])}>Limpar</button>
        </div>
      </div>
      <label className="mb-2 block"><span className="mb-0.5 block text-[11px] font-medium text-stone-500">Filtrar árvores (código, espécie ou setor)</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} className="input" autoComplete="off" /></label>
      <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-stone-200 p-2">
        {trees.length === 0 && <p className="p-2 text-sm text-stone-500">Selecione o cliente/propriedade para listar as árvores.</p>}
        {shown.map((t) => (
          <label key={t.id} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm hover:bg-stone-50">
            <input type="checkbox" className="size-5 accent-brand-600" checked={selected.includes(t.id)} onChange={() => toggle(t.id)} />
            <span className="font-mono">{t.label}</span>
          </label>
        ))}
      </div>
      {selected.map((id) => <input key={id} type="hidden" name="treeIds" value={id} />)}
      {errors?.treeIds && <p className="mt-1 text-xs text-red-600">{errors.treeIds}</p>}
    </div>
  );
}

/** Origem obrigatória e sem opção pré-marcada: proposta (escolhida entre as do cliente) ou serviço avulso. */
function OriginPicker({ origin, setOrigin, proposalId, setProposalId, proposals }: {
  origin: string; setOrigin: (v: string) => void; proposalId: string; setProposalId: (v: string) => void; proposals: ProposalOption[];
}) {
  const { errors } = useFormCtx();
  return (
    <div className="sm:col-span-2 space-y-2">
      <fieldset>
        <legend className="label">Origem da OS <span className="text-red-600">*</span></legend>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
          {WORK_ORDER_ORIGIN.map((o) => (
            <label key={o.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2 has-checked:border-brand-400 has-checked:bg-brand-50">
              <input type="radio" name="origin" value={o.value} id={`origin-${o.value}`} className="size-5 accent-brand-600" checked={origin === o.value} onChange={() => setOrigin(o.value)} />
              <span className="text-sm font-medium">{o.value === "PROPOSTA" ? "Associar a uma proposta" : o.label}</span>
            </label>
          ))}
        </div>
        {errors?.origin && <p className="mt-1 text-xs text-red-600">{errors.origin}</p>}
      </fieldset>
      {origin === "PROPOSTA" && (
        <label className="block"><span className="label">Proposta <span className="text-red-600">*</span></span>
          <select name="proposalId" id="f-proposalId" className={`input ${errors?.proposalId ? "input-error" : ""}`} value={proposalId} onChange={(e) => setProposalId(e.target.value)}>
            <option value="">{proposals.length ? "Selecione…" : "Nenhuma proposta emitida para este cliente"}</option>
            {proposals.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {errors?.proposalId && <span className="mt-1 block text-xs text-red-600">{errors.proposalId}</span>}
        </label>
      )}
    </div>
  );
}

export function WorkOrderForm({ wo, clients, properties, trees, users, teams, proposals, preset }: {
  wo?: WO; clients: Option[]; properties: (Option & { clientId: string })[]; trees: TreeOption[]; users: Option[]; teams: Option[];
  proposals: ProposalOption[];
  preset?: { clientId?: string; propertyId?: string; treeIds?: string[] };
}) {
  const w: Partial<WO> = wo ?? {};
  const [clientId, setClientId] = useState(w.clientId ?? preset?.clientId ?? "");
  const [propertyId, setPropertyId] = useState(w.propertyId ?? preset?.propertyId ?? "");
  const [treeIds, setTreeIds] = useState<string[]>(w.treeIds ?? preset?.treeIds ?? []);
  const [origin, setOrigin] = useState(w.origin ?? "");
  const [proposalId, setProposalId] = useState(w.proposalId ?? "");
  const props = properties.filter((p) => p.clientId === clientId);
  const available = useMemo(() => trees.filter((t) => t.clientId === clientId && (!propertyId || t.propertyId === propertyId)), [trees, clientId, propertyId]);

  return (
    <ActionForm action={saveWorkOrder.bind(null, wo?.id ?? null)} className="space-y-4">
      <FormSection title="Ordem de serviço" description={wo ? `Número ${wo.number}` : "O número (OS-AAAA-0000) é gerado automaticamente."}>
        <SelectField key={`c${clientId}`} name="clientId" label="Cliente" required options={clients} defaultValue={clientId}
          onChange={(e) => { setClientId(e.target.value); setPropertyId(""); setTreeIds([]); setProposalId(""); }} />
        <OriginPicker origin={origin} setOrigin={setOrigin} proposalId={proposalId} setProposalId={setProposalId} proposals={proposals.filter((p) => p.clientId === clientId)} />
        <SelectField key={`p${clientId}${propertyId}`} name="propertyId" label="Propriedade" options={props} defaultValue={propertyId}
          placeholder="Todas / não se aplica" onChange={(e) => { setPropertyId(e.target.value); setTreeIds((ids) => ids.filter((id) => trees.find((t) => t.id === id)?.propertyId === e.target.value || !e.target.value)); }} />
        <TreeChecklist trees={available} selected={treeIds} onChange={setTreeIds} />
        <SelectField name="service" label="Serviço" required options={SERVICES} defaultValue={w.service} />
        <SelectField name="priority" label="Prioridade" required options={enumOptions(PRIORITY)} defaultValue={w.priority ?? "MEDIA"} placeholder={false} />
        <TextArea name="description" label="Descrição" defaultValue={w.description} wrapClassName="sm:col-span-2" />
      </FormSection>
      <FormSection title="Execução">
        <SelectField name="status" label="Status" required options={enumOptions(WORK_ORDER_STATUS)} defaultValue={w.status ?? "ABERTA"} placeholder={false} />
        <Field name="scheduledAt" type="date" label="Data prevista" defaultValue={toInputDate(w.scheduledAt)} />
        <SelectField name="teamId" label="Equipe" options={teams} defaultValue={w.teamId} />
        <SelectField name="responsibleId" label="Responsável" options={users} defaultValue={w.responsibleId} />
        <Field name="executedAt" type="date" label="Data executada" defaultValue={toInputDate(w.executedAt)} />
        <NumberField name="cost" label="Custo (R$)" defaultValue={w.cost} />
        <TextArea name="notes" label="Observações" defaultValue={w.notes} wrapClassName="sm:col-span-2" />
        {!wo && (
          <SelectField name="interventionType" label="Gerar intervenção para cada árvore (opcional)" options={INTERVENTION_TYPES} placeholder="Não gerar" wrapClassName="sm:col-span-2" />
        )}
      </FormSection>
      <FormActions cancelHref={wo ? `/ordens-servico/${wo.id}` : "/ordens-servico"} />
    </ActionForm>
  );
}
