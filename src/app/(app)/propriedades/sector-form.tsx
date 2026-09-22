"use client";
import type { Sector } from "@prisma/client";
import { ActionForm, Field, NumberField, SubmitButton, TextArea } from "@/components/form";
import { LocationInput } from "@/components/map/location-input";
import { saveSector } from "./actions";

export function SectorForm({ propertyId, sector, fallback }: { propertyId: string; sector?: Sector; fallback?: [number, number] }) {
  const s: Partial<Sector> = sector ?? {};
  return (
    <ActionForm action={saveSector.bind(null, propertyId, sector?.id ?? null)} resetOnSuccess={!sector} refreshOnSuccess className="grid gap-4 sm:grid-cols-2">
      <Field name="name" label="Nome do setor/área" required defaultValue={s.name} placeholder="Ex.: Bloco A, Estacionamento Norte" />
      <NumberField name="approxArea" label="Área aproximada" suffix="m²" defaultValue={s.approxArea} />
      <TextArea name="description" label="Descrição" rows={2} defaultValue={s.description} wrapClassName="sm:col-span-2" />
      <LocationInput simple value={{ latitude: s.latitude, longitude: s.longitude }} fallback={fallback} />
      <div className="sm:col-span-2"><SubmitButton>{sector ? "Salvar setor" : "Adicionar setor"}</SubmitButton></div>
    </ActionForm>
  );
}
