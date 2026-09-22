"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { bool, formObject, keysOf, optEnum, optNum, optStr, reqStr, runAction, finish } from "@/lib/actions";
import { PROPERTY_TYPES, UFS } from "@/lib/catalogs";
import type { ActionState } from "@/lib/action-state";

const lat = () => optNum({ min: -90, max: 90 });
const lng = () => optNum({ min: -180, max: 180 });

const schema = z.object({
  clientId: reqStr("Cliente", 40),
  name: reqStr("Nome da propriedade", 200),
  propertyType: optEnum(keysOf(PROPERTY_TYPES)),
  address: optStr(200),
  number: optStr(20),
  complement: optStr(100),
  district: optStr(100),
  city: optStr(100),
  state: optEnum(keysOf(UFS)),
  zipCode: optStr(10),
  latitude: lat(),
  longitude: lng(),
  notes: optStr(4000),
  totalArea: optNum({ min: 0 }),
  localManager: optStr(150),
  phone: optStr(30),
  active: bool(),
});

export async function saveProperty(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  let savedId = id;
  const res = await runAction(async () => {
    const user = await assertPermission("properties:write");
    const data = schema.parse(formObject(fd));
    const p = id ? await db.property.update({ where: { id }, data }) : await db.property.create({ data });
    savedId = p.id;
    await audit(user.id, id ? "UPDATE" : "CREATE", "Property", p.id, p.name);
  });
  return finish(res, `/propriedades/${savedId}`);
}

export async function deleteProperty(id: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("properties:delete");
    const count = await db.tree.count({ where: { propertyId: id } });
    if (count) return { ok: false, message: `A propriedade possui ${count} árvore(s) cadastrada(s) e não pode ser excluída. Inative-a.` };
    const p = await db.property.delete({ where: { id } });
    await audit(user.id, "DELETE", "Property", id, p.name);
  });
}

const sectorSchema = z.object({
  name: reqStr("Nome do setor", 120),
  description: optStr(1000),
  latitude: lat(),
  longitude: lng(),
  approxArea: optNum({ min: 0 }),
});

export async function saveSector(propertyId: string, id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    const user = await assertPermission("properties:write");
    const data = sectorSchema.parse(formObject(fd));
    const s = id ? await db.sector.update({ where: { id }, data }) : await db.sector.create({ data: { ...data, propertyId } });
    await audit(user.id, id ? "UPDATE" : "CREATE", "Sector", s.id, s.name);
    return { ok: true, message: id ? "Setor atualizado." : "Setor criado." };
  });
  return id ? finish(res, `/propriedades/${propertyId}?aba=setores`) : res;
}

export async function deleteSector(id: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("properties:delete");
    const s = await db.sector.delete({ where: { id } });
    await audit(user.id, "DELETE", "Sector", id, s.name);
  });
}
