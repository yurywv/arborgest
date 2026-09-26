import { BellRing, MailCheck, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { fmtDateTime } from "@/lib/format";
import { Card, DataList, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { GmailAccountForm, SettingsForm } from "../forms";
import { deleteGmailAccount, runNotificationsNow, sendTestMail } from "../actions";
import { driver } from "@/lib/storage";
import { GMAIL_HOST, GMAIL_PORT, getMailAccount } from "@/lib/mail";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  await requirePermission("settings:manage");
  const [settings, logs, lastRun, account] = await Promise.all([
    getSettings(),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { name: true } } } }),
    db.setting.findUnique({ where: { key: "notifications_last_run" } }),
    getMailAccount(),
  ]);
  const storage = driver();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2"><PageHeader title="Configurações" /></div>
      <SettingsForm values={settings} />
      <div className="space-y-4">
        <Card title="Ambiente">
          <DataList cols={1} items={[
            ["Armazenamento de arquivos", storage === "s3" ? `S3 compatível (${process.env.S3_BUCKET ?? "?"})` : storage === "vercel-blob" ? "Vercel Blob" : "Disco local (desenvolvimento / volume Railway)"],
            ["URL pública", process.env.APP_URL ?? "—"],
            ["Última geração de alertas", lastRun ? fmtDateTime(lastRun.value) : "Nunca"],
          ]} />
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton action={runNotificationsNow}><BellRing className="size-4" /> Gerar alertas agora</ActionButton>
          </div>
        </Card>
        <Card title="E-mail — conta Gmail">
          <p className="mb-3 text-sm text-stone-600">
            Todos os e-mails do sistema (propostas, mensagens a clientes e recuperação de senha) saem por esta conta,
            pelo servidor do Google ({GMAIL_HOST}:{GMAIL_PORT}, SSL).
          </p>
          <p className="mb-3 text-sm" data-testid="gmail-status">
            {account?.hasPassword
              ? <>Conta ativa: <b>{account.senderName}</b> &lt;{account.user}&gt;{account.updatedAt ? ` · atualizada em ${fmtDateTime(account.updatedAt)}` : ""}</>
              : <span className="text-amber-700">Nenhuma conta cadastrada — os e-mails não são enviados (apenas registrados no log do servidor).</span>}
          </p>
          <GmailAccountForm account={account} />
          <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-4">
            <ActionButton action={sendTestMail} showSuccess><MailCheck className="size-4" /> Enviar e-mail de teste</ActionButton>
            {account && <ActionButton action={deleteGmailAccount} confirm="Remover a conta Gmail? O sistema deixa de enviar e-mails." variant="danger-ghost" showSuccess><Trash2 className="size-4" /> Remover conta</ActionButton>}
          </div>
        </Card>
        <Card title="Log de auditoria (últimos 50)">
          <ul className="max-h-[28rem] space-y-1.5 overflow-y-auto text-xs">
            {logs.map((l) => (
              <li key={l.id} className="flex justify-between gap-3 border-b border-stone-100 pb-1.5">
                <span><b>{l.action}</b> {l.entity} {l.summary && `· ${l.summary}`} <span className="text-stone-500">— {l.user?.name ?? "sistema"}</span></span>
                <span className="shrink-0 text-stone-500">{fmtDateTime(l.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
