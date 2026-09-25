import { requirePermission } from "@/lib/auth/session";
import { clientOptions, proposalOptions, propertyOptions, teamOptions, treeOptions, userOptions } from "@/lib/options";
import { resolveTreeCode } from "@/lib/trees";
import { PageHeader } from "@/components/ui";
import { WorkOrderForm } from "../work-order-form";

export const metadata = { title: "Nova ordem de serviço" };

export default async function NewWorkOrder({ searchParams }: { searchParams: Promise<{ arvore?: string; clientId?: string }> }) {
  await requirePermission("workorders:write");
  const sp = await searchParams;
  const [clients, properties, trees, users, teams, tree, proposals] = await Promise.all([
    clientOptions(), propertyOptions(), treeOptions(), userOptions(), teamOptions(), sp.arvore ? resolveTreeCode(sp.arvore) : null, proposalOptions(),
  ]);
  const preset = tree ? { clientId: tree.property.clientId, propertyId: tree.propertyId, treeIds: [tree.id] } : { clientId: sp.clientId };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nova ordem de serviço" back={{ href: sp.arvore ? `/arvores/${sp.arvore}` : "/ordens-servico", label: "Voltar" }} />
      <WorkOrderForm clients={clients} properties={properties} trees={trees} users={users} teams={teams} proposals={proposals} preset={preset} />
    </div>
  );
}
