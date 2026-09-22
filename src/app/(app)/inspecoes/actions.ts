"use server";

import { z } from "zod";
import { Condition, Priority, type FindingCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { refreshTreeCache } from "@/lib/tree-cache";
import { resolveTreeCode } from "@/lib/trees";
import { bool, enumVals, formObject, keysOf, optDate, optEnum, optId, optNum, optStr, reqDate, reqEnum, runAction, fieldError, finish } from "@/lib/actions";
import { FINDINGS_BY_CATEGORY, INSPECTION_REASONS, INTERVENTION_TYPES, LEVEL3 } from "@/lib/catalogs";
import type { ActionState } from "@/lib/action-state";

const cond = () => optEnum(enumVals(Condition));
const CATS = Object.keys(FINDINGS_BY_CATEGORY) as FindingCategory[];

const schema = z.object({
  inspectedAt: reqDate("Data da inspeção"),
  inspectorId: optId(),
  reason: optEnum(keysOf(INSPECTION_REASONS)),
  generalCondition: reqEnum(enumVals(Condition), "Condição geral"),
  rootCondition: cond(),
  trunkCondition: cond(),
  crownCondition: cond(),
  phytoCondition: cond(),
  trunkLeanDegrees: optNum({ min: 0, max: 90 }),
  deadBranchesPercent: optNum({ min: 0, max: 100 }),
  phytoSeverity: optEnum(keysOf(LEVEL3)),
  probableDiagnosis: optStr(500),
  confirmedDiagnosis: optStr(500),
  problems: optStr(4000),
  recommendation: optStr(4000),
  priority: reqEnum(enumVals(Priority), "Prioridade"),
  nextInspectionAt: optDate(),
  notes: optStr(4000),
  createIntervention: bool(),
  interventionType: optEnum(keysOf(INTERVENTION_TYPES)),
});

function findingsFrom(fd: FormData) {
  return CATS.flatMap((category) => {
    const valid = new Set(FINDINGS_BY_CATEGORY[category].options.map((o) => o.value));
    return fd.getAll(`f_${category}`).map(String).filter((c) => valid.has(c)).map((code) => ({ category, code }));
  });
}

export async function saveInspection(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  let savedId = id;
  const res = await runAction(async () => {
    const user = await assertPermission("inspections:write");
    const tree = id ? await db.inspection.findUniqueOrThrow({ where: { id }, select: { treeId: true } }).then((i) => ({ id: i.treeId })) : await resolveTreeCode(fd.get("treeCode"));
    if (!tree) return fieldError("treeCode", "Árvore não encontrada.");
    const { createIntervention, interventionType, ...d } = schema.parse(formObject(fd));
    if (createIntervention && !interventionType) return fieldError("interventionType", "Escolha o tipo de intervenção.");
    if (d.nextInspectionAt && d.nextInspectionAt < d.inspectedAt) return fieldError("nextInspectionAt", "Deve ser posterior à inspeção.");

    // Próxima inspeção padrão: intervalo configurado (reduzido para árvores em pior condição).
    if (!d.nextInspectionAt) {
      const months = Number((await getSettings()).inspection_interval_months) || 12;
      const factor = d.generalCondition === "CRITICA" ? 0.25 : d.generalCondition === "RUIM" ? 0.5 : 1;
      d.nextInspectionAt = new Date(d.inspectedAt.getTime() + Math.round(months * factor * 30.4) * 86_400_000);
    }
    const findings = findingsFrom(fd);
    const data = { ...d, inspectorId: d.inspectorId ?? user.id };

    await db.$transaction(async (tx) => {
      if (id) {
        await tx.inspectionFinding.deleteMany({ where: { inspectionId: id } });
        await tx.inspection.update({ where: { id }, data: { ...data, findings: { create: findings } } });
      } else {
        const i = await tx.inspection.create({ data: { ...data, treeId: tree.id, findings: { create: findings } } });
        savedId = i.id;
        if (createIntervention && interventionType) {
          await tx.intervention.create({
            data: {
              treeId: tree.id, type: interventionType, status: "RECOMENDADA", priority: d.priority, recommendedAt: d.inspectedAt,
              description: d.recommendation ?? "Recomendada em inspeção.",
            },
          });
        }
      }
    });
    await refreshTreeCache(tree.id);
    await audit(user.id, id ? "UPDATE" : "CREATE", "Inspection", savedId, `${findings.length} achados`);
  });
  return finish(res, `/inspecoes/${savedId}${id ? "" : "?nova=1"}`);
}

export async function deleteInspection(id: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("inspections:delete");
    const i = await db.inspection.delete({ where: { id } });
    await refreshTreeCache(i.treeId);
    await audit(user.id, "DELETE", "Inspection", id);
  });
}
