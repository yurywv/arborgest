import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { clientOptions } from "@/lib/options";
import { PageHeader } from "@/components/ui";
import { PropertyForm } from "../../property-form";

export const metadata = { title: "Editar propriedade" };

export default async function EditProperty({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("properties:write");
  const { id } = await params;
  const p = await db.property.findUnique({ where: { id } });
  if (!p) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Editar propriedade" subtitle={p.name} back={{ href: `/propriedades/${id}`, label: "Propriedade" }} />
      <PropertyForm property={p} clients={await clientOptions()} />
    </div>
  );
}
