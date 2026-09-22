import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { findTreeId } from "@/lib/trees";
import { PageHeader } from "@/components/ui";
import { TreeLocationForm } from "./location-form";

export const metadata = { title: "Capturar localização" };

export default async function TreeLocationPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("trees:write");
  const ref = await findTreeId((await params).id);
  if (!ref) notFound();
  const t = await db.tree.findUniqueOrThrow({ where: { id: ref.id }, include: { property: true } });
  const fallback = t.property.latitude != null && t.property.longitude != null ? ([t.property.latitude, t.property.longitude] as [number, number]) : undefined;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Capturar localização" subtitle={t.code} back={{ href: `/arvores/${t.code}`, label: "Ficha" }} />
      <TreeLocationForm tree={t} fallback={fallback} />
    </div>
  );
}
