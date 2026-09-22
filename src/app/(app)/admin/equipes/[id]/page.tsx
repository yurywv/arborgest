import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { userOptions } from "@/lib/options";
import { PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { TeamForm } from "../../forms";
import { deleteTeam } from "../../actions";

export const metadata = { title: "Editar equipe" };

export default async function EditTeam({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("users:manage");
  const { id } = await params;
  const t = await db.team.findUnique({ where: { id }, include: { members: { select: { id: true } } } });
  if (!t) notFound();
  const { members, ...team } = t;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t.name} back={{ href: "/admin/equipes", label: "Equipes" }}
        actions={<ActionButton action={deleteTeam.bind(null, id)} confirm="Excluir esta equipe? OS e intervenções ficarão sem equipe." variant="danger-ghost" redirectTo="/admin/equipes"><Trash2 className="size-4" /> Excluir</ActionButton>} />
      <TeamForm team={team} users={await userOptions()} memberIds={members.map((m) => m.id)} />
    </div>
  );
}
