"use client";
import { useState } from "react";
import type { PricingEstimate } from "@prisma/client";
import { ActionForm, Field, FormActions, FormSection, SelectField, TextArea } from "@/components/form";
import type { Option } from "@/lib/catalogs";
import { toInputDate } from "@/lib/format";
import { createEstimate, updateEstimateHeader } from "./actions";

type Linked = Option & { clientId: string };

export function EstimateForm({ estimate, clients, properties, contacts, opportunities, users, defaults, margin }: {
  estimate?: PricingEstimate; clients: Option[]; properties: Linked[]; contacts: Linked[]; opportunities: Linked[]; users: Option[];
  /** Presente quando o usuário pode definir a margem (criação). defaultPct = margem padrão dos parâmetros, em %. */
  margin?: { defaultPct: string };
  defaults?: { clientId?: string; propertyId?: string; opportunityId?: string; contactId?: string; title?: string };
}) {
  const e: Partial<PricingEstimate> = estimate ?? {};
  const [clientId, setClientId] = useState(e.clientId ?? defaults?.clientId ?? "");
  const of = (l: Linked[]) => l.filter((x) => x.clientId === clientId);
  const validDefault = e.validUntil ?? new Date(Date.now() + 30 * 86_400_000);
  return (
    <ActionForm action={estimate ? updateEstimateHeader.bind(null, estimate.id) : createEstimate} className="space-y-4">
      <FormSection title="Cliente e vínculos" description="Cliente → propriedade → oportunidade. A propriedade habilita a seleção direta de árvores.">
        <Field name="title" label="Título" defaultValue={e.title ?? defaults?.title} placeholder="Ex.: Manejo arbóreo 2026 — áreas comuns" wrapClassName="sm:col-span-2" />
        <SelectField name="clientId" label="Cliente" required options={clients} defaultValue={clientId} onChange={(ev) => setClientId(ev.target.value)} wrapClassName="sm:col-span-2" />
        <SelectField key={`p-${clientId}`} name="propertyId" label="Propriedade" options={of(properties)} defaultValue={e.propertyId ?? defaults?.propertyId} placeholder={clientId ? "Sem propriedade específica" : "Selecione o cliente"} disabled={!clientId} />
        <SelectField key={`c-${clientId}`} name="contactId" label="Contato" options={of(contacts)} defaultValue={e.contactId ?? defaults?.contactId} placeholder={clientId ? "—" : "Selecione o cliente"} disabled={!clientId} />
        <SelectField key={`o-${clientId}`} name="opportunityId" label="Oportunidade" options={of(opportunities)} defaultValue={e.opportunityId ?? defaults?.opportunityId} placeholder={clientId ? "Sem oportunidade" : "Selecione o cliente"} disabled={!clientId} />
        <Field name="validUntil" label="Validade" type="date" defaultValue={toInputDate(validDefault)} />
      </FormSection>
      {margin && !estimate && (
        <FormSection title="Margem de lucro" description="Aplicada a todos os serviços deste orçamento e das propostas emitidas a partir dele.">
          <Field name="marginPercent" label="Margem de lucro (%)" inputMode="decimal" placeholder={margin.defaultPct} suffix="%"
            hint={`Em branco = margem padrão (${margin.defaultPct}%). Não pode ser negativa; sempre menor que 100%. Margem sobre o preço de venda.`} />
        </FormSection>
      )}
      <FormSection title="Responsáveis">
        <SelectField name="commercialOwnerId" label="Responsável comercial" options={users} defaultValue={e.commercialOwnerId} placeholder="Eu mesmo" />
        <SelectField name="technicalOwnerId" label="Responsável técnico" options={users} defaultValue={e.technicalOwnerId} placeholder="—" />
      </FormSection>
      <FormSection title="Observações">
        <TextArea name="internalNotes" label="Observações internas" hint="Não aparecem na proposta." defaultValue={e.internalNotes} wrapClassName="sm:col-span-2" />
        <TextArea name="commercialNotes" label="Observações comerciais" hint="Sugeridas na proposta." defaultValue={e.commercialNotes} wrapClassName="sm:col-span-2" />
      </FormSection>
      <FormActions cancelHref={estimate ? `/precificacao/${estimate.id}` : "/precificacao"} />
    </ActionForm>
  );
}
