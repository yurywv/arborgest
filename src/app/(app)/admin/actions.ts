"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { assertPermission, getCurrentUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { ALL_PERMISSIONS } from "@/lib/auth/permissions";
import { hashPassword, passwordSchema } from "@/lib/password";
import { bool, fieldError, formObject, optStr, reqStr, runAction, UserError, finish } from "@/lib/actions";
import { SETTING_DEFAULTS } from "@/lib/settings";
import { generateNotifications } from "@/lib/notifications";
import { mailConfigured, mailLayout, removeMailAccount, saveMailAccount, sendMail, getMailAccount } from "@/lib/mail";
import type { ActionState } from "@/lib/action-state";

// ── Usuários ──
const userSchema = z.object({
  name: reqStr("Nome", 150),
  email: z.preprocess((v) => String(v ?? "").trim().toLowerCase(), z.email("E-mail inválido.")),
  phone: optStr(30),
  jobTitle: optStr(100),
  roleId: reqStr("Perfil", 40),
  active: bool(),
  password: z.preprocess((v) => (v ? v : undefined), passwordSchema.optional()),
});

export async function saveUser(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    const me = await assertPermission("users:manage");
    const { password, ...d } = userSchema.parse(formObject(fd));
    if (!id && !password) return fieldError("password", "Defina uma senha inicial.");
    if (id === me.id && !d.active) throw new UserError("Você não pode desativar o próprio usuário.");
    if (id === me.id) {
      const role = await db.role.findUniqueOrThrow({ where: { id: d.roleId } });
      if (!role.permissions.includes("users:manage")) throw new UserError("Você não pode remover a própria permissão de administrar usuários.");
    }
    const data = {
      ...d,
      ...(password && { passwordHash: await hashPassword(password) }),
    };
    if (id) {
      const before = await db.user.findUniqueOrThrow({ where: { id } });
      // Troca de senha, desativação ou mudança de perfil encerram as sessões existentes.
      const bump = !!password || (before.active && !d.active) || before.roleId !== d.roleId;
      await db.user.update({ where: { id }, data: { ...data, ...(bump && { sessionVersion: { increment: 1 } }) } });
      await audit(me.id, "UPDATE", "User", id, `${d.email}${password ? " (senha redefinida)" : ""}`);
    } else {
      const u = await db.user.create({ data: { ...data, passwordHash: data.passwordHash! } });
      await audit(me.id, "CREATE", "User", u.id, d.email);
    }
  });
  return finish(res, "/admin/usuarios");
}

// ── Equipes ──
const teamSchema = z.object({ name: reqStr("Nome", 100), description: optStr(500), active: bool(), memberIds: z.array(z.string().max(40)) });

export async function saveTeam(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    const me = await assertPermission("users:manage");
    const { memberIds, ...d } = teamSchema.parse(formObject(fd, ["memberIds"]));
    const members = memberIds.map((mid) => ({ id: mid }));
    const t = id
      ? await db.team.update({ where: { id }, data: { ...d, members: { set: members } } })
      : await db.team.create({ data: { ...d, members: { connect: members } } });
    await audit(me.id, id ? "UPDATE" : "CREATE", "Team", t.id, t.name);
  });
  return finish(res, "/admin/equipes");
}

export async function deleteTeam(id: string): Promise<ActionState> {
  return runAction(async () => {
    const me = await assertPermission("users:manage");
    await db.team.delete({ where: { id } });
    await audit(me.id, "DELETE", "Team", id);
  });
}

// ── Perfis ──
const roleSchema = z.object({
  name: reqStr("Nome", 60),
  key: z.preprocess((v) => String(v ?? "").trim().toUpperCase(), z.string().regex(/^[A-Z][A-Z0-9_]{1,29}$/, "Use letras maiúsculas, números e _ (sem espaços).")),
  description: optStr(300),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])),
});

export async function saveRole(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    const me = await getCurrentUser();
    await assertPermission("roles:manage");
    const d = roleSchema.parse(formObject(fd, ["permissions"]));
    if (id) {
      const role = await db.role.findUniqueOrThrow({ where: { id } });
      if (role.key === "ADMIN" && !d.permissions.includes("roles:manage")) throw new UserError("O perfil Administrador deve manter a permissão de gerenciar perfis.");
      await db.role.update({ where: { id }, data: { name: d.name, description: d.description, permissions: d.permissions, ...(role.isSystem ? {} : { key: d.key }) } });
      // Sessões continuam válidas: permissões são lidas do banco a cada requisição.
    } else {
      await db.role.create({ data: d });
    }
    await audit(me?.id ?? null, id ? "UPDATE" : "CREATE", "Role", id, `${d.key}: ${d.permissions.length} permissões`);
  });
  return finish(res, "/admin/perfis");
}

