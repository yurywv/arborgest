import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { clientOptions, propertyOptions, userOptions } from "@/lib/options";
import { toNum } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { ContractForm } from "../../contract-form";

export const metadata = { title: "Editar contrato" };

export default async function EditContract({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("contracts:write");
  const { id } = await params;
  const c = await db.contract.findUnique({ where: { id } });
  if (!c) notFound();
  const [clients, properties, users] = await Promise.all([clientOptions(), propertyOptions(), userOptions()]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Editar ${c.number}`} back={{ href: `/contratos/${id}`, label: "Contrato" }} />
      <ContractForm contract={{ ...c, value: toNum(c.value) }} clients={clients} properties={properties} users={users} />
    </div>
  );
}
