import { db } from "./db";

/** Incremento atômico (INSERT ... ON CONFLICT). Valores nunca são reutilizados. */
export async function nextCounter(key: string): Promise<number> {
  const rows = await db.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return Number(rows[0].value);
}

export async function nextTreeCode() {
  const n = await nextCounter("tree");
  return `ARB-${String(n).padStart(6, "0")}`;
}

export async function nextWorkOrderNumber() {
  const year = new Date().getFullYear();
  const n = await nextCounter(`workorder:${year}`);
  return `OS-${year}-${String(n).padStart(4, "0")}`;
}

export async function nextContractNumber() {
  const year = new Date().getFullYear();
  const n = await nextCounter(`contract:${year}`);
  return `CT-${year}-${String(n).padStart(4, "0")}`;
}
