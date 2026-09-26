"use client";
import { ActionForm, CheckboxGroup, Field, FormActions, FormSection, SelectField, SubmitButton, TextArea } from "@/components/form";
import type { Option } from "@/lib/catalogs";
import { sendClientEmail } from "./actions";

export function ComposeForm({ clientId, contacts, to, contactId, docs, proposals, from, back, disabled }: {
  clientId: string; contacts: Option[]; to: string; contactId: string | null; docs: Option[]; proposals: Option[];
  from: string | null; back: string; disabled: boolean;
}) {
  return (
    <ActionForm action={sendClientEmail} className="space-y-4">
      <input type="hidden" name="clientId" value={clientId} />
      <FormSection title="Mensagem" description={from ? `Enviado por ${from} (Gmail).` : undefined}>
        <Field name="to" label="Para" required defaultValue={to} hint="Separe vários e-mails por vírgula." wrapClassName="sm:col-span-2" />
        <Field name="cc" label="Cópia (Cc)" wrapClassName="sm:col-span-2" />
        <SelectField name="contactId" label="Contato do cliente" options={contacts} defaultValue={contactId} placeholder="—" wrapClassName="sm:col-span-2" />
        <Field name="subject" label="Assunto" required wrapClassName="sm:col-span-2" />
        <TextArea name="body" label="Mensagem" required rows={10} wrapClassName="sm:col-span-2" />
      </FormSection>
      {(docs.length > 0 || proposals.length > 0) && (
        <FormSection title="Anexos" description="Documentos e propostas deste cliente. Limite de 20 MB por e-mail.">
          {proposals.length > 0 && <div className="sm:col-span-2"><CheckboxGroup name="proposalIds" label="Propostas (PDF)" options={proposals} columns={1} /></div>}
          {docs.length > 0 && <div className="sm:col-span-2"><CheckboxGroup name="docIds" label="Documentos" options={docs} columns={1} /></div>}
        </FormSection>
      )}
      <FormActions cancelHref={back}>{!disabled && <SubmitButton className="flex-1 md:flex-none">Enviar e-mail</SubmitButton>}</FormActions>
    </ActionForm>
  );
}
