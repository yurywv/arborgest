import "server-only";
import nodemailer from "nodemailer";

/**
 * Envio de e-mail via SMTP (qualquer provedor: Resend, SendGrid, SES, Gmail Workspace...).
 * Sem SMTP configurado, o conteúdo é registrado no log do servidor (útil em desenvolvimento).
 */
export async function sendMail(to: string, subject: string, text: string, html?: string) {
  if (!process.env.SMTP_HOST) {
    console.info(`[mail:dev] Para: ${to}\nAssunto: ${subject}\n${text}`);
    return { delivered: false };
  }
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  await transport.sendMail({ from: process.env.MAIL_FROM ?? "ArborGest <no-reply@localhost>", to, subject, text, html });
  return { delivered: true };
}
