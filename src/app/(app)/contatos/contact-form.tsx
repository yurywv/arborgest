"use client";
import type { Contact } from "@prisma/client";
import { ActionForm, Checkbox, Field, FormActions, FormSection, SelectField, TextArea } from "@/components/form";
import { CONTACT_TYPE, type Option } from "@/lib/catalogs";
import { saveContact } from "./actions";

export function ContactForm({ contact, clients, clientId }: { contact?: Contact; clients: Option[]; clientId?: string }) {
  const c: Partial<Contact> = contact ?? {};
  return (
    <ActionForm action={saveContact.bind(null, contact?.id ?? null)} className="space-y-4">
      <FormSection title="Contato">
        <SelectField name="clientId" label="Cliente" required options={clients} defaultValue={c.clientId ?? clientId} wrapClassName="sm:col-span-2" />
        <Field name="name" label="Nome" required defaultValue={c.name} />
        <SelectField name="type" label="Classificação" required placeholder={false} defaultValue={c.type ?? "GERAL"}
          options={Object.entries(CONTACT_TYPE).map(([value, label]) => ({ value, label }))}
          hint="Administrativo, comercial, técnico ou geral." />
        <Field name="jobTitle" label="Cargo" defaultValue={c.jobTitle} />
        <Field name="phone" label="Telefone" type="tel" defaultValue={c.phone} />
        <Field name="mobile" label="Celular" type="tel" defaultValue={c.mobile} />
        <Field name="whatsapp" label="WhatsApp" type="tel" defaultValue={c.whatsapp} />
        <Field name="email" label="E-mail" type="email" defaultValue={c.email} />
        <div className="sm:col-span-2"><Checkbox name="isPrimary" label="Contato principal do cliente" defaultChecked={c.isPrimary} /></div>
        <TextArea name="notes" label="Observações" defaultValue={c.notes} wrapClassName="sm:col-span-2" />
      </FormSection>
      <FormActions cancelHref={clientId || c.clientId ? `/clientes/${clientId ?? c.clientId}` : "/contatos"} />
    </ActionForm>
  );
}
