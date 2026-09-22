import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { SectorForm } from "../../../sector-form";
import { deleteSector } from "../../../actions";

export const metadata = { title: "Editar setor" };

export default async function EditSector({ params }: { params: Promise<{ id: string; sectorId: string }> }) {
  await requirePermission("properties:write");
  const { id, sectorId } = await params;
  const s = await db.sector.findUnique({ where: { id: sectorId }, include: { property: true, _count: { select: { trees: true } } } });
  if (!s || s.propertyId !== id) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Setor: ${s.name}`}
        subtitle={`${s.property.name} · ${s._count.trees} árvore(s)`}
        back={{ href: `/propriedades/${id}?aba=setores`, label: "Propriedade" }}
        actions={<ActionButton action={deleteSector.bind(null, sectorId)} confirm="Excluir este setor? As árvores vinculadas ficarão sem setor." variant="danger-ghost" redirectTo={`/propriedades/${id}?aba=setores`}><Trash2 className="size-4" /> Excluir</ActionButton>}
      />
      <Card><SectorForm propertyId={id} sector={s} /></Card>
    </div>
  );
}
