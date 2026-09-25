"use client";
import { ActionForm, Field, FormActions, FormSection, SelectField, TextArea } from "@/components/form";
import { CLIENT_TYPES, CLIENT_STATUS, SEGMENTS, UFS, enumOptions } from "@/lib/catalogs";
import { formatDocument } from "@/lib/format";
import { saveClient } from "./actions";
import type { Client } from "@prisma/client";

export function ClientForm({ client }: { client?: Client }) {
  const c: Partial<Client> = client ?? {};
  return (
    <ActionForm action={saveClient.bind(null, client?.id ?? null)} className="space-y-4">
      <FormSection title="Identificação">
        <Field name="legalName" label="Razão social / nome" required defaultValue={c.legalName} wrapClassName="sm:col-span-2" />
        <Field name="tradeName" label="Nome fantasia" defaultValue={c.tradeName} />
        <Field name="document" label="CPF/CNPJ" inputMode="numeric" defaultValue={c.document ? formatDocument(c.document) : ""} />
        <SelectField name="clientType" label="Tipo de cliente" required options={CLIENT_TYPES} defaultValue={c.clientType ?? "PJ"} />
        <SelectField name="segment" label="Segmento" options={SEGMENTS} defaultValue={c.segment} />
        <SelectField name="status" label="Status" required options={enumOptions(CLIENT_STATUS)} defaultValue={c.status ?? "ATIVO"} placeholder={false} />
      </FormSection>
      <FormSection title="Contato">
        <Field name="phone" label="Telefone" type="tel" defaultValue={c.phone} />
        <Field name="email" label="E-mail" type="email" defaultValue={c.email} />
        <Field name="website" label="Site" defaultValue={c.website} wrapClassName="sm:col-span-2" />
      </FormSection>
      <FormSection title="Endereço">
        <Field name="address" label="Logradouro" defaultValue={c.address} wrapClassName="sm:col-span-2" />
        <Field name="addressNumber" label="Número" defaultValue={c.addressNumber} />
        <Field name="addressComplement" label="Complemento" defaultValue={c.addressComplement} />
        <Field name="district" label="Bairro" defaultValue={c.district} />
        <Field name="city" label="Cidade" defaultValue={c.city} />
        <SelectField name="state" label="Estado" options={UFS} defaultValue={c.state} />
        <Field name="zipCode" label="CEP" inputMode="numeric" defaultValue={c.zipCode} />
        <TextArea name="notes" label="Observações" defaultValue={c.notes} wrapClassName="sm:col-span-2" />
      </FormSection>
      <FormActions cancelHref={client ? `/clientes/${client.id}` : "/clientes"} />
    </ActionForm>
  );
}