export async function deleteRole(id: string): Promise<ActionState> {
  return runAction(async () => {
    await assertPermission("roles:manage");
    const r = await db.role.findUniqueOrThrow({ where: { id }, include: { _count: { select: { users: true } } } });
    if (r.isSystem) throw new UserError("Perfis padrão não podem ser excluídos.");
    if (r._count.users) throw new UserError("Há usuários com este perfil.");
    await db.role.delete({ where: { id } });
  });
}

// ── Configurações ──
export async function saveSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const me = await assertPermission("settings:manage");
    const keys = Object.keys(SETTING_DEFAULTS) as (keyof typeof SETTING_DEFAULTS)[];
    const numeric = ["inspection_interval_months", "inspection_alert_days", "contract_alert_days"];
    for (const k of keys) {
      const v = String(fd.get(k) ?? "").trim().slice(0, 200);
      if (numeric.includes(k) && !/^\d{1,3}$/.test(v)) return fieldError(k, "Informe um número inteiro.");
      await db.setting.upsert({ where: { key: k }, create: { key: k, value: v }, update: { value: v } });
    }
    await audit(me.id, "UPDATE", "Setting", null, "configurações gerais");
    return { ok: true, message: "Configurações salvas." };
  });
}

export async function runNotificationsNow(): Promise<ActionState> {
  return runAction(async () => {
    await assertPermission("settings:manage");
    const r = await generateNotifications();
    return { ok: true, message: `${r.created} notificação(ões) gerada(s).` };
  });
}

export async function sendTestMail(): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertPermission("settings:manage");
    if (!(await mailConfigured())) return { ok: false, message: "Cadastre a conta Gmail (e-mail e senha de app) antes de testar." };
    try {
      await sendMail(
        user.email,
        "Teste de e-mail — ArborGest",
        "Este é um e-mail de teste. Se você o recebeu, o envio de e-mails (recuperação de senha) está funcionando.",
        mailLayout({ title: "Teste de e-mail", paragraphs: ["Se você recebeu esta mensagem, o envio de e-mails do ArborGest está funcionando — inclusive a recuperação de senha."] }),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, message: `Falha no envio: ${msg.slice(0, 300)}` };
    }
    await audit(user.id, "MAIL_TEST", "Setting", null, `teste para ${user.email}`);
    return { ok: true, message: `E-mail de teste enviado para ${user.email}. Verifique a caixa de entrada (e o spam).` };
  });
}

// ── Conta Gmail para envio ──
const gmailSchema = z.object({
  gmailUser: z.preprocess((v) => String(v ?? "").trim().toLowerCase(), z.email("Informe o endereço completo da conta Gmail / Google Workspace.")),
  senderName: reqStr("Nome do remetente", 80),
  // Senha de app: 16 letras (o Google exibe em grupos de 4, com espaços). Em branco mantém a atual.
  appPassword: z.preprocess((v) => String(v ?? "").replace(/\s+/g, ""), z.string().refine((v) => v === "" || /^[a-zA-Z]{16}$/.test(v), "A senha de app do Google tem 16 letras.")),
});

export async function saveGmailAccount(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const me = await assertPermission("settings:manage");
    const d = gmailSchema.parse(formObject(fd));
    const current = await getMailAccount();
    const changedUser = current?.user !== d.gmailUser;
    if (!d.appPassword && (!current?.hasPassword || changedUser)) return fieldError("appPassword", "Informe a senha de app da conta.");
    await saveMailAccount(d.gmailUser, d.senderName, d.appPassword || null);
    await audit(me.id, "UPDATE", "Setting", null, `conta Gmail de envio: ${d.gmailUser}${d.appPassword ? " (senha de app atualizada)" : ""}`);
    return { ok: true, message: "Conta Gmail salva. Use “Enviar e-mail de teste” para confirmar." };
  });
}

export async function deleteGmailAccount(): Promise<ActionState> {
  return runAction(async () => {
    const me = await assertPermission("settings:manage");
    await removeMailAccount();
    await audit(me.id, "DELETE", "Setting", null, "conta Gmail de envio removida");
    return { ok: true, message: "Conta removida." };
  });
}

// ── Perfil do próprio usuário ──
const profileSchema = z.object({ name: reqStr("Nome", 150), phone: optStr(30), jobTitle: optStr(100) });

export async function saveProfile(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const me = await getCurrentUser();
    if (!me) throw new UserError("Sessão expirada.");
    await db.user.update({ where: { id: me.id }, data: profileSchema.parse(formObject(fd)) });
    return { ok: true, message: "Dados atualizados." };
  });
}
