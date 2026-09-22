import { requirePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { ClientForm } from "../client-form";

export const metadata = { title: "Novo cliente" };

export default async function NewClientPage() {
  await requirePermission("clients:write");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Novo cliente" back={{ href: "/clientes", label: "Clientes" }} />
      <ClientForm />
    </div>
  );
}
