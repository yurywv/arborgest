"use client";
import Link from "next/link";
import type { Tree } from "@prisma/client";
import { ActionForm, Checkbox, CheckboxGroup, Field, FormActions, FormSection, NumberField, SearchSelectField, SelectField, TextArea } from "@/components/form";
import { ClientPropertySelect } from "@/components/client-property-select";
import { LocationInput } from "@/components/map/location-input";
import {
  CONFLICTS, DRAINAGE, ID_CONFIDENCE, LEVEL3, PAVEMENT_TYPES, SITE_TYPES, SUN_EXPOSURE, TREE_STATUS, enumOptions, type Option,
} from "@/lib/catalogs";
import { saveTree } from "./actions";
import { MeasurementFields } from "./measurement-fields";

export function TreeForm({
  tree, clients, properties, sectors, species, users, propertyId, fallback,
}: {
  tree?: Tree;
  clients: Option[];
  properties: (Option & { clientId: string })[];
  sectors: (Option & { propertyId: string })[];
  species: Option[];
  users: Option[];
  propertyId?: string;
  fallback?: [number, number];
}) {
  const t: Partial<Tree> = tree ?? {};
  return (
    <ActionForm action={saveTree.bind(null, tree?.id ?? null)} className="space-y-4">
      <FormSection title="Identificação" description={tree ? `Código permanente: ${tree.code}` : "O código ARB-000000 é gerado automaticamente e nunca é reutilizado."}>
        <ClientPropertySelect clients={clients} properties={properties} sectors={sectors} withSector propertyRequired clientRequired={false}
          propertyId={t.propertyId ?? propertyId} sectorId={t.sectorId} />
        <SelectField name="status" label="Status" required options={enumOptions(TREE_STATUS)} defaultValue={t.status ?? "ATIVA"} placeholder={false} />
        <SelectField name="responsibleId" label="Técnico responsável" options={users} defaultValue={t.responsibleId} placeholder="Eu mesmo" />
      </FormSection>

      <FormSection title="Localização" description="WGS84 / EPSG:4326. Em campo, use o botão para capturar pelo GPS do celular.">
        <LocationInput value={{ ...t, gpsCapturedAt: t.gpsCapturedAt ? new Date(t.gpsCapturedAt).toISOString() : null }} fallback={fallback} />
        <Field name="address" label="Logradouro" defaultValue={t.address} />
        <Field name="addressNumber" label="Número" defaultValue={t.addressNumber} />
        <Field name="physicalRef" label="Referência física" defaultValue={t.physicalRef} wrapClassName="sm:col-span-2" />
      </FormSection>

      <FormSection title="Identificação botânica">
        <SearchSelectField name="speciesId" label="Espécie" options={species} defaultValue={t.speciesId} emptyLabel="Não identificada — digite o nome popular ou científico"
          hint={<>{species.length} espécies no catálogo. Não encontrou? <Link href="/especies/nova" target="_blank" className="link">Cadastrar espécie</Link></>} wrapClassName="sm:col-span-2" />
        <Field name="cultivar" label="Cultivar" defaultValue={t.cultivar} />
        <SelectField name="identificationConfidence" label="Confiança da identificação" options={ID_CONFIDENCE} defaultValue={t.identificationConfidence} />
        <TextArea name="botanicalNotes" label="Observação botânica" rows={2} defaultValue={t.botanicalNotes} wrapClassName="sm:col-span-2" />
      </FormSection>

      {!tree && (
        <FormSection title="Biometria inicial (opcional)" description="Registrada no histórico de medições do exemplar.">
          <MeasurementFields prefix="m_" showDate={false} showNotes={false} />
        </FormSection>
      )}

      <FormSection title="Local de implantação">
        <SelectField name="siteType" label="Tipo de local" options={SITE_TYPES} defaultValue={t.siteType} />
        <SelectField name="pavementType" label="Tipo de pavimento" options={PAVEMENT_TYPES} defaultValue={t.pavementType} />
        <NumberField name="permeableArea" label="Área permeável" suffix="m²" defaultValue={t.permeableArea} />
        <NumberField name="sidewalkWidth" label="Largura da calçada" suffix="m" defaultValue={t.sidewalkWidth} />
        <NumberField name="bedWidth" label="Largura do canteiro" suffix="m" defaultValue={t.bedWidth} />
        <NumberField name="bedLength" label="Comprimento do canteiro" suffix="m" defaultValue={t.bedLength} />
        <NumberField name="soilVolume" label="Volume disponível de solo" suffix="m³" defaultValue={t.soilVolume} />
        <SelectField name="soilCompaction" label="Compactação do solo" options={LEVEL3} defaultValue={t.soilCompaction} />
        <SelectField name="drainage" label="Drenagem" options={DRAINAGE} defaultValue={t.drainage} />
        <SelectField name="sunExposure" label="Exposição solar" options={SUN_EXPOSURE} defaultValue={t.sunExposure} />
      </FormSection>

      <FormSection title="Infraestrutura e conflitos">
        <div className="sm:col-span-2">
          <CheckboxGroup name="conflicts" options={CONFLICTS} defaultValues={t.conflicts ?? []} columns={3} />
        </div>
        <TextArea name="conflictNotes" label="Detalhes dos conflitos" rows={2} defaultValue={t.conflictNotes} wrapClassName="sm:col-span-2" />
        <TextArea name="notes" label="Observações gerais" rows={3} defaultValue={t.notes} wrapClassName="sm:col-span-2" />
      </FormSection>

      <FormSection title="Etiqueta QR Code" description={tree
        ? `ID individual ${tree.code}, gravado no QR Code da etiqueta.`
        : "O ID individual (ARB-000000) é criado ao salvar e gravado no QR Code: ao escanear a etiqueta, o celular abre a ficha do exemplar."}>
        {tree
          ? <p className="text-sm sm:col-span-2"><Link className="link" href={`/arvores/${tree.code}/qrcode`}>Ver e imprimir a etiqueta QR Code</Link></p>
          : <div className="sm:col-span-2"><Checkbox name="makeLabel" label="Gerar a etiqueta QR Code ao salvar" hint="Depois de salvar, abre a etiqueta pronta para imprimir ou baixar (PNG)." /></div>}
      </FormSection>

      <FormActions cancelHref={tree ? `/arvores/${tree.code}` : "/arvores"} />
    </ActionForm>
  );
}
