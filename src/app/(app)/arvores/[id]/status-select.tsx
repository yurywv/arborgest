"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TreeStatus } from "@prisma/client";
import { TREE_STATUS } from "@/lib/catalogs";
import { changeTreeStatus } from "../actions";

export function TreeStatusSelect({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <select
      aria-label="Alterar status"
      defaultValue={status}
      disabled={pending}
      className="input min-h-9 w-auto py-1 text-sm font-semibold"
      onChange={(e) => {
        const v = e.target.value;
        if (!confirm(`Alterar status para "${TREE_STATUS[v]}"?`)) {
          e.target.value = status;
          return;
        }
        start(async () => {
          const r = await changeTreeStatus(id, v as TreeStatus);
          if (r && !r.ok) alert(r.message);
          router.refresh();
        });
      }}
    >
      {Object.entries(TREE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}
