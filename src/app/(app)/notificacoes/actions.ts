"use server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { runAction } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";

export async function markAllRead(): Promise<ActionState> {
  return runAction(async () => {
    const u = await requireUser();
    await db.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } });
  });
}
