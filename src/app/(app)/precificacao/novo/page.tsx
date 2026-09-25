import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { clientOptions, userOptions } from "@/lib/options";
import { spGet, type SP } from "@/lib/query";
import { estimateFormOptions } from "@/lib/pricing/options";
import { hasPermission } from "@/lib/auth/permissions";
import { dec } from "@/lib/pricing/decimal";
import { getActiveVersion, paramsOf } from "@/lib/pricing/server";
import { PageHeader } from "@/components/ui";
import { EstimateForm } from "../estimate-form";

export const metadata = { title: "Novo orçamento" };

export default async function NewEstimatePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("pricing:write");
  const sp = await searchParams;
  const opportunityId = spGet(sp, "oportunidade");
  const propertyId = spGet(sp, "propriedade");
  let clientId = spGet(sp, "cliente");
  if (opportunityId) {
    const o = await db.opportunity.findUnique({ where: { id: opportunityId }, select: { clientId: true } });
    clientId = o?.clientId ?? clientId;
  }
  if (propertyId && !clientId) clientId = (await db.property.findUnique({ where: { id: propertyId }, select: { clientId: true } }))?.clientId;
  const [clients, users, opts] = await Promise.all([clientOptions(), userOptions(), estimateFormOptions()]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Novo orçamento" back={{ href: "/precificacao", label: "Precificação" }} subtitle="Depois de criar, adicione os serviços (inventário, supressão, poda)." />
      <EstimateForm clients={clients} users={users} {...opts} defaults={{ clientId, propertyId, opportunityId }}
        margin={hasPermission(user.permissions, "pricing:negotiate")
          ? { defaultPct: dec(paramsOf(await getActiveVersion()).general.margem).mul(100).toString().replace(".", ",") } : undefined} />
    </div>
  );
}
