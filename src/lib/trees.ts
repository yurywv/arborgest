import "server-only";
import { db } from "./db";

/** Resolve árvore pelo código permanente (ARB-000001) ou pelo id interno. */
export async function findTreeId(idOrCode: string) {
  const key = decodeURIComponent(idOrCode).trim();
  const t = await db.tree.findFirst({
    where: /^ARB-\d+$/i.test(key) ? { code: key.toUpperCase() } : { id: key },
    select: { id: true, code: true },
  });
  return t;
}

/** Resolve o campo "treeCode" de formulários; lança erro de validação amigável. */
export async function resolveTreeCode(raw: FormDataEntryValue | null) {
  const s = String(raw ?? "").trim().toUpperCase();
  const code = /^\d+$/.test(s) ? `ARB-${s.padStart(6, "0")}` : s.match(/ARB-\d+/)?.[0];
  if (!code) return null;
  return db.tree.findUnique({ where: { code }, select: { id: true, code: true, propertyId: true, property: { select: { clientId: true } } } });
}
