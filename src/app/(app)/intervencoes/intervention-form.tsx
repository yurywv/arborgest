"use client";
import type { Intervention } from "@prisma/client";
import { ActionForm, Field, FormActions, FormSection, NumberField, SelectField, TextArea } from "@/components/form";
import { TreePicker } from "@/components/tree-picker";
import { INTERVENTION_STATUS, INTERVENTION_TYPES, PRIORITY, enumOptions, type Option } from "@/lib/catalogs";
import type { TreeOption } from "@/lib/options";
import { toInputDate } from "@/lib/format";
import { saveIntervention } from "./actions";

type I = Omit<Intervention, "estimatedCost" | "actualCost"> & { estimatedCost: number | null; actualCost: number | null };

export function InterventionForm({ intervention, trees, users, teams, workOrders, treeCode }: {
  intervention?: I; trees: TreeOption[]; users: Option[]; teams: Option[]; workOrders: Option[]; treeCode?: string;
}) {
  const i: Partial<I> = intervention ?? {};
  return (
    <ActionForm action={saveIntervention.bind(null, intervention?.id ?? null)} className="space-y-4">
      <FormSection title="Intervenção">
        {!intervention && <TreePicker trees={trees} defaultCode={treeCode} />}
        <SelectField name="type" label="Tipo" required options={INTERVENTION_TYPES} defaultValue={i.type} />
        <SelectField name="priority" label="Prioridade" required options={enumOptions(PRIORITY)} defaultValue={i.priority ?? "MEDIA"} placeholder={false} />
        <TextArea name="description" label="Descrição" defaultValue={i.description} wrapClassName="sm:col-span-2" />
        <SelectField name="status" label="Status" required options={enumOptions(INTERVENTION_STATUS)} defaultValue={i.status ?? "RECOMENDADA"} placeholder={false} />
        <SelectField name="workOrderId" label="Ordem de serviço" options={workOrders} defaultValue={i.workOrderId} placeholder="Sem OS" />
      </FormSection>
      <FormSection title="Programação e execução">
        <Field name="recommendedAt" type="date" label="Data recomendada" defaultValue={toInputDate(i.recommendedAt ?? new Date())} />
        <Field name="scheduledAt" type="date" label="Data programada" defaultValue={toInputDate(i.scheduledAt)} />
        <Field name="executedAt" type="date" label="Data executada" defaultValue={toInputDate(i.executedAt)} />
        <div />
        <SelectField name="responsibleId" label="Responsável" options={users} defaultValue={i.responsibleId} />
        <SelectField name="teamId" label="Equipe" options={teams} defaultValue={i.teamId} />
        <NumberField name="estimatedCost" label="Custo previsto (R$)" defaultValue={i.estimatedCost} />
        <NumberField name="actualCost" label="Custo real (R$)" defaultValue={i.actualCost} />
        <TextArea name="notes" label="Observações" defaultValue={i.notes} wrapClassName="sm:col-span-2" />
      </FormSection>
      <p className="text-sm text-stone-500">Fotos de antes e depois são adicionadas na página da intervenção.</p>
      <FormActions cancelHref={intervention ? `/intervencoes/${intervention.id}` : "/intervencoes"} />
    </ActionForm>
  );
}
