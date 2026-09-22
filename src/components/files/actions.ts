"use server";

import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { runAction } from "@/lib/actions";
import { deleteObject } from "@/lib/storage";
import { refreshTreeCache } from "@/lib/tree-cache";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/lib/action-state";

export async function deletePhoto(id: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("files:delete");
    const p = await db.photo.delete({ where: { id } });
    await deleteObject(p.storageKey);
    if (p.treeId) await refreshTreeCache(p.treeId);
    await audit(user.id, "DELETE", "Photo", id);
  });
}

export async function setCoverPhoto(treeId: string, photoId: string): Promise<ActionState> {
  return runAction(async () => {
    await assertPermission("trees:write");
    await db.tree.update({ where: { id: treeId }, data: { coverPhotoId: photoId } });
  });
}

export async function deleteDocument(id: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("files:delete");
    const d = await db.document.delete({ where: { id } });
    await deleteObject(d.storageKey);
    await audit(user.id, "DELETE", "Document", id, d.fileName);
  });
}
