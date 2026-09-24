import "server-only";
import { db } from "@/lib/db";
import { PROPOSAL_TEXT_DEFAULTS, type ProposalTextKey } from "./proposal-texts";

export async function getProposalTexts() {
  const rows = await db.setting.findMany({ where: { key: { in: Object.keys(PROPOSAL_TEXT_DEFAULTS) } } });
  const out = { ...PROPOSAL_TEXT_DEFAULTS } as Record<ProposalTextKey, string>;
  for (const r of rows) out[r.key as ProposalTextKey] = r.value;
  return out;
}
