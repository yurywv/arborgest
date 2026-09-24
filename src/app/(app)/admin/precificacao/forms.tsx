"use client";
import { ActionForm, FormSection, SubmitButton, TextArea } from "@/components/form";
import { PROPOSAL_TEXT_LABELS, type ProposalTextKey } from "@/lib/pricing/proposal-texts";
import { saveProposalTexts } from "./actions";

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
