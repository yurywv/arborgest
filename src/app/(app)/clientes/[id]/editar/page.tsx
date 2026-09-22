import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { ClientForm } from "../../client-form";

export const metadata = { title: "Editar cliente" };

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("clients:write");
  const { id } = await params;
  const c = await db.client.findUnique({ where: { id } });
  if (!c) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Editar cliente" subtitle={c.legalName} back={{ href: `/clientes/${id}`, label: "Voltar" }} />
      <ClientForm client={c} />
    </div>
  );
}
