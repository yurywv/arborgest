import { CONDITION, RISK_LEVEL, TREE_STATUS, enumOptions, type Option } from "@/lib/catalogs";
import { spGet, type SP } from "@/lib/query";
import { FilterForm, FilterSelect, SearchBox } from "./filters";

export function TreeFilters({ sp, options, action, hideSearch, hidden }: {
  sp: SP;
  options: { clients: Option[]; properties: (Option & { clientId: string })[]; sectors: (Option & { propertyId: string })[]; species: Option[] };
  action?: string;
  hideSearch?: boolean;
  hidden?: Record<string, string>;
}) {
  const clientId = spGet(sp, "cliente");
  const propertyId = spGet(sp, "propriedade");
  const properties = clientId ? options.properties.filter((p) => p.clientId === clientId) : options.properties;
  const sectors = propertyId ? options.sectors.filter((s) => s.propertyId === propertyId) : options.sectors;
  const withNone = (o: Option[], label: string) => [...o, { value: "SEM", label }];
  return (
    <FilterForm action={action}>
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {!hideSearch && <SearchBox defaultValue={spGet(sp, "q")} />}
      <FilterSelect name="cliente" label="Cliente" options={options.clients} value={clientId} />
      <FilterSelect name="propriedade" label="Propriedade" options={properties} value={propertyId} />
      <FilterSelect name="setor" label="Setor" options={sectors} value={spGet(sp, "setor")} />
      <FilterSelect name="especie" label="Espécie" options={options.species} value={spGet(sp, "especie")} />
      <FilterSelect name="status" label="Status" options={enumOptions(TREE_STATUS)} value={spGet(sp, "status")} />
      <FilterSelect name="condicao" label="Condição" options={withNone(enumOptions(CONDITION), "Sem avaliação")} value={spGet(sp, "condicao")} />
      <FilterSelect name="risco" label="Risco" options={withNone(enumOptions(RISK_LEVEL), "Sem avaliação")} value={spGet(sp, "risco")} />
      <FilterSelect name="pendente" label="Intervenção pendente" options={[{ value: "sim", label: "Com pendência" }]} value={spGet(sp, "pendente")} />
      <FilterSelect name="inspecao" label="Inspeção" options={[{ value: "vencida", label: "Vencida" }, { value: "30dias", label: "Próximos 30 dias" }, { value: "sem", label: "Nunca inspecionada" }]} value={spGet(sp, "inspecao")} />
    </FilterForm>
  );
}
