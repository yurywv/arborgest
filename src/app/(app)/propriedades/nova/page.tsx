import { requirePermission } from "@/lib/auth/session";
import { clientOptions } from "@/lib/options";
import { PageHeader } from "@/components/ui";
import { PropertyForm } from "../property-form";

export const metadata = { title: "Nova propriedade" };

export default async function NewProperty({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  await requirePermission("properties:write");
  const { clientId } = await searchParams;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nova propriedade" back={{ href: "/propriedades", label: "Propriedades" }} />
      <PropertyForm clients={await clientOptions()} clientId={clientId} />
    </div>
  );
}
