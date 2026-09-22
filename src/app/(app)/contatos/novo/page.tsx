import { requirePermission } from "@/lib/auth/session";
import { clientOptions } from "@/lib/options";
import { PageHeader } from "@/components/ui";
import { ContactForm } from "../contact-form";

export const metadata = { title: "Novo contato" };

export default async function NewContact({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  await requirePermission("clients:write");
  const { clientId } = await searchParams;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Novo contato" back={{ href: clientId ? `/clientes/${clientId}` : "/contatos", label: "Voltar" }} />
      <ContactForm clients={await clientOptions()} clientId={clientId} />
    </div>
  );
}
