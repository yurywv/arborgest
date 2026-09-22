"use client";
import { useState } from "react";
import { SelectField } from "@/components/form";
import type { Option } from "@/lib/catalogs";

/** Selects encadeados Cliente → Propriedade (→ Setor opcional). */
export function ClientPropertySelect({
  clients, properties, sectors, clientId, propertyId, sectorId, propertyRequired, withSector, clientRequired = true,
}: {
  clients: Option[];
  properties: (Option & { clientId: string })[];
  sectors?: (Option & { propertyId: string })[];
  clientId?: string | null;
  propertyId?: string | null;
  sectorId?: string | null;
  propertyRequired?: boolean;
  withSector?: boolean;
  clientRequired?: boolean;
}) {
  const initialClient = clientId ?? properties.find((p) => p.value === propertyId)?.clientId ?? "";
  const [client, setClient] = useState(initialClient);
  const [property, setProperty] = useState(propertyId ?? "");
  const props = properties.filter((p) => !client || p.clientId === client);
  const secs = (sectors ?? []).filter((s) => s.propertyId === property).map((s) => ({ ...s, label: s.label.split(" › ").pop()! }));
  return (
    <>
      <SelectField key={`c-${client}`} name="clientId" label="Cliente" required={clientRequired} options={clients} defaultValue={client}
        onChange={(e) => { setClient(e.target.value); setProperty(""); }} />
      <SelectField key={`p-${client}-${property}`} name="propertyId" label="Propriedade" required={propertyRequired} options={props} defaultValue={property}
        onChange={(e) => setProperty(e.target.value)} />
      {withSector && (
        <SelectField key={`s-${property}`} name="sectorId" label="Setor / área" options={secs} defaultValue={sectorId && secs.some((s) => s.value === sectorId) ? sectorId : ""}
          placeholder={property ? (secs.length ? "Selecione…" : "Propriedade sem setores") : "Escolha a propriedade"} />
      )}
    </>
  );
}
