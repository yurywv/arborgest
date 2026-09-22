"use client";
import type { Opportunity } from "@prisma/client";
import { ActionForm, Field, FormActions, FormSection, NumberField, SelectField, TextArea } from "@/components/form";
import { OPPORTUNITY_SOURCES, OPPORTUNITY_STAGE, SERVICES, enumOptions, type Option } from "@/lib/catalogs";
import { toInputDate } from "@/lib/format";
import { saveOpportunity } from "./actions";

type Opp = Omit<Opportunity, "estimatedValue"> & { estimatedValue: number | null };

export function OpportunityForm({ opp, clients, users, clientId }: { opp?: Opp; clients: Option[]; users: Option[]; clientId?: string }) {
  const o: Partial<Opp> = opp ?? {};
  return (
    <ActionForm action={saveOpportunity.bind(null, opp?.id ?? null)} className="space-y-4">
      <FormSection title="Oportunidade">
        <SelectField name="clientId" label="Cliente" required options={clients} defaultValue={o.clientId ?? clientId} wrapClassName="sm:col-span-2" />
        <Field name="description" label="Descrição" required defaultValue={o.description} wrapClassName="sm:col-span-2" />
        <SelectField name="service" label="Serviço" options={SERVICES} defaultValue={o.service} />
        <NumberField name="estimatedValue" label="Valor estimado (R$)" defaultValue={o.estimatedValue} />
        <SelectField name="stage" label="Estágio" required options={enumOptions(OPPORTUNITY_STAGE)} defaultValue={o.stage ?? "LEAD"} placeholder={false} />
        <NumberField name="probability" label="Probabilidade (%)" decimals={false} defaultValue={o.probability} hint="Em branco: padrão do estágio." />
        <SelectField name="ownerId" label="Responsável" options={users} defaultValue={o.ownerId} />
        <Field name="expectedDate" type="date" label="Data prevista" defaultValue={toInputDate(o.expectedDate)} />
        <SelectField name="source" label="Origem" options={OPPORTUNITY_SOURCES} defaultValue={o.source} />
        <TextArea name="notes" label="Observações" defaultValue={o.notes} wrapClassName="sm:col-span-2" />
      </FormSection>
      <FormActions cancelHref="/oportunidades" />
    </ActionForm>
  );
}
