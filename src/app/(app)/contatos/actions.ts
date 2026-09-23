"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { ContactType } from "@prisma/client";
import { bool, enumVals, reqEnum, formObject, optEmail, optStr, reqStr, runAction, finish } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";

const schema = z.object({
  clientId: reqStr("Cliente", 40),
  name: reqStr("Nome", 150),
  type: reqEnum(enumVals(ContactType), "Classificação"),
  jobTitle: optStr(100),
  phone: optStr(30),
  mobile: optStr(30),
  whatsapp: optStr(30),
  email: optEmail(),
  isPrimary: bool(),
  notes: optStr(2000),
});

export async function saveContact(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  let clientId = "";
  const res = await runAction(async () => {
    const user = await assertPermission("clients:write");
    const data = schema.parse(formObject(fd));
    clientId = data.clientId;
    await db.$transaction(async (tx) => {
      if (data.isPrimary) await tx.contact.updateMany({ where: { clientId: data.clientId, NOT: id ? { id } : undefined }, data: { isPrimary: false } });
      const c = id ? await tx.contact.update({ where: { id }, data }) : await tx.contact.create({ data });
      await audit(user.id, id ? "UPDATE" : "CREATE", "Contact", c.id, c.name);
    });
  });
  return finish(res, `/clientes/${clientId}`);
}

export async function deleteContact(id: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("clients:write");
    await db.contact.delete({ where: { id } });
    await audit(user.id, "DELETE", "Contact", id);
  });
}
