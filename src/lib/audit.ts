import "server-only";
import { db } from "./db";
import { clientIp } from "./auth/session";

/** Log básico de auditoria. Falhas de log nunca quebram a operação principal. */
export async function audit(
  userId: string | null,
  action: string,
  entity: string,
  entityId?: string | null,
  summary?: string,
) {
  try {
    await db.auditLog.create({
      data: { userId, action, entity, entityId: entityId ?? null, summary, ip: await clientIp() },
    });
  } catch (e) {
    console.error("[audit] falha ao registrar log", e);
  }
}
