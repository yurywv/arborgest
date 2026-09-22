import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Badge, EmptyState, LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "Equipes" };

export default async function TeamsPage() {
  const me = await requirePermission("users:read");
  const canManage = hasPermission(me.permissions, "users:manage");
  const teams = await db.team.findMany({
    orderBy: { name: "asc" },
    include: { members: { select: { name: true } }, _count: { select: { workOrders: { where: { status: { in: ["ABERTA", "PROGRAMADA", "EM_EXECUCAO"] } } } } } },
  });
  return (
    <>
      <PageHeader title="Equipes" subtitle="Equipes de campo para OS e intervenções" actions={canManage && <LinkButton href="/admin/equipes/nova" variant="primary" icon={Plus}>Nova equipe</LinkButton>} />
      {teams.length === 0 ? <EmptyState title="Nenhuma equipe" /> : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <li key={t.id} className="card p-4">
              <div className="flex items-center justify-between gap-2">
                {canManage ? <Link className="font-semibold hover:underline" href={`/admin/equipes/${t.id}`}>{t.name}</Link> : <span className="font-semibold">{t.name}</span>}
                <Badge tone={t.active ? "green" : "gray"}>{t.active ? "Ativa" : "Inativa"}</Badge>
              </div>
              {t.description && <p className="mt-1 text-sm text-stone-500">{t.description}</p>}
              <p className="mt-2 text-sm">{t.members.map((m) => m.name).join(", ") || "Sem integrantes"}</p>
              <p className="mt-2 text-xs text-stone-500"><Link className="link" href={`/ordens-servico?equipe=${t.id}&abertas=1`}>{t._count.workOrders} OS em aberto</Link></p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
