"use server";

import { z } from "zod";
import { ContractStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { nextContractNumber } from "@/lib/counters";
import { enumVals, formObject, keysOf, optDate, optEnum, optId, optNum, optStr, reqDate, reqEnum, reqStr, runAction, fieldError, finish } from "@/lib/actions";
import { PERIODICITY } from "@/lib/catalogs";
import type { ActionState } from "@/lib/action-state";

const schema = z
  .object({
    number: optStr(40),
    clientId: reqStr("Cliente", 40),
    propertyId: optId(),
    startDate: reqDate("Data de início"),
    endDate: optDate(),
    value: optNum({ min: 0 }),
    periodicity: optEnum(keysOf(PERIODICITY)),
    object: reqStr("Objeto", 2000),
    ownerId: optId(),
    status: reqEnum(enumVals(ContractStatus), "Status"),
    notes: optStr(4000),
  })
  .refine((d) => !d.endDate || d.endDate >= d.startDate, { path: ["endDate"], message: "A data final deve ser posterior ao início." });

export async function saveContract(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  let savedId = id;
  const res = await runAction(async () => {
    const user = await assertPermission("contracts:write");
    const d = schema.parse(formObject(fd));
    if (d.propertyId) {
      const p = await db.property.findUnique({ where: { id: d.propertyId } });
      if (p?.clientId !== d.clientId) return fieldError("propertyId", "A propriedade não pertence ao cliente.");
    }
    const data = { ...d, number: d.number ?? (await nextContractNumber()) };
    const c = id ? await db.contract.update({ where: { id }, data }) : await db.contract.create({ data });
    savedId = c.id;
    await audit(user.id, id ? "UPDATE" : "CREATE", "Contract", c.id, c.number);
  });
  return finish(res, `/contratos/${savedId}`);
}

export async function deleteContract(id: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("contracts:delete");
    const c = await db.contract.delete({ where: { id } });
    await audit(user.id, "DELETE", "Contract", id, c.number);
  });
}
