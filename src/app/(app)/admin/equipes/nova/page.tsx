import { requirePermission } from "@/lib/auth/session";
import { userOptions } from "@/lib/options";
import { PageHeader } from "@/components/ui";
import { TeamForm } from "../../forms";

export const metadata = { title: "Nova equipe" };

export default async function NewTeam() {
  await requirePermission("users:manage");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nova equipe" back={{ href: "/admin/equipes", label: "Equipes" }} />
      <TeamForm users={await userOptions()} memberIds={[]} />
    </div>
  );
}
