"use client";
import { useState } from "react";
import clsx from "clsx";
import type { RiskAssessment } from "@prisma/client";
import { ActionForm, CheckboxGroup, Field, FormActions, FormSection, SelectField, TextArea } from "@/components/form";
import { TreePicker } from "@/components/tree-picker";
import { COMBINED_LIKELIHOOD, combinedLikelihood, computeRisk } from "@/lib/arbo";
import { CONSEQUENCE, FAILURE_LIKELIHOOD, IMPACT_LIKELIHOOD, RISK_LEVEL, RISK_TARGETS, TARGET_OCCUPANCY, TREE_PARTS, enumOptions, labelOf, type Option } from "@/lib/catalogs";
import type { TreeOption } from "@/lib/options";
import { toInputDate } from "@/lib/format";
import { saveRisk } from "./actions";

const TONE: Record<string, string> = { BAIXO: "bg-emerald-600", MODERADO: "bg-amber-500", ALTO: "bg-orange-600", EXTREMO: "bg-red-700" };

export function RiskForm({ risk, trees, users, treeCode, meId }: { risk?: RiskAssessment; trees: TreeOption[]; users: Option[]; treeCode?: string; meId: string }) {
  const r: Partial<RiskAssessment> = risk ?? {};
  const [failure, setFailure] = useState(r.failureLikelihood ?? "");
  const [impact, setImpact] = useState(r.impactLikelihood ?? "");
  const [consequence, setConsequence] = useState(r.consequence ?? "");
  const [override, setOverride] = useState(r.riskRating ?? "");
  const computed = computeRisk(failure, impact, consequence);
  const combined = combinedLikelihood(failure, impact);

  return (
    <ActionForm action={saveRisk.bind(null, risk?.id ?? null)} className="space-y-4">
      <FormSection title="Avaliação" description="Metodologia ISA TRAQ: probabilidade de falha × impacto × consequência.">
        {!risk && <TreePicker trees={trees} defaultCode={treeCode} />}
        <Field name="assessedAt" type="date" label="Data" required defaultValue={toInputDate(r.assessedAt ?? new Date())} />
        <SelectField name="assessorId" label="Técnico" options={users} defaultValue={r.assessorId ?? meId} />
      </FormSection>
      <FormSection title="Alvo">
        <div className="sm:col-span-2"><CheckboxGroup name="targets" label="Alvos potenciais" options={RISK_TARGETS} defaultValues={r.targets ?? []} columns={3} /></div>
        <SelectField name="targetOccupancy" label="Frequência (ocupação) do alvo" required options={TARGET_OCCUPANCY} defaultValue={r.targetOccupancy} />
        <SelectField name="partAtRisk" label="Parte com possibilidade de falha" required options={TREE_PARTS} defaultValue={r.partAtRisk} />
      </FormSection>
      <FormSection title="Classificação">
        <SelectField name="failureLikelihood" label="Probabilidade de falha" required options={FAILURE_LIKELIHOOD} defaultValue={failure} onChange={(e) => setFailure(e.target.value)} />
        <SelectField name="impactLikelihood" label="Probabilidade de impacto" required options={IMPACT_LIKELIHOOD} defaultValue={impact} onChange={(e) => setImpact(e.target.value)} />
        <SelectField name="consequence" label="Consequência" required options={CONSEQUENCE} defaultValue={consequence} onChange={(e) => setConsequence(e.target.value)} />
        <div className="rounded-xl bg-stone-100 p-3 text-sm">
          <p className="text-xs text-stone-500">Falha × impacto</p>
          <p className="font-semibold">{combined !== null ? COMBINED_LIKELIHOOD[combined] : "—"}</p>
          <p className="mt-1 text-xs text-stone-500">Risco pela matriz</p>
          {computed ? <span className={clsx("inline-block rounded-full px-3 py-1 text-sm font-bold text-white", TONE[computed])}>{RISK_LEVEL[computed]}</span> : <span>—</span>}
        </div>
        <SelectField name="riskRating" label="Classificação de risco" options={enumOptions(RISK_LEVEL)} defaultValue={override}
          placeholder={computed ? `Usar matriz (${RISK_LEVEL[computed]})` : "Usar matriz"} onChange={(e) => setOverride(e.target.value)}
          hint={override && computed && override !== computed ? `Ajuste manual: matriz indica ${labelOf(enumOptions(RISK_LEVEL), computed)}. Justifique nas observações.` : undefined} />
        <SelectField name="residualRisk" label="Risco residual (após mitigação)" options={enumOptions(RISK_LEVEL)} defaultValue={r.residualRisk} />
        <TextArea name="recommendedAction" label="Ação recomendada" defaultValue={r.recommendedAction} wrapClassName="sm:col-span-2" />
        <TextArea name="notes" label="Observações" defaultValue={r.notes} wrapClassName="sm:col-span-2" />
      </FormSection>
      <FormActions cancelHref={risk ? `/riscos/${risk.id}` : treeCode ? `/arvores/${treeCode}?aba=riscos` : "/riscos"} />
    </ActionForm>
  );
}
