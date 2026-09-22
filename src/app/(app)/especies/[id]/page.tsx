import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { SpeciesForm } from "../species-form";
import { deleteSpecies } from "../actions";

export const metadata = { title: "Editar espécie" };

export default async function EditSpecies({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("species:write");
  const { id } = await params;
  const s = await db.species.findUnique({ where: { id } });
  if (!s) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={s.popularName} subtitle={<em>{s.scientificName}</em>} back={{ href: "/especies", label: "Espécies" }}
        actions={<ActionButton action={deleteSpecies.bind(null, id)} confirm="Excluir esta espécie?" variant="danger-ghost" redirectTo="/especies"><Trash2 className="size-4" /> Excluir</ActionButton>} />
      <SpeciesForm species={s} />
    </div>
  );
}
