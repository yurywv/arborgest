import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { userOptions } from "@/lib/options";
import { PageHeader } from "@/components/ui";
import { RiskForm } from "../../risk-form";

export const metadata = { title: "Editar avaliação de risco" };

export default async function EditRisk({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("risk:write");
  const { id } = await params;
  const r = await db.riskAssessment.findUnique({ where: { id }, include: { tree: { select: { code: true } } } });
  if (!r) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Editar avaliação de risco" subtitle={r.tree.code} back={{ href: `/riscos/${id}`, label: "Avaliação" }} />
      <RiskForm risk={r} trees={[]} users={await userOptions()} meId={user.id} />
    </div>
  );
}
