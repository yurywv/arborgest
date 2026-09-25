import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { clientOptions, proposalOptions, propertyOptions, teamOptions, treeOptions, userOptions } from "@/lib/options";
import { toNum } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { WorkOrderForm } from "../../work-order-form";

export const metadata = { title: "Editar OS" };

export default async function EditWorkOrder({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("workorders:write");
  const { id } = await params;
  const w = await db.workOrder.findUnique({ where: { id }, include: { trees: { select: { id: true } } } });
  if (!w) notFound();
  const [clients, properties, trees, users, teams, proposals] = await Promise.all([clientOptions(), propertyOptions(), treeOptions(), userOptions(), teamOptions(), proposalOptions(w.proposalId)]);
  const { trees: linked, ...rest } = w;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Editar ${w.number}`} back={{ href: `/ordens-servico/${id}`, label: "OS" }} />
      <WorkOrderForm wo={{ ...rest, cost: toNum(w.cost), treeIds: linked.map((t) => t.id) }} clients={clients} properties={properties} trees={trees} users={users} teams={teams} proposals={proposals} />
    </div>
  );
}
