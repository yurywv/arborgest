"use client";
import { ActionForm, Field, SelectField, SubmitButton, TextArea } from "@/components/form";
import { OPPORTUNITY_ACTIVITY_TYPES, type Option } from "@/lib/catalogs";
import { addOpportunityActivity } from "../actions";

export function ActivityForm({ opportunityId, contacts }: { opportunityId: string; contacts: Option[] }) {
  return (
    <ActionForm action={addOpportunityActivity.bind(null, opportunityId)} className="grid gap-3 sm:grid-cols-2" resetOnSuccess refreshOnSuccess>
      <SelectField name="type" label="Ação" required options={OPPORTUNITY_ACTIVITY_TYPES} />
      <Field name="occurredAt" label="Data e hora" type="datetime-local" required />
      <SelectField name="contactId" label="Contato do cliente" options={contacts} placeholder="—" wrapClassName="sm:col-span-2" />
      <TextArea name="description" label="Descrição" required rows={3} wrapClassName="sm:col-span-2" />
      <div className="sm:col-span-2"><SubmitButton>Registrar ação</SubmitButton></div>
    </ActionForm>
  );
}
