import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { fmtDateTime } from "@/lib/format";
import { Badge, LinkButton, MobileCard, PageHeader, ResponsiveTable } from "@/components/ui";

export const metadata = { title: "Usuários" };

export default async function UsersPage() {
  const me = await requirePermission("users:read");
  const canManage = hasPermission(me.permissions, "users:manage");
  const users = await db.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], include: { role: true, teams: { select: { name: true } } } });
  return (
    <>
      <PageHeader title="Usuários" subtitle={`${users.filter((u) => u.active).length} ativo(s)`} actions={canManage && <LinkButton href="/admin/usuarios/novo" variant="primary" icon={Plus}>Novo usuário</LinkButton>} />
      <ResponsiveTable
        head={<tr><th>Nome</th><th>E-mail</th><th>Cargo</th><th>Perfil</th><th>Equipes</th><th>Último acesso</th><th>Status</th></tr>}
        mobile={users.map((u) => (
          <MobileCard key={u.id} href={canManage ? `/admin/usuarios/${u.id}` : "#"} title={u.name} subtitle={`${u.role.name} · ${u.email}`}
            right={<Badge tone={u.active ? "green" : "gray"}>{u.active ? "Ativo" : "Inativo"}</Badge>} />
        ))}
      >
        {users.map((u) => (
          <tr key={u.id} className={u.active ? "" : "opacity-60"}>
            <td>{canManage ? <Link className="link" href={`/admin/usuarios/${u.id}`}>{u.name}</Link> : u.name}</td>
            <td>{u.email}</td>
            <td>{u.jobTitle ?? "—"}</td>
            <td><Badge tone="blue">{u.role.name}</Badge></td>
            <td className="text-xs">{u.teams.map((t) => t.name).join(", ") || "—"}</td>
            <td className="text-xs whitespace-nowrap">{fmtDateTime(u.lastLoginAt)}</td>
            <td><Badge tone={u.active ? "green" : "gray"}>{u.active ? "Ativo" : "Inativo"}</Badge></td>
          </tr>
        ))}
      </ResponsiveTable>
    </>
  );
}
