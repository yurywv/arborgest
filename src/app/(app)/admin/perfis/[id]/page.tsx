import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { RoleForm } from "../../forms";
import { deleteRole } from "../../actions";

export const metadata = { title: "Editar perfil" };

export default async function EditRole({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("roles:manage");
  const { id } = await params;
  const r = await db.role.findUnique({ where: { id } });
  if (!r) notFound();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={`Perfil: ${r.name}`} back={{ href: "/admin/perfis", label: "Perfis" }}
        actions={!r.isSystem && <ActionButton action={deleteRole.bind(null, id)} confirm="Excluir este perfil?" variant="danger-ghost" redirectTo="/admin/perfis"><Trash2 className="size-4" /> Excluir</ActionButton>} />
      <RoleForm role={r} />
    </div>
  );
}
