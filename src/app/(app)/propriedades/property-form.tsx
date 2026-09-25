"use client";
import type { Property } from "@prisma/client";
import { ActionForm, Checkbox, Field, FormActions, FormSection, NumberField, SelectField, TextArea } from "@/components/form";
import { LocationInput } from "@/components/map/location-input";
import { PROPERTY_OWNERSHIP, PROPERTY_TYPES, UFS, type Option } from "@/lib/catalogs";
import { saveProperty } from "./actions";

export function PropertyForm({ property, clients, clientId }: { property?: Property; clients: Option[]; clientId?: string }) {
  const p: Partial<Property> = property ?? {};
  return (
    <ActionForm action={saveProperty.bind(null, property?.id ?? null)} className="space-y-4">
      <FormSection title="Propriedade">
        <SelectField name="clientId" label="Cliente" required options={clients} defaultValue={p.clientId ?? clientId} wrapClassName="sm:col-span-2" />
        <Field name="name" label="Nome da propriedade" required defaultValue={p.name} wrapClassName="sm:col-span-2" />
        <SelectField name="ownership" label="Identificação da propriedade" required options={PROPERTY_OWNERSHIP} defaultValue={p.ownership} hint="Pública (área de órgão público, praça, via) ou privada." />
        <SelectField name="propertyType" label="Tipo" options={PROPERTY_TYPES} defaultValue={p.propertyType} />
        <NumberField name="totalArea" label="Área total" suffix="m²" defaultValue={p.totalArea} />
        <Field name="localManager" label="Responsável local" defaultValue={p.localManager} />
        <Field name="phone" label="Telefone" type="tel" defaultValue={p.phone} />
        <div className="sm:col-span-2"><Checkbox name="active" label="Propriedade ativa" defaultChecked={p.active ?? true} /></div>
      </FormSection>
      <FormSection title="Endereço">
        <Field name="address" label="Logradouro" defaultValue={p.address} hint="Sem o número — informe-o no campo ao lado." wrapClassName="sm:col-span-2" />
        <Field name="number" label="Número" defaultValue={p.number} />
        <Field name="complement" label="Complemento" defaultValue={p.complement} />
        <Field name="district" label="Bairro" defaultValue={p.district} />
        <Field name="city" label="Cidade" defaultValue={p.city} />
        <SelectField name="state" label="UF" options={UFS} defaultValue={p.state} />
        <Field name="zipCode" label="CEP" inputMode="numeric" defaultValue={p.zipCode} />
      </FormSection>
      <FormSection title="Localização central" description="Usada para centralizar o mapa da propriedade.">
        <LocationInput simple value={{ latitude: p.latitude, longitude: p.longitude }} />
        <TextArea name="notes" label="Observações" defaultValue={p.notes} wrapClassName="sm:col-span-2" />
      </FormSection>
      <FormActions cancelHref={property ? `/propriedades/${property.id}` : "/propriedades"} />
    </ActionForm>
  );
}
