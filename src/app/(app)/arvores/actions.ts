"use server";

import { z } from "zod";
import { TreeStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { nextTreeCode } from "@/lib/counters";
import { refreshTreeCache } from "@/lib/tree-cache";
import { crownArea, dapFromCap, equivalentDap } from "@/lib/arbo";
import {
  enumVals, formObject, keysOf, optDate, optEnum, optId, optInt, optNum, optStr, reqDate, reqEnum, reqStr, runAction, UserError, finish,
} from "@/lib/actions";
import {
  CONFLICTS, COORD_SOURCES, DRAINAGE, ID_CONFIDENCE, LEVEL3, PAVEMENT_TYPES, SITE_TYPES, SUN_EXPOSURE,
} from "@/lib/catalogs";
import type { ActionState } from "@/lib/action-state";

const location = {
  latitude: optNum({ min: -90, max: 90 }),
  longitude: optNum({ min: -180, max: 180 }),
  gpsAccuracy: optNum({ min: 0, max: 10000 }),
  altitude: optNum({ min: -500, max: 9000 }),
  gpsCapturedAt: optDate(),
  coordSource: optEnum(keysOf(COORD_SOURCES)),
};

const latLngPair = <T extends { latitude: number | null; longitude: number | null }>(d: T) =>
  (d.latitude === null) === (d.longitude === null);
const pairMsg = { path: ["longitude"], message: "Informe latitude e longitude juntas." };

const treeSchema = z
  .object({
    propertyId: reqStr("Propriedade", 40),
    sectorId: optId(),
    status: reqEnum(enumVals(TreeStatus), "Status"),
    responsibleId: optId(),
    ...location,
    address: optStr(300),
    addressNumber: optStr(20),
    physicalRef: optStr(300),
    speciesId: optId(),
    cultivar: optStr(120),
    identificationConfidence: optEnum(keysOf(ID_CONFIDENCE)),
    botanicalNotes: optStr(2000),
    siteType: optEnum(keysOf(SITE_TYPES)),
    pavementType: optEnum(keysOf(PAVEMENT_TYPES)),
    permeableArea: optNum({ min: 0 }),
    sidewalkWidth: optNum({ min: 0, max: 100 }),
    bedWidth: optNum({ min: 0, max: 100 }),
    bedLength: optNum({ min: 0, max: 1000 }),
    soilVolume: optNum({ min: 0 }),
    soilCompaction: optEnum(keysOf(LEVEL3)),
    drainage: optEnum(keysOf(DRAINAGE)),
    sunExposure: optEnum(keysOf(SUN_EXPOSURE)),
    conflicts: z.array(z.enum(keysOf(CONFLICTS))).max(30),
    conflictNotes: optStr(2000),
    notes: optStr(4000),
  })
  .refine(latLngPair, pairMsg);

async function checkSector(propertyId: string, sectorId: string | null) {
  if (!sectorId) return;
  const s = await db.sector.findUnique({ where: { id: sectorId } });
  if (s?.propertyId !== propertyId) throw new UserError("O setor selecionado não pertence à propriedade.");
}

export async function saveTree(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  let code = "";
  const makeLabel = !id && fd.get("makeLabel") === "on";
  const res = await runAction(async () => {
    const user = await assertPermission("trees:write");
    const data = treeSchema.parse(formObject(fd, ["conflicts"]));
    await checkSector(data.propertyId, data.sectorId);
    if (id) {
      const t = await db.tree.update({ where: { id }, data });
      code = t.code;
      await audit(user.id, "UPDATE", "Tree", id, t.code);
    } else {
      const m = buildMeasurement(fd, "m_");
      code = await nextTreeCode();
      const t = await db.tree.create({ data: { ...data, code, responsibleId: data.responsibleId ?? user.id } });
      if (m) {
        await db.treeMeasurement.create({ data: { ...m, treeId: t.id, measuredById: user.id } });
        await refreshTreeCache(t.id);
      }
      await audit(user.id, "CREATE", "Tree", t.id, code);
      if (makeLabel) await audit(user.id, "QRCODE", "Tree", t.id, `Etiqueta QR Code gerada — ${code}`);
    }
  });
  return finish(res, makeLabel ? `/arvores/${code}/qrcode?nova=1` : `/arvores/${code}`);
}

const locationSchema = z.object({ ...location, address: optStr(300), addressNumber: optStr(20), physicalRef: optStr(300) }).refine(latLngPair, pairMsg);

export async function saveTreeLocation(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let code = "";
  const res = await runAction(async () => {
    const user = await assertPermission("trees:write");
    const data = locationSchema.parse(formObject(fd));
    if (data.latitude === null) throw new UserError("Capture ou informe as coordenadas.");
    const t = await db.tree.update({ where: { id }, data });
    code = t.code;
    await audit(user.id, "UPDATE", "Tree", id, `localização ${data.latitude}, ${data.longitude} ±${data.gpsAccuracy ?? "?"} m`);
  });
  return finish(res, `/arvores/${code}?aba=localizacao`);
}

export async function changeTreeStatus(id: string, status: TreeStatus): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("trees:write");
    if (!enumVals(TreeStatus).includes(status)) throw new UserError("Status inválido.");
    const t = await db.tree.update({ where: { id }, data: { status } });
    await audit(user.id, "UPDATE", "Tree", id, `status → ${status}`);
  });
}

