"use client";
import { useFormCtx } from "@/components/form";
import type { TreeOption } from "@/lib/options";

/** Campo de árvore com autocompletar por código/espécie/propriedade (aceita digitar o código ARB). */
export function TreePicker({ trees, defaultCode, name = "treeCode", label = "Árvore", required = true }: {
  trees: TreeOption[]; defaultCode?: string; name?: string; label?: string; required?: boolean;
}) {
  const { errors } = useFormCtx();
  return (
    <div className="sm:col-span-2">
      <label className="label" htmlFor={`f-${name}`}>{label}{required && <span className="text-red-600"> *</span>}</label>
      <input id={`f-${name}`} name={name} list={`dl-${name}`} defaultValue={defaultCode} autoComplete="off"
        placeholder="Digite o código (ARB-000001) ou a espécie" className={`input font-mono ${errors?.[name] ? "input-error" : ""}`} />
      <datalist id={`dl-${name}`}>
        {trees.map((t) => <option key={t.id} value={t.code}>{t.label}</option>)}
      </datalist>
      {errors?.[name] && <p className="mt-1 text-xs font-medium text-red-600">{errors[name]}</p>}
    </div>
  );
}
