import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { db } from "./db";
import { open, seal } from "./secret-box";

/**
 * Envio de e-mail pela conta Gmail / Google Workspace cadastrada em Administração › Configurações.
 * Servidor fixo do Google (smtp.gmail.com:465, SSL) com senha de app — a senha fica cifrada no banco.
 * Sem conta cadastrada, o conteúdo é apenas registrado no log do servidor.
 * MAIL_CAPTURE_DIR (somente testes/desenvolvimento): grava as mensagens em arquivos .eml em vez de enviar.
 */
const K = { user: "mail_gmail_user", name: "mail_sender_name", password: "mail_gmail_password" } as const;
const PURPOSE = "gmail-app-password";
export const GMAIL_HOST = "smtp.gmail.com";
export const GMAIL_PORT = 465;

export type MailAccount = { user: string; senderName: string; hasPassword: boolean; updatedAt: Date | null };

/** Dados públicos da conta (nunca a senha). */
export async function getMailAccount(): Promise<MailAccount | null> {
  const rows = await db.setting.findMany({ where: { key: { in: Object.values(K) } } });
  const get = (k: string) => rows.find((r) => r.key === k);
  const user = get(K.user)?.value;
  if (!user) return null;
  return { user, senderName: get(K.name)?.value || "ArborGest", hasPassword: !!get(K.password)?.value, updatedAt: get(K.password)?.updatedAt ?? get(K.user)?.updatedAt ?? null };
}

export const mailConfigured = async () => {
  const a = await getMailAccount();
  return !!a?.hasPassword;
};

/** Grava a conta. Senha em branco mantém a atual. */
export async function saveMailAccount(user: string, senderName: string, appPassword: string | null) {
  const ops = [
    db.setting.upsert({ where: { key: K.user }, create: { key: K.user, value: user }, update: { value: user } }),
    db.setting.upsert({ where: { key: K.name }, create: { key: K.name, value: senderName }, update: { value: senderName } }),
  ];
  if (appPassword) {
    const sealed = seal(appPassword, PURPOSE);
    ops.push(db.setting.upsert({ where: { key: K.password }, create: { key: K.password, value: sealed }, update: { value: sealed } }));
  }
  await db.$transaction(ops);
}

export async function removeMailAccount() {
  await db.setting.deleteMany({ where: { key: { in: Object.values(K) } } });
}

async function transportAndSender(): Promise<{ transport: Transporter; from: string; capture: boolean } | null> {
  const a = await getMailAccount();
  const quoted = (n: string) => `"${n.replace(/["\\]/g, "")}"`;
  // Captura local para testes: nunca ativa na Vercel.
  if (process.env.MAIL_CAPTURE_DIR && !process.env.VERCEL) {
    return { transport: nodemailer.createTransport({ streamTransport: true, buffer: true }), from: `${quoted(a?.senderName ?? "ArborGest")} <${a?.user ?? "teste@localhost"}>`, capture: true };
  }
  if (!a?.hasPassword) return null;
  const row = await db.setting.findUnique({ where: { key: K.password } });
  const pass = row ? open(row.value, PURPOSE) : null;
  if (!pass) throw new Error("Não foi possível ler a senha de app do Gmail (AUTH_SECRET mudou?). Cadastre a senha novamente em Configurações.");
  return {
    transport: nodemailer.createTransport({
      host: GMAIL_HOST, port: GMAIL_PORT, secure: true, auth: { user: a.user, pass },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    }),
    // O Gmail exige remetente igual à conta autenticada.
    from: `${quoted(a.senderName)} <${a.user}>`,
    capture: false,
  };
}

export type MailAttachment = { filename: string; content: Buffer; contentType?: string };
export type MailOptions = { cc?: string; replyTo?: string };

export async function sendMail(to: string, subject: string, text: string, html?: string, attachments?: MailAttachment[], opts: MailOptions = {}) {
  const t = await transportAndSender();
  if (!t) {
    console.info(`[mail:sem-conta] Para: ${to}\nAssunto: ${subject}\n${text}`);
    return { delivered: false as const, messageId: null };
  }
  const info = await t.transport.sendMail({ from: t.from, to, cc: opts.cc, replyTo: opts.replyTo, subject, text, html, attachments });
  if (t.capture) {
    const dir = process.env.MAIL_CAPTURE_DIR!;
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${Date.now()}-${crypto.randomBytes(3).toString("hex")}.eml`), (info as unknown as { message: Buffer }).message);
  }
  return { delivered: true as const, messageId: info.messageId ?? null };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Layout HTML simples e compatível com clientes de e-mail (tabelas + estilos inline). */
export function mailLayout({ title, paragraphs, button, footer }: {
  title: string; paragraphs: string[]; button?: { label: string; href: string }; footer?: string;
}) {
  const p = paragraphs.map((t) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#292524">${esc(t)}</p>`).join("");
  const btn = button
    ? `<p style="margin:24px 0"><a href="${esc(button.href)}" style="display:inline-block;background:#1f6f43;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">${esc(button.label)}</a></p>
       <p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:#78716c">Se o botão não funcionar, copie e cole este endereço no navegador:<br><span style="word-break:break-all">${esc(button.href)}</span></p>`
    : "";
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f5f5f4;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7e5e4">
<tr><td style="background:#14532d;padding:18px 28px;color:#ffffff;font-size:18px;font-weight:700">🌳 ArborGest</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 18px;font-size:20px;color:#1c1917">${esc(title)}</h1>${p}${btn}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e7e5e4;font-size:12px;color:#a8a29e">${esc(footer ?? "Mensagem automática — não responda este e-mail.")}</td></tr>
</table></td></tr></table></body></html>`;
}
