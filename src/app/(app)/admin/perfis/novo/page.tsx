import { requirePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { RoleForm } from "../../forms";

export const metadata = { title: "Novo perfil" };

export default async function NewRole() {
  await requirePermission("roles:manage");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Novo perfil" back={{ href: "/admin/perfis", label: "Perfis" }} />
      <RoleForm />
    </div>
  );
}
