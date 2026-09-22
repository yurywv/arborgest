import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { ALL_PERMISSIONS } from "@/lib/auth/permissions";
import { Badge, LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "Perfis de acesso" };

export default async function RolesPage() {
  await requirePermission("roles:manage");
  const roles = await db.role.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { users: true } } } });
  return (
    <>
      <PageHeader title="Perfis de acesso" subtitle="Controle de permissões por perfil" actions={<LinkButton href="/admin/perfis/novo" variant="primary" icon={Plus}>Novo perfil</LinkButton>} />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {roles.map((r) => (
          <li key={r.id}>
            <Link href={`/admin/perfis/${r.id}`} className="card block p-4 hover:shadow-md">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{r.name}</span>
                <Badge tone="blue">{r._count.users} usuário(s)</Badge>
              </div>
              <p className="mt-1 text-sm text-stone-500">{r.description}</p>
              <p className="mt-2 text-xs text-stone-500">{r.permissions.length} de {ALL_PERMISSIONS.length} permissões · <span className="font-mono">{r.key}</span>{r.isSystem && " · padrão"}</p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
