"use client";
import { useState } from "react";
import type { Inspection, InspectionFinding } from "@prisma/client";
import { ActionForm, Checkbox, CheckboxGroup, Field, FormActions, FormSection, NumberField, SelectField, TextArea } from "@/components/form";
import { TreePicker } from "@/components/tree-picker";
import { CONDITION, FINDINGS_BY_CATEGORY, INSPECTION_REASONS, INTERVENTION_TYPES, LEVEL3, PRIORITY, enumOptions, type Option, type FindingCategoryKey } from "@/lib/catalogs";
import type { TreeOption } from "@/lib/options";
import { toInputDate } from "@/lib/format";
import { saveInspection } from "./actions";

type Insp = Inspection & { findings: InspectionFinding[] };

export function InspectionForm({ inspection, trees, users, treeCode, meId }: { inspection?: Insp; trees: TreeOption[]; users: Option[]; treeCode?: string; meId: string }) {
  const i: Partial<Insp> = inspection ?? {};
  const [makeIntervention, setMakeIntervention] = useState(false);
  const found = (cat: FindingCategoryKey) => (i.findings ?? []).filter((f) => f.category === cat).map((f) => f.code);
  const conds = enumOptions(CONDITION);
  const catSection = (cat: FindingCategoryKey, condName: string, condValue: string | null | undefined, extra?: React.ReactNode) => (
    <FormSection title={FINDINGS_BY_CATEGORY[cat].label}>
      <SelectField name={condName} label={`Condição — ${FINDINGS_BY_CATEGORY[cat].label.toLowerCase()}`} options={conds} defaultValue={condValue} />
      {extra ?? <div />}
      <div className="sm:col-span-2">
        <CheckboxGroup name={`f_${cat}`} label="Problemas observados" options={FINDINGS_BY_CATEGORY[cat].options} defaultValues={found(cat)} />
      </div>
    </FormSection>
  );

  return (
    <ActionForm action={saveInspection.bind(null, inspection?.id ?? null)} className="space-y-4">
      <FormSection title="Inspeção" description="Cada inspeção é um novo registro: o histórico da árvore nunca é sobrescrito.">
        {!inspection && <TreePicker trees={trees} defaultCode={treeCode} />}
        <Field name="inspectedAt" type="date" label="Data" required defaultValue={toInputDate(i.inspectedAt ?? new Date())} />
        <SelectField name="inspectorId" label="Técnico" options={users} defaultValue={i.inspectorId ?? meId} />
        <SelectField name="reason" label="Motivo" options={INSPECTION_REASONS} defaultValue={i.reason ?? "ROTINA"} />
        <SelectField name="generalCondition" label="Condição geral" required options={conds} defaultValue={i.generalCondition} />
      </FormSection>

      {catSection("RAIZES", "rootCondition", i.rootCondition)}
      {catSection("TRONCO", "trunkCondition", i.trunkCondition, <NumberField name="trunkLeanDegrees" label="Inclinação do tronco" suffix="°" defaultValue={i.trunkLeanDegrees} />)}
      {catSection("COPA", "crownCondition", i.crownCondition, <NumberField name="deadBranchesPercent" label="Galhos secos (%)" suffix="%" defaultValue={i.deadBranchesPercent} />)}
      <FormSection title="Fitossanidade">
        <SelectField name="phytoCondition" label="Estado fitossanitário" options={conds} defaultValue={i.phytoCondition} />
        <SelectField name="phytoSeverity" label="Severidade" options={LEVEL3} defaultValue={i.phytoSeverity} />
        <div className="sm:col-span-2">
          <CheckboxGroup name="f_FITOSSANIDADE" label="Ocorrências" options={FINDINGS_BY_CATEGORY.FITOSSANIDADE.options} defaultValues={found("FITOSSANIDADE")} />
        </div>
        <Field name="probableDiagnosis" label="Diagnóstico provável" defaultValue={i.probableDiagnosis} />
        <Field name="confirmedDiagnosis" label="Diagnóstico confirmado" defaultValue={i.confirmedDiagnosis} />
      </FormSection>

      <FormSection title="Conclusão">
        <TextArea name="problems" label="Problemas identificados" defaultValue={i.problems} wrapClassName="sm:col-span-2" />
        <TextArea name="recommendation" label="Recomendação" defaultValue={i.recommendation} wrapClassName="sm:col-span-2" />
        <SelectField name="priority" label="Prioridade" required options={enumOptions(PRIORITY)} defaultValue={i.priority ?? "MEDIA"} placeholder={false} />
        <Field name="nextInspectionAt" type="date" label="Próxima inspeção" defaultValue={toInputDate(i.nextInspectionAt)} hint="Em branco: calculada pelo intervalo padrão e pela condição." />
        <TextArea name="notes" label="Observações técnicas" defaultValue={i.notes} wrapClassName="sm:col-span-2" />
        {!inspection && (
          <div className="space-y-3 sm:col-span-2">
            <label className="flex items-center gap-3 rounded-xl border border-stone-200 p-3 text-sm font-medium">
              <input type="checkbox" name="createIntervention" className="size-5 accent-brand-600" checked={makeIntervention} onChange={(e) => setMakeIntervention(e.target.checked)} />
              Registrar intervenção recomendada a partir desta inspeção
            </label>
            {makeIntervention && <SelectField name="interventionType" label="Tipo de intervenção" options={INTERVENTION_TYPES} />}
          </div>
        )}
      </FormSection>
      <p className="text-sm text-stone-500">Fotos podem ser adicionadas logo após salvar.</p>
      <FormActions cancelHref={inspection ? `/inspecoes/${inspection.id}` : treeCode ? `/arvores/${treeCode}` : "/inspecoes"} />
    </ActionForm>
  );
}
