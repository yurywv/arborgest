import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { fileUrl } from "./files";
import type { MapPoint } from "@/components/map/types";

/** Busca árvores georreferenciadas e converte para pontos do mapa (com URL da foto de capa). */
export async function loadMapPoints(where: Prisma.TreeWhereInput, take = 5000): Promise<MapPoint[]> {
  const trees = await db.tree.findMany({
    where: { ...where, latitude: { not: null }, longitude: { not: null } },
    take,
    orderBy: { code: "asc" },
    select: {
      id: true, code: true, latitude: true, longitude: true, status: true, currentCondition: true, currentRisk: true,
      currentDap: true, currentHeight: true, lastInspectionAt: true, nextInspectionAt: true, coverPhotoId: true,
      species: { select: { popularName: true, scientificName: true } },
      property: { select: { name: true } },
    },
  });
  const photoIds = trees.map((t) => t.coverPhotoId).filter(Boolean) as string[];
  const photos = photoIds.length ? await db.photo.findMany({ where: { id: { in: photoIds } }, select: { id: true, storageKey: true } }) : [];
  const byId = new Map(photos.map((p) => [p.id, fileUrl(p.storageKey)]));
  return trees.map((t) => ({
    id: t.id,
    code: t.code,
    lat: t.latitude!,
    lng: t.longitude!,
    status: t.status,
    species: t.species?.popularName,
    scientific: t.species?.scientificName,
    condition: t.currentCondition,
    risk: t.currentRisk,
    dap: t.currentDap,
    height: t.currentHeight,
    photoUrl: t.coverPhotoId ? byId.get(t.coverPhotoId) ?? null : null,
    lastInspection: t.lastInspectionAt?.toISOString() ?? null,
    nextInspection: t.nextInspectionAt?.toISOString() ?? null,
    property: t.property.name,
  }));
}
