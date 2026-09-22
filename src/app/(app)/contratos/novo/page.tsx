import { requirePermission } from "@/lib/auth/session";
import { clientOptions, propertyOptions, userOptions } from "@/lib/options";
import { PageHeader } from "@/components/ui";
import { ContractForm } from "../contract-form";

export const metadata = { title: "Novo contrato" };

export default async function NewContract({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  await requirePermission("contracts:write");
  const { clientId } = await searchParams;
  const [clients, properties, users] = await Promise.all([clientOptions(), propertyOptions(), userOptions()]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Novo contrato" back={{ href: "/contratos", label: "Contratos" }} />
      <ContractForm clients={clients} properties={properties} users={users} clientId={clientId} />
    </div>
  );
}
