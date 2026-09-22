"use client";
import type { Tree } from "@prisma/client";
import { ActionForm, Field, FormActions, FormSection } from "@/components/form";
import { LocationInput } from "@/components/map/location-input";
import { saveTreeLocation } from "../../actions";

export function TreeLocationForm({ tree, fallback }: { tree: Tree; fallback?: [number, number] }) {
  return (
    <ActionForm action={saveTreeLocation.bind(null, tree.id)} className="space-y-4">
      <FormSection title="Localização do exemplar" description="Fique ao lado do tronco, com o celular parado, e toque em capturar. Repita se a precisão estiver ruim.">
        <LocationInput value={{ ...tree, gpsCapturedAt: tree.gpsCapturedAt?.toISOString() ?? null }} fallback={fallback} />
        <Field name="address" label="Endereço" defaultValue={tree.address} wrapClassName="sm:col-span-2" />
        <Field name="physicalRef" label="Referência física" defaultValue={tree.physicalRef} wrapClassName="sm:col-span-2" />
      </FormSection>
      <FormActions cancelHref={`/arvores/${tree.code}`} />
    </ActionForm>
  );
}
