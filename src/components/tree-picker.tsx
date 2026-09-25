"use client";
import { SearchSelectField } from "@/components/form";
import type { TreeOption } from "@/lib/options";

/** Seleção de árvore cadastrada (busca por código, espécie ou propriedade). Não sugere conteúdo: lista apenas registros existentes. */
export function TreePicker({ trees, defaultCode, name = "treeCode", label = "Árvore", required = true }: {
  trees: TreeOption[]; defaultCode?: string; name?: string; label?: string; required?: boolean;
}) {
  return (
    <SearchSelectField name={name} label={label} required={required} defaultValue={defaultCode}
      options={trees.map((t) => ({ value: t.code, label: t.label }))} wrapClassName="sm:col-span-2" />
  );
}
