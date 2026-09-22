import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { clientOptions, propertyOptions, sectorOptions, speciesOptions, userOptions } from "@/lib/options";
import { PageHeader } from "@/components/ui";
import { TreeForm } from "../tree-form";

export const metadata = { title: "Nova árvore" };

export default async function NewTree({ searchParams }: { searchParams: Promise<{ propertyId?: string }> }) {
  await requirePermission("trees:write");
  const { propertyId } = await searchParams;
  const [clients, properties, sectors, species, users, prop] = await Promise.all([
    clientOptions(), propertyOptions(), sectorOptions(), speciesOptions(), userOptions(),
    propertyId ? db.property.findUnique({ where: { id: propertyId }, select: { latitude: true, longitude: true } }) : null,
  ]);
  const fallback = prop?.latitude != null && prop.longitude != null ? ([prop.latitude, prop.longitude] as [number, number]) : undefined;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nova árvore" subtitle="Cadastro de exemplar arbóreo" back={{ href: "/arvores", label: "Exemplares" }} />
      <TreeForm clients={clients} properties={properties} sectors={sectors} species={species} users={users} propertyId={propertyId} fallback={fallback} />
    </div>
  );
}
