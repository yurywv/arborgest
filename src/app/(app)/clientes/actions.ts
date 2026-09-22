"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { formObject, keysOf, optEmail, optStr, optUrl, reqEnum, reqStr, runAction, validCpfCnpj, optEnum, enumVals, finish } from "@/lib/actions";
import { CLIENT_TYPES, SEGMENTS, UFS } from "@/lib/catalogs";
import { ClientStatus } from "@prisma/client";
import type { ActionState } from "@/lib/action-state";

const schema = z.object({
  legalName: reqStr("Razão social", 200),
  tradeName: optStr(200),
  document: z.preprocess(
    (v) => (typeof v === "string" && v.replace(/\D/g, "") ? v.replace(/\D/g, "") : null),
    z.string().refine(validCpfCnpj, "CPF/CNPJ inválido.").nullable(),
  ),
  clientType: reqEnum(keysOf(CLIENT_TYPES), "Tipo de cliente"),
  segment: optEnum(keysOf(SEGMENTS)),
  phone: optStr(30),
  email: optEmail(),
  website: optUrl(),
  address: optStr(200),
  district: optStr(100),
  city: optStr(100),
  state: optEnum(keysOf(UFS)),
  zipCode: optStr(10),
  notes: optStr(4000),
  status: reqEnum(enumVals(ClientStatus), "Status"),
});

export async function saveClient(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  let savedId = id;
  const res = await runAction(async () => {
    const user = await assertPermission("clients:write");
    const data = schema.parse(formObject(fd));
    if (id) {
      await db.client.update({ where: { id }, data });
      await audit(user.id, "UPDATE", "Client", id, data.legalName);
    } else {
      const c = await db.client.create({ data });
      savedId = c.id;
      await audit(user.id, "CREATE", "Client", c.id, data.legalName);
    }
  });
  return finish(res, `/clientes/${savedId}`);
}

export async function deleteClient(id: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("clients:delete");
    const c = await db.client.delete({ where: { id } });
    await audit(user.id, "DELETE", "Client", id, c.legalName);
  });
}
