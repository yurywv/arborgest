import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { clientOptions, userOptions } from "@/lib/options";
import { toNum } from "@/lib/format";
import { LinkButton, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { OpportunityForm } from "../../opportunity-form";
import { deleteOpportunity } from "../../actions";

export const metadata = { title: "Editar oportunidade" };

export default async function EditOpportunity({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("opportunities:write");
  const { id } = await params;
  const o = await db.opportunity.findUnique({ where: { id } });
  if (!o) notFound();
  const [clients, users] = await Promise.all([clientOptions(), userOptions()]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Editar oportunidade"
        back={{ href: `/oportunidades/${id}`, label: "Oportunidade" }}
        actions={<>
          {hasPermission(user.permissions, "pricing:write") && <LinkButton href={`/precificacao/novo?oportunidade=${id}`}>Precificar</LinkButton>}
          {hasPermission(user.permissions, "opportunities:delete") && (
            <ActionButton action={deleteOpportunity.bind(null, id)} confirm="Excluir esta oportunidade?" variant="danger-ghost" redirectTo="/oportunidades"><Trash2 className="size-4" /> Excluir</ActionButton>
          )}
        </>}
      />
      <OpportunityForm opp={{ ...o, estimatedValue: toNum(o.estimatedValue) }} clients={clients} users={users} />
    </div>
  );
}
