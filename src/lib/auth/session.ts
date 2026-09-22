import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession } from "./jwt";
import { hasPermission, type Permission } from "./permissions";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  roleKey: string;
  roleName: string;
  permissions: string[];
};

/** Usuário da requisição atual (memoizado por requisição). Valida ativo + versão da sessão. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await db.user.findUnique({ where: { id: session.sub }, include: { role: true } });
  if (!user || !user.active || user.sessionVersion !== session.sv) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    jobTitle: user.jobTitle,
    roleKey: user.role.key,
    roleName: user.role.name,
    permissions: user.role.permissions,
  };
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Para páginas: redireciona para /sem-permissao se faltar a permissão. */
export async function requirePermission(p: Permission) {
  const user = await requireUser();
  if (!hasPermission(user.permissions, p)) redirect("/sem-permissao");
  return user;
}

export class ForbiddenError extends Error {
  constructor(message = "Você não tem permissão para esta ação.") {
    super(message);
  }
}

/** Para server actions / route handlers: lança erro em vez de redirecionar. */
export async function assertPermission(p: Permission) {
  const user = await getCurrentUser();
  if (!user) throw new ForbiddenError("Sessão expirada. Entre novamente.");
  if (!hasPermission(user.permissions, p)) throw new ForbiddenError();
  return user;
}

export async function createSession(userId: string, sessionVersion: number) {
  const token = await signSession({ sub: userId, sv: sessionVersion });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}
