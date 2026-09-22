import { BellRing } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { fmtDateTime } from "@/lib/format";
import { Card, DataList, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { SettingsForm } from "../forms";
import { runNotificationsNow } from "../actions";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  await requirePermission("settings:manage");
  const [settings, logs, lastRun] = await Promise.all([
    getSettings(),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { name: true } } } }),
    db.setting.findUnique({ where: { key: "notifications_last_run" } }),
  ]);
  const storage = process.env.STORAGE_DRIVER ?? "local";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2"><PageHeader title="Configurações" /></div>
      <SettingsForm values={settings} />
      <div className="space-y-4">
        <Card title="Ambiente">
          <DataList cols={1} items={[
            ["Armazenamento de arquivos", storage === "s3" ? `S3 compatível (${process.env.S3_BUCKET ?? "?"})` : "Disco local (desenvolvimento / volume Railway)"],
            ["E-mail (SMTP)", process.env.SMTP_HOST ? process.env.SMTP_HOST : "Não configurado — links de recuperação aparecem no log do servidor"],
            ["URL pública", process.env.APP_URL ?? "—"],
            ["Última geração de alertas", lastRun ? fmtDateTime(lastRun.value) : "Nunca"],
          ]} />
          <div className="mt-4"><ActionButton action={runNotificationsNow}><BellRing className="size-4" /> Gerar alertas agora</ActionButton></div>
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
