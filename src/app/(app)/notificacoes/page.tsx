import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { maybeGenerateNotifications } from "@/lib/notifications";
import { fmtDateTime } from "@/lib/format";
import { EmptyState, PageHeader, clsx } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { markAllRead } from "./actions";

export const metadata = { title: "Notificações" };

export default async function NotificationsPage() {
  const user = await requireUser();
  await maybeGenerateNotifications();
  const rows = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = rows.filter((r) => !r.readAt).length;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Notificações" subtitle={`${unread} não lida(s)`}
        actions={unread > 0 && <ActionButton action={markAllRead}><CheckCheck className="size-4" /> Marcar todas como lidas</ActionButton>} />
      {rows.length === 0 ? <EmptyState icon={Bell} title="Nenhuma notificação" /> : (
        <ul className="space-y-2">
          {rows.map((n) => (
            <li key={n.id}>
              <Link href={`/notificacoes/${n.id}`} className={clsx("card block p-3.5 hover:shadow-md", !n.readAt && "border-brand-300 bg-brand-50/50")}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{!n.readAt && <span className="mr-2 inline-block size-2 rounded-full bg-brand-600" />}{n.title}</p>
                  <span className="shrink-0 text-xs text-stone-500">{fmtDateTime(n.createdAt)}</span>
                </div>
                <p className="text-sm text-stone-600">{n.message}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
