import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { UserForm } from "../../forms";

export const metadata = { title: "Novo usuário" };

export default async function NewUser() {
  await requirePermission("users:manage");
  const roles = await db.role.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Novo usuário" back={{ href: "/admin/usuarios", label: "Usuários" }} />
      <UserForm roles={roles.map((r) => ({ value: r.id, label: r.name }))} />
    </div>
  );
}
