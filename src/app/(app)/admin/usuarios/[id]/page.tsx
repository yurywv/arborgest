import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { UserForm } from "../../forms";

export const metadata = { title: "Editar usuário" };

export default async function EditUser({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("users:manage");
  const { id } = await params;
  const [u, roles, logs] = await Promise.all([
    db.user.findUnique({ where: { id } }),
    db.role.findMany({ orderBy: { name: "asc" } }),
    db.auditLog.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  if (!u) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title={u.name} subtitle={u.email} back={{ href: "/admin/usuarios", label: "Usuários" }} />
      <UserForm user={u} roles={roles.map((r) => ({ value: r.id, label: r.name }))} />
      <Card title="Atividade recente">
        {logs.length === 0 ? <p className="text-sm text-stone-500">Sem registros.</p> : (
          <ul className="space-y-1 text-sm">
            {logs.map((l) => <li key={l.id} className="flex justify-between gap-2"><span>{l.action} · {l.entity} {l.summary && `· ${l.summary}`}</span><span className="shrink-0 text-xs text-stone-500">{fmtDateTime(l.createdAt)}</span></li>)}
          </ul>
        )}
      </Card>
    </div>
  );
}
