"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OpportunityStage } from "@prisma/client";
import { OPPORTUNITY_STAGE } from "@/lib/catalogs";
import { moveOpportunity } from "./actions";

export function StageSelect({ id, stage }: { id: string; stage: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <select
      aria-label="Mover para estágio"
      defaultValue={stage}
      disabled={pending}
      className="input min-h-9 py-1 text-xs"
      onChange={(e) =>
        start(async () => {
          const r = await moveOpportunity(id, e.target.value as OpportunityStage);
          if (r && !r.ok) alert(r.message);
          router.refresh();
        })
      }
    >
      {Object.entries(OPPORTUNITY_STAGE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}
