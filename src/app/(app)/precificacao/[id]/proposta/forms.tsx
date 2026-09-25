"use client";
import { ActionForm, Checkbox, Field, FormActions, FormSection, SelectField, SubmitButton, TextArea } from "@/components/form";
import type { Option } from "@/lib/catalogs";
import { toInputDate } from "@/lib/format";
import { createProposal, sendProposal } from "./actions";

export type ProposalDraft = {
  title: string; object: string; scope: string; contactId: string | null; validUntil: Date | null; deadline: string; paymentTerms: string;
  conditions: string; assumptions: string; exclusions: string; responsibilities: string; notes: string;
};

export function ProposalForm({ estimateId, draft, contacts }: { estimateId: string; draft: ProposalDraft; contacts: Option[] }) {
  return (
    <ActionForm action={createProposal.bind(null, estimateId)} className="space-y-4">
      <FormSection title="Documento" description="Custos internos, margens e salários NÃO aparecem na proposta.">
        <Field name="title" label="Título" required defaultValue={draft.title} wrapClassName="sm:col-span-2" />
        <SelectField name="contactId" label="Aos cuidados de (contato)" options={contacts} defaultValue={draft.contactId} placeholder="—" />
        <Field name="validUntil" label="Validade" type="date" defaultValue={draft.validUntil ? toInputDate(draft.validUntil) : undefined} hint="Em branco: validade do orçamento." />
        <TextArea name="object" label="Objeto" required rows={3} defaultValue={draft.object} wrapClassName="sm:col-span-2" />
        <TextArea name="scope" label="Escopo" rows={5} defaultValue={draft.scope} wrapClassName="sm:col-span-2" />
      </FormSection>
      <FormSection title="Condições">
        <TextArea name="deadline" label="Prazo" rows={2} defaultValue={draft.deadline} />
        <TextArea name="paymentTerms" label="Forma de pagamento" rows={2} defaultValue={draft.paymentTerms} />
        <TextArea name="conditions" label="Condições comerciais" rows={3} defaultValue={draft.conditions} wrapClassName="sm:col-span-2" />
        <TextArea name="assumptions" label="Premissas" rows={3} defaultValue={draft.assumptions} wrapClassName="sm:col-span-2" />
        <TextArea name="exclusions" label="Exclusões" rows={3} defaultValue={draft.exclusions} wrapClassName="sm:col-span-2" />
        <TextArea name="responsibilities" label="Responsabilidades" rows={3} defaultValue={draft.responsibilities} wrapClassName="sm:col-span-2" />
        <TextArea name="notes" label="Observações" rows={3} defaultValue={draft.notes} wrapClassName="sm:col-span-2" />
      </FormSection>
      <FormActions cancelHref={`/precificacao/${estimateId}?aba=proposta`}><SubmitButton className="flex-1 md:flex-none">Gerar proposta</SubmitButton></FormActions>
    </ActionForm>
  );
}

export function SendProposalForm({ proposalId, smtp }: { proposalId: string; smtp: boolean }) {
  return (
    <ActionForm action={sendProposal.bind(null, proposalId)} className="space-y-3" refreshOnSuccess>
      <Field name="to" label="Destinatário(s)" hint="Separe vários e-mails por vírgula." />
      <TextArea name="message" label="Mensagem" rows={3} />
      <Checkbox name="byEmail" label="Enviar por e-mail com o PDF anexo"
        hint={smtp ? "Usa o SMTP configurado." : "SMTP não configurado — apenas registra o envio (baixe o PDF e envie manualmente)."} />
      <SubmitButton>Registrar envio</SubmitButton>
    </ActionForm>
  );
}
