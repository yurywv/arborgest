import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { openWorkOrderOptions, teamOptions, userOptions } from "@/lib/options";
import { toNum } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { InterventionForm } from "../../intervention-form";

export const metadata = { title: "Editar intervenção" };

export default async function EditIntervention({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("interventions:write");
  const { id } = await params;
  const i = await db.intervention.findUnique({ where: { id }, include: { tree: { select: { code: true } }, workOrder: { select: { id: true, number: true } } } });
  if (!i) notFound();
  const [users, teams, wos] = await Promise.all([userOptions(), teamOptions(), openWorkOrderOptions()]);
  const workOrders = i.workOrder && !wos.some((w) => w.value === i.workOrder!.id) ? [{ value: i.workOrder.id, label: i.workOrder.number }, ...wos] : wos;
  const { tree, workOrder, ...rest } = i;
  void workOrder;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Editar intervenção" subtitle={tree.code} back={{ href: `/intervencoes/${id}`, label: "Intervenção" }} />
      <InterventionForm intervention={{ ...rest, estimatedCost: toNum(i.estimatedCost), actualCost: toNum(i.actualCost) }} trees={[]} users={users} teams={teams} workOrders={workOrders} />
    </div>
  );
}
