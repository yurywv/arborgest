// Recalcula os campos de cache "estado atual" da árvore a partir das tabelas históricas.
// Chamado após criar/editar/excluir medições, inspeções, avaliações de risco e fotos.
import type { PrismaClient } from "@prisma/client";
import { db as defaultDb } from "./db";

export async function refreshTreeCache(treeId: string, db: PrismaClient = defaultDb) {
  const [m, insp, risk, cover] = await Promise.all([
    db.treeMeasurement.findFirst({ where: { treeId }, orderBy: { measuredAt: "desc" } }),
    db.inspection.findFirst({ where: { treeId }, orderBy: { inspectedAt: "desc" } }),
    db.riskAssessment.findFirst({ where: { treeId }, orderBy: { assessedAt: "desc" } }),
    db.photo.findFirst({ where: { treeId }, orderBy: [{ type: "asc" }, { takenAt: "desc" }] }),
  ]);
  const generalPhoto = await db.photo.findFirst({ where: { treeId, type: "GERAL" }, orderBy: { takenAt: "desc" } });
  const crown =
    m?.crownDiameterNS && m?.crownDiameterEW
      ? (m.crownDiameterNS + m.crownDiameterEW) / 2
      : m?.crownDiameterNS ?? m?.crownDiameterEW ?? null;

  await db.tree.update({
    where: { id: treeId },
    data: {
      currentDap: m?.dap ?? null,
      currentHeight: m?.totalHeight ?? null,
      currentCrownDiam: crown,
      currentCondition: insp?.generalCondition ?? null,
      lastInspectionAt: insp?.inspectedAt ?? null,
      nextInspectionAt: insp?.nextInspectionAt ?? null,
      currentRisk: risk?.riskRating ?? null,
      coverPhotoId: (generalPhoto ?? cover)?.id ?? null,
    },
  });
}