export async function deleteTree(id: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("trees:delete");
    const t = await db.tree.findUniqueOrThrow({ where: { id }, include: { _count: { select: { inspections: true, interventions: true, workOrders: true } } } });
    const history = t._count.inspections + t._count.interventions + t._count.workOrders;
    if (history > 0) {
      throw new UserError("Esta árvore possui histórico técnico. Em vez de excluir, altere o status para Removida/Morta/Substituída — o código é permanente.");
    }
    await db.tree.delete({ where: { id } });
    // O contador não é decrementado: o código ARB jamais será reutilizado.
    await audit(user.id, "DELETE", "Tree", id, t.code);
  });
}

// ── Biometria (histórico em TreeMeasurement) ──

/** "32; 28,5; 15" ou "32 28.5 15" → [32, 28.5, 15] */
const parseDaps = (v: unknown) =>
  String(v ?? "")
    .split(/[;\s]+/)
    .map((s) => Number(s.replace(",", ".").replace(/\.$/, "")))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 50);

const measurementSchema = z.object({
  measuredAt: reqDate("Data da medição"),
  cap: optNum({ min: 0, max: 3000 }),
  dap: optNum({ min: 0, max: 1000 }),
  measurementHeight: optNum({ min: 0, max: 5 }),
  stemCount: optInt({ min: 1, max: 50 }),
  totalHeight: optNum({ min: 0, max: 120 }),
  stemHeight: optNum({ min: 0, max: 100 }),
  crownBaseHeight: optNum({ min: 0, max: 100 }),
  crownDiameterNS: optNum({ min: 0, max: 100 }),
  crownDiameterEW: optNum({ min: 0, max: 100 }),
  notes: optStr(2000),
});

/** Monta a medição a partir do formulário (campos com prefixo opcional). Retorna null se vazia. */
function buildMeasurement(fd: FormData, prefix = "") {
  const raw: Record<string, unknown> = {};
  for (const k of Object.keys(measurementSchema.shape)) raw[k] = fd.get(prefix + k);
  if (!raw.measuredAt) raw.measuredAt = new Date().toISOString().slice(0, 10);
  const parsed = measurementSchema.safeParse(raw);
  if (!parsed.success) {
    // Reprefixa os caminhos para destacar o campo correto no formulário.
    throw new z.ZodError(parsed.error.issues.map((i) => ({ ...i, path: [prefix + String(i.path[0])] })));
  }
  const d = parsed.data;
  const stemDaps = parseDaps(fd.get(prefix + "stemDaps"));
  // Regra: CAP informado → DAP = CAP / π. Multifuste → DAP equivalente √Σd².
  let dap = d.cap ? dapFromCap(d.cap) : d.dap;
  if (stemDaps.length > 1) dap = equivalentDap(stemDaps);
  if (!dap && !d.totalHeight && !d.crownDiameterNS && !d.crownDiameterEW) return null;
  return {
    ...d, dap, stemDaps,
    stemCount: stemDaps.length > 1 ? stemDaps.length : d.stemCount ?? 1,
    crownArea: crownArea(d.crownDiameterNS, d.crownDiameterEW),
  };
}

export async function saveMeasurement(treeId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let code = "";
  const res = await runAction(async () => {
    const user = await assertPermission("trees:write");
    const m = buildMeasurement(fd);
    if (!m) throw new UserError("Informe ao menos CAP/DAP, altura ou copa.");
    const dap = m.dap;
    await db.treeMeasurement.create({ data: { ...m, treeId, measuredById: user.id } });
    await refreshTreeCache(treeId);
    code = (await db.tree.findUniqueOrThrow({ where: { id: treeId }, select: { code: true } })).code;
    await audit(user.id, "CREATE", "TreeMeasurement", treeId, `DAP ${dap ?? "-"} cm`);
  });
  return finish(res, `/arvores/${code}?aba=biometria`);
}

export async function deleteMeasurement(id: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("trees:delete");
    const m = await db.treeMeasurement.delete({ where: { id } });
    await refreshTreeCache(m.treeId);
    await audit(user.id, "DELETE", "TreeMeasurement", id);
  });
}
