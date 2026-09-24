import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { spGet, type SP } from "@/lib/query";
import { EDITABLE_STATUSES, paramsOf } from "@/lib/pricing/server";
import { activeServices, pickerTrees } from "@/lib/pricing/picker-data";
import { SERVICES, isServiceCode } from "@/lib/pricing/registry";
import { PageHeader } from "@/components/ui";
import { ItemSimulator } from "../controls";

export const metadata = { title: "Serviço do orçamento" };

export default async function ItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requirePermission("pricing:write");
  const { id } = await params;
  const sp = await searchParams;
  const itemId = spGet(sp, "item") ?? null;
  const est = await db.pricingEstimate.findUnique({
    where: { id },
    include: { parameterVersion: true, client: { select: { legalName: true, tradeName: true } }, property: { select: { name: true } } },
  });
  if (!est) notFound();
  if (!(EDITABLE_STATUSES as readonly string[]).includes(est.status)) redirect(`/precificacao/${id}`);
  const item = itemId ? await db.pricingEstimateItem.findFirst({ where: { id: itemId, estimateId: id }, include: { trees: { select: { id: true } } } }) : null;
  if (itemId && !item) notFound();
  const [services, trees] = await Promise.all([activeServices(), pickerTrees({ propertyId: est.propertyId, clientId: est.clientId })]);
  const requested = spGet(sp, "servico");
  const service = item && isServiceCode(item.serviceCode) ? item.serviceCode : requested && isServiceCode(requested) ? requested : services[0];
  return (
    <>
      <PageHeader
        back={{ href: `/precificacao/${id}`, label: `Orçamento ${est.number}` }}
        title={item ? `Editar ${SERVICES[service].name.toLowerCase()}` : "Adicionar serviço"}
        subtitle={`${est.client.tradeName ?? est.client.legalName}${est.property ? ` · ${est.property.name}` : ""} · parâmetros v${est.parameterVersion.label}`}
      />
      <ItemSimulator
        estimateId={id}
        itemId={item?.id ?? null}
        params={paramsOf(est.parameterVersion)}
        versionLabel={est.parameterVersion.label}
        services={item ? [service] : services}
        service={service}
        lockService={!!item}
        initialInputs={(item?.inputs as Record<string, unknown>) ?? undefined}
        description={item?.description}
        canSeeCosts={hasPermission(user.permissions, "pricing:costs")}
        showComparison={hasPermission(user.permissions, "pricing:approve") || hasPermission(user.permissions, "pricing:params")}
        trees={trees}
        initialTreeIds={item?.trees.map((t) => t.id)}
      />
    </>
  );
}
