import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Badge, PageHeader } from "@/components/ui";
import { PasswordForm, ProfileForm } from "../admin/forms";

export const metadata = { title: "Meu perfil" };

export default async function ProfilePage() {
  const me = await requireUser();
  const u = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Meu perfil" subtitle={<Badge tone="blue">{me.roleName}</Badge>} />
      <ProfileForm user={u} />
      <PasswordForm />
    </div>
  );
}
