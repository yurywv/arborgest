import { requirePermission } from "@/lib/auth/session";
import { openWorkOrderOptions, teamOptions, treeOptions, userOptions } from "@/lib/options";
import { PageHeader } from "@/components/ui";
import { InterventionForm } from "../intervention-form";

export const metadata = { title: "Nova intervenção" };

export default async function NewIntervention({ searchParams }: { searchParams: Promise<{ arvore?: string }> }) {
  await requirePermission("interventions:write");
  const { arvore } = await searchParams;
  const [trees, users, teams, workOrders] = await Promise.all([treeOptions(), userOptions(), teamOptions(), openWorkOrderOptions()]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Registrar intervenção" subtitle={arvore} back={{ href: arvore ? `/arvores/${arvore}?aba=intervencoes` : "/intervencoes", label: "Voltar" }} />
      <InterventionForm trees={trees} users={users} teams={teams} workOrders={workOrders} treeCode={arvore} />
    </div>
  );
}
