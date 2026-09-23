import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Envio de e-mail via SMTP (qualquer provedor: Gmail/Google Workspace, Microsoft 365, Resend, SES...).
 * Sem SMTP configurado, o conteúdo é registrado no log do servidor (útil em desenvolvimento).
 *
 * Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER=conta@gmail.com,
 * SMTP_PASSWORD=senha de app (16 letras), MAIL_FROM="ArborGest <conta@gmail.com>".
 */
export const mailConfigured = () => !!process.env.SMTP_HOST;

let transport: Transporter | null = null;
function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 587);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      requireTLS: port === 587, // STARTTLS obrigatório na porta de submissão
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transport;
}

function sender() {
  if (process.env.MAIL_FROM) return process.env.MAIL_FROM;
  // Gmail e Microsoft 365 exigem remetente igual à conta autenticada.
  return process.env.SMTP_USER ? `ArborGest <${process.env.SMTP_USER}>` : "ArborGest <no-reply@localhost>";
}

export async function sendMail(to: string, subject: string, text: string, html?: string) {
  if (!mailConfigured()) {
    console.info(`[mail:dev] Para: ${to}\nAssunto: ${subject}\n${text}`);
    return { delivered: false };
  }
  await getTransport().sendMail({ from: sender(), to, subject, text, html });
  return { delivered: true };
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
