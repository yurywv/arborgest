"use client";
import { useState } from "react";
import { ActionForm, Field, FormSection, SelectField, SubmitButton, TextArea } from "@/components/form";
import { UFS } from "@/lib/catalogs";
import { PROPOSAL_TEXT_LABELS, type ProposalTextKey } from "@/lib/pricing/proposal-texts";
import { saveCompensationRule, saveProposalTexts } from "./actions";

export function ProposalTextsForm({ values }: { values: Record<ProposalTextKey, string> }) {
  return (
    <ActionForm action={saveProposalTexts} className="space-y-4" refreshOnSuccess>
      <FormSection title="Textos padrão da proposta" description="Sugeridos ao gerar cada proposta (podem ser editados caso a caso).">
        {(Object.keys(PROPOSAL_TEXT_LABELS) as ProposalTextKey[]).map((k) => (
          <TextArea key={k} name={k} label={PROPOSAL_TEXT_LABELS[k]} rows={3} defaultValue={values[k]} wrapClassName="sm:col-span-2" />
        ))}
      </FormSection>
      <SubmitButton>Salvar textos</SubmitButton>
    </ActionForm>
  );
}

export type RuleRow = { id: string; city: string; state: string; lawReference: string; seedlingsPerTree: string; freightValue: string | null; notes: string | null };

export function CompensationRuleForm({ rule }: { rule?: RuleRow }) {
  return (
    <ActionForm action={saveCompensationRule.bind(null, rule?.id ?? null)} className="space-y-3" resetOnSuccess={!rule} refreshOnSuccess>
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <Field name="city" label="Município" required defaultValue={rule?.city} />
        <SelectField name="state" label="UF" required options={UFS} defaultValue={rule?.state} />
      </div>
      <Field name="lawReference" label="Lei aplicável" required defaultValue={rule?.lawReference} placeholder="Lei Municipal nº 0000/2020, art. 5º" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="seedlingsPerTree" label="Mudas por árvore suprimida" required inputMode="decimal" defaultValue={rule?.seedlingsPerTree} />
        <Field name="freightValue" label="Frete padrão para a cidade (R$)" inputMode="decimal" defaultValue={rule?.freightValue} hint="Opcional." />
      </div>
      <TextArea name="notes" label="Observações" rows={2} defaultValue={rule?.notes} />
      <SubmitButton>{rule ? "Salvar regra" : "Cadastrar regra"}</SubmitButton>
    </ActionForm>
  );
}

/** Edição sob demanda: o formulário só é montado quando aberto (evita ids de campo duplicados na página). */
export function EditCompensationRule({ rule }: { rule: RuleRow }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? "Fechar edição" : "Editar"}
      </button>
      {open && <div className="mt-2"><CompensationRuleForm rule={rule} /></div>}
    </div>
  );
}
