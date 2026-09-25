"use client";
import type { Species } from "@prisma/client";
import { ActionForm, Checkbox, Field, FormActions, FormSection, SelectField, TextArea } from "@/components/form";
import { SPECIES_ORIGIN } from "@/lib/catalogs";
import { saveSpecies } from "./actions";

export function SpeciesForm({ species }: { species?: Species }) {
  const s: Partial<Species> = species ?? {};
  return (
    <ActionForm action={saveSpecies.bind(null, species?.id ?? null)} className="space-y-4">
      <FormSection title="Espécie">
        <Field name="scientificName" label="Nome científico" required defaultValue={s.scientificName} className="italic" />
        <Field name="popularName" label="Nome popular" required defaultValue={s.popularName} />
        <Field name="family" label="Família botânica" defaultValue={s.family} />
        <Field name="genus" label="Gênero" defaultValue={s.genus} hint="Em branco: extraído do nome científico." />
        <Field name="epithet" label="Epíteto específico" defaultValue={s.epithet} />
        <SelectField name="origin" label="Origem" options={SPECIES_ORIGIN} defaultValue={s.origin} />
        <Field name="nativeRange" label="Distribuição de origem" defaultValue={s.nativeRange} wrapClassName="sm:col-span-2" />
        <div className="sm:col-span-2"><Checkbox name="invasive" label="Espécie invasora" defaultChecked={s.invasive} /></div>
        <TextArea name="notes" label="Observações" defaultValue={s.notes} wrapClassName="sm:col-span-2" />
      </FormSection>
      <FormActions cancelHref="/especies" />
    </ActionForm>
  );
}
