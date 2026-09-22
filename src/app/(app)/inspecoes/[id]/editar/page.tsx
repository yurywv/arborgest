import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { userOptions } from "@/lib/options";
import { PageHeader } from "@/components/ui";
import { InspectionForm } from "../../inspection-form";

export const metadata = { title: "Editar inspeção" };

export default async function EditInspection({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("inspections:write");
  const { id } = await params;
  const i = await db.inspection.findUnique({ where: { id }, include: { findings: true, tree: { select: { code: true } } } });
  if (!i) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Corrigir inspeção" subtitle={i.tree.code} back={{ href: `/inspecoes/${id}`, label: "Inspeção" }} />
      <InspectionForm inspection={i} trees={[]} users={await userOptions()} meId={user.id} />
    </div>
  );
}
