"use client";
import { ActionForm, FormActions, FormSection } from "@/components/form";
import { saveMeasurement } from "../../actions";
import { MeasurementFields } from "../../measurement-fields";

export function MeasurementForm({ treeId, code }: { treeId: string; code: string }) {
  return (
    <ActionForm action={saveMeasurement.bind(null, treeId)} className="space-y-4">
      <FormSection title="Biometria" description="Cada medição fica no histórico; a ficha exibe a mais recente.">
        <MeasurementFields />
      </FormSection>
      <FormActions cancelHref={`/arvores/${code}?aba=biometria`} />
    </ActionForm>
  );
}
