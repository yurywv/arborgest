"use server";

import { redirect } from "next/navigation";

import crypto from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { runAction, UserError, finish } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { clientIp, createSession, destroySession, getCurrentUser } from "@/lib/auth/session";
import { hashPassword, passwordSchema, verifyPassword } from "@/lib/password";
import { isLimited, rateLimit, resetLimit } from "@/lib/rate-limit";
import { sendMail } from "@/lib/mail";
import { appBaseUrl } from "@/lib/qr";
import type { ActionState } from "@/lib/action-state";

const safeNext = (n: unknown) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard");

export async function login(_: ActionState, fd: FormData): Promise<ActionState> {
  let dest = "/dashboard";
  const res = await runAction(async () => {
    const email = String(fd.get("email") ?? "").trim().toLowerCase();
    const password = String(fd.get("password") ?? "");
    if (!email || !password) throw new UserError("Informe e-mail e senha.");
    const ip = (await clientIp()) ?? "local";
    const key = `login:${ip}:${email}`;
    // Apenas tentativas com falha contam para o bloqueio (8 falhas / 15 min).
    if (isLimited(key, 8)) throw new UserError("Muitas tentativas. Aguarde 15 minutos e tente novamente.");
    const user = await db.user.findUnique({ where: { email } });
    // Compara mesmo sem usuário para não revelar existência de contas pelo tempo de resposta.
    const ok = await verifyPassword(password, user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
    if (!user || !ok) {
      rateLimit(key, 8, 15 * 60_000);
      await audit(user?.id ?? null, "LOGIN_FAILED", "User", user?.id, email);
      throw new UserError("E-mail ou senha incorretos.");
    }
    if (!user.active) throw new UserError("Usuário inativo. Procure o administrador.");
    resetLimit(key);
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await createSession(user.id, user.sessionVersion);
    await audit(user.id, "LOGIN", "User", user.id);
    dest = safeNext(fd.get("next"));
  });
  return finish(res, dest);
}

export async function logout() {
  const user = await getCurrentUser();
  if (user) await audit(user.id, "LOGOUT", "User", user.id);
  await destroySession();
  redirect("/login");
}

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function requestPasswordReset(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const email = z.email("E-mail inválido.").parse(String(fd.get("email") ?? "").trim().toLowerCase());
    const ip = (await clientIp()) ?? "local";
    if (!rateLimit(`reset:${ip}`, 5, 15 * 60_000).ok) throw new UserError("Muitas solicitações. Tente mais tarde.");
    const user = await db.user.findUnique({ where: { email } });
    if (user && user.active) {
      const token = crypto.randomBytes(32).toString("base64url");
      await db.passwordResetToken.create({
        data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 60_000) },
      });
      const link = `${await appBaseUrl()}/redefinir-senha?token=${token}`;
      await sendMail(
        user.email,
        "Redefinição de senha — ArborGest",
        `Olá, ${user.name}.\n\nPara criar uma nova senha, acesse (válido por 1 hora):\n${link}\n\nSe você não solicitou, ignore este e-mail.`,
      );
      await audit(user.id, "PASSWORD_RESET_REQUEST", "User", user.id);
    }
    // Resposta idêntica exista ou não o e-mail.
    return { ok: true, message: "Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha." };
  });
}

export async function resetPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    const data = z
      .object({ token: z.string().min(10, "Link inválido."), password: passwordSchema, confirm: z.string() })
      .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "As senhas não conferem." })
      .parse(Object.fromEntries(fd));
    const rec = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(data.token) } });
    if (!rec || rec.usedAt || rec.expiresAt < new Date()) throw new UserError("Link inválido ou expirado. Solicite um novo.");
    await db.$transaction([
      db.user.update({
        where: { id: rec.userId },
        data: { passwordHash: await hashPassword(data.password), sessionVersion: { increment: 1 } },
      }),
      db.passwordResetToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
    ]);
    await audit(rec.userId, "PASSWORD_RESET", "User", rec.userId);
  });
  return finish(res, "/login?redefinida=1");
}

export async function changePassword(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const me = await getCurrentUser();
    if (!me) throw new UserError("Sessão expirada.");
    const data = z
      .object({ current: z.string().min(1, "Informe a senha atual."), password: passwordSchema, confirm: z.string() })
      .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "As senhas não conferem." })
      .parse(Object.fromEntries(fd));
    const user = await db.user.findUniqueOrThrow({ where: { id: me.id } });
    if (!(await verifyPassword(data.current, user.passwordHash))) {
      return { ok: false, errors: { current: "Senha atual incorreta." }, message: "Verifique os campos destacados." };
    }
    const updated = await db.user.update({
      where: { id: me.id },
      data: { passwordHash: await hashPassword(data.password), sessionVersion: { increment: 1 } },
    });
    await createSession(updated.id, updated.sessionVersion); // mantém esta sessão, invalida as demais
    await audit(me.id, "PASSWORD_CHANGE", "User", me.id);
    return { ok: true, message: "Senha alterada com sucesso." };
  });
}
