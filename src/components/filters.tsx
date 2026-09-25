"use client";
import { Search, SlidersHorizontal } from "lucide-react";
import type { Option } from "@/lib/catalogs";

/** Formulário GET que reenvia ao mudar um select (filtros na URL = compartilháveis). */
export function FilterForm({ children, action }: { children: React.ReactNode; action?: string }) {
  return (
    <form
      action={action}
      className="card mb-4 flex flex-wrap items-end gap-2 p-3"
      onChange={(e) => {
        if (e.target instanceof HTMLSelectElement) (e.currentTarget as HTMLFormElement).requestSubmit();
      }}
    >
      {children}
      <button type="submit" className="btn btn-secondary btn-sm min-h-10 sm:hidden">
        <SlidersHorizontal className="size-4" /> Filtrar
      </button>
    </form>
  );
}

export function SearchBox({ defaultValue, label = "Buscar" }: { defaultValue?: string; label?: string }) {
  return (
    <div className="relative min-w-48 flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
      <input name="q" type="search" defaultValue={defaultValue} className="input min-h-10 pl-9" aria-label={label} autoComplete="off" />
    </div>
  );
}

export function FilterSelect({ name, label, options, value }: { name: string; label: string; options: Option[]; value?: string }) {
  return (
    <label className="min-w-36 flex-1 sm:flex-none">
      <span className="mb-0.5 block text-[11px] font-medium text-stone-500">{label}</span>
      <select name={name} defaultValue={value ?? ""} className="input min-h-10 py-1.5">
        <option value="">Todos</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
