import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { findTreeId } from "@/lib/trees";
import { clientOptions, propertyOptions, sectorOptions, speciesOptions, userOptions } from "@/lib/options";
import { PageHeader } from "@/components/ui";
import { TreeForm } from "../../tree-form";

export const metadata = { title: "Editar árvore" };

export default async function EditTree({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("trees:write");
  const ref = await findTreeId((await params).id);
  if (!ref) notFound();
  const [t, clients, properties, sectors, species, users] = await Promise.all([
    db.tree.findUniqueOrThrow({ where: { id: ref.id } }), clientOptions(), propertyOptions(), sectorOptions(), speciesOptions(), userOptions(),
  ]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Editar ${t.code}`} back={{ href: `/arvores/${t.code}`, label: "Ficha" }} />
      <TreeForm tree={t} clients={clients} properties={properties} sectors={sectors} species={species} users={users} />
    </div>
  );
}
