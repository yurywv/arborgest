import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { clientOptions } from "@/lib/options";
import { PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { ContactForm } from "../../contact-form";
import { deleteContact } from "../../actions";

export const metadata = { title: "Editar contato" };

export default async function EditContact({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("clients:write");
  const { id } = await params;
  const c = await db.contact.findUnique({ where: { id } });
  if (!c) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Editar contato"
        subtitle={c.name}
        back={{ href: `/clientes/${c.clientId}`, label: "Cliente" }}
        actions={<ActionButton action={deleteContact.bind(null, id)} confirm="Excluir este contato?" variant="danger-ghost" redirectTo={`/clientes/${c.clientId}`}><Trash2 className="size-4" /> Excluir</ActionButton>}
      />
      <ContactForm contact={c} clients={await clientOptions()} />
    </div>
  );
}
