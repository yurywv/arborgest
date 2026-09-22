"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { bool, formObject, keysOf, optEnum, optStr, reqStr, runAction, finish } from "@/lib/actions";
import { SPECIES_ORIGIN } from "@/lib/catalogs";
import type { ActionState } from "@/lib/action-state";

const schema = z.object({
  scientificName: reqStr("Nome científico", 150),
  popularName: reqStr("Nome popular", 150),
  family: optStr(100),
  genus: optStr(100),
  epithet: optStr(100),
  origin: optEnum(keysOf(SPECIES_ORIGIN)),
  nativeRange: optStr(200),
  invasive: bool(),
  notes: optStr(2000),
});

export async function saveSpecies(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    const user = await assertPermission("species:write");
    const d = schema.parse(formObject(fd));
    const [g, e] = d.scientificName.split(/\s+/);
    const data = { ...d, genus: d.genus ?? g ?? null, epithet: d.epithet ?? e ?? null };
    const s = id ? await db.species.update({ where: { id }, data }) : await db.species.create({ data });
    await audit(user.id, id ? "UPDATE" : "CREATE", "Species", s.id, s.scientificName);
  });
  return finish(res, "/especies");
}

export async function deleteSpecies(id: string): Promise<ActionState> {
  return runAction(async () => {
    await assertPermission("species:write");
    const n = await db.tree.count({ where: { speciesId: id } });
    if (n) return { ok: false, message: `Espécie usada por ${n} árvore(s); não pode ser excluída.` };
    await db.species.delete({ where: { id } });
  });
}
