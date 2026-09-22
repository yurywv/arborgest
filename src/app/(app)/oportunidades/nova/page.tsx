import { requirePermission } from "@/lib/auth/session";
import { clientOptions, userOptions } from "@/lib/options";
import { PageHeader } from "@/components/ui";
import { OpportunityForm } from "../opportunity-form";

export const metadata = { title: "Nova oportunidade" };

export default async function NewOpportunity({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  await requirePermission("opportunities:write");
  const { clientId } = await searchParams;
  const [clients, users] = await Promise.all([clientOptions(), userOptions()]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nova oportunidade" back={{ href: "/oportunidades", label: "Oportunidades" }} />
      <OpportunityForm clients={clients} users={users} clientId={clientId} />
    </div>
  );
}
