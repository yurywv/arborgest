"use server";

import { z } from "zod";
import { RiskLevel } from "@prisma/client";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { computeRisk } from "@/lib/arbo";
import { refreshTreeCache } from "@/lib/tree-cache";
import { resolveTreeCode } from "@/lib/trees";
import { enumVals, fieldError, formObject, keysOf, optEnum, optId, optStr, reqDate, reqEnum, runAction, finish } from "@/lib/actions";
import { CONSEQUENCE, FAILURE_LIKELIHOOD, IMPACT_LIKELIHOOD, RISK_TARGETS, TARGET_OCCUPANCY, TREE_PARTS } from "@/lib/catalogs";
import type { ActionState } from "@/lib/action-state";

const schema = z.object({
  assessedAt: reqDate("Data"),
  assessorId: optId(),
  targets: z.array(z.enum(keysOf(RISK_TARGETS))).min(1, "Selecione ao menos um alvo."),
  targetOccupancy: reqEnum(keysOf(TARGET_OCCUPANCY), "Frequência do alvo"),
  partAtRisk: reqEnum(keysOf(TREE_PARTS), "Parte com possibilidade de falha"),
  failureLikelihood: reqEnum(keysOf(FAILURE_LIKELIHOOD), "Probabilidade de falha"),
  impactLikelihood: reqEnum(keysOf(IMPACT_LIKELIHOOD), "Probabilidade de impacto"),
  consequence: reqEnum(keysOf(CONSEQUENCE), "Consequência"),
  riskRating: optEnum(enumVals(RiskLevel)),
  recommendedAction: optStr(4000),
  residualRisk: optEnum(enumVals(RiskLevel)),
  notes: optStr(4000),
});

export async function saveRisk(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  let savedId = id;
  const res = await runAction(async () => {
    const user = await assertPermission("risk:write");
    const tree = id ? await db.riskAssessment.findUniqueOrThrow({ where: { id } }).then((r) => ({ id: r.treeId })) : await resolveTreeCode(fd.get("treeCode"));
    if (!tree) return fieldError("treeCode", "Árvore não encontrada.");
    const d = schema.parse(formObject(fd, ["targets"]));
    // Classificação pela matriz ISA TRAQ; o avaliador pode ajustar com justificativa.
    const data = { ...d, assessorId: d.assessorId ?? user.id, riskRating: d.riskRating ?? computeRisk(d.failureLikelihood, d.impactLikelihood, d.consequence)! };
    const r = id ? await db.riskAssessment.update({ where: { id }, data }) : await db.riskAssessment.create({ data: { ...data, treeId: tree.id } });
    savedId = r.id;
    await refreshTreeCache(tree.id);
    await audit(user.id, id ? "UPDATE" : "CREATE", "RiskAssessment", r.id, r.riskRating);
  });
  return finish(res, `/riscos/${savedId}`);
}

export async function deleteRisk(id: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("risk:delete");
    const r = await db.riskAssessment.delete({ where: { id } });
    await refreshTreeCache(r.treeId);
    await audit(user.id, "DELETE", "RiskAssessment", id);
  });
}
