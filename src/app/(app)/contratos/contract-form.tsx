"use client";
import type { Contract } from "@prisma/client";
import { ActionForm, Field, FormActions, FormSection, NumberField, SelectField, TextArea } from "@/components/form";
import { ClientPropertySelect } from "@/components/client-property-select";
import { CONTRACT_STATUS, PERIODICITY, enumOptions, type Option } from "@/lib/catalogs";
import { toInputDate } from "@/lib/format";
import { saveContract } from "./actions";

type C = Omit<Contract, "value"> & { value: number | null };

export function ContractForm({ contract, clients, properties, users, clientId }: {
  contract?: C; clients: Option[]; properties: (Option & { clientId: string })[]; users: Option[]; clientId?: string;
}) {
  const c: Partial<C> = contract ?? {};
  return (
    <ActionForm action={saveContract.bind(null, contract?.id ?? null)} className="space-y-4">
      <FormSection title="Contrato">
        <Field name="number" label="Número do contrato" defaultValue={c.number} hint="Em branco: gerado automaticamente (CT-AAAA-0000)." />
        <SelectField name="status" label="Status" required options={enumOptions(CONTRACT_STATUS)} defaultValue={c.status ?? "ATIVO"} placeholder={false} />
        <ClientPropertySelect clients={clients} properties={properties} clientId={c.clientId ?? clientId} propertyId={c.propertyId} />
        <Field name="startDate" type="date" label="Data de início" required defaultValue={toInputDate(c.startDate)} />
        <Field name="endDate" type="date" label="Data final" defaultValue={toInputDate(c.endDate)} />
        <NumberField name="value" label="Valor (R$)" defaultValue={c.value} />
        <SelectField name="periodicity" label="Periodicidade" options={PERIODICITY} defaultValue={c.periodicity} />
        <SelectField name="ownerId" label="Responsável" options={users} defaultValue={c.ownerId} />
        <TextArea name="object" label="Objeto" required rows={3} defaultValue={c.object} wrapClassName="sm:col-span-2" />
        <TextArea name="notes" label="Observações" defaultValue={c.notes} wrapClassName="sm:col-span-2" />
      </FormSection>
      <FormActions cancelHref={contract ? `/contratos/${contract.id}` : "/contratos"} />
    </ActionForm>
  );
}
