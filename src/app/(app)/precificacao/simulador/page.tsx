import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveVersion, paramsOf } from "@/lib/pricing/server";
import { activeServices } from "@/lib/pricing/picker-data";
import { ENGINE_LABEL } from "@/lib/pricing/types";
import { LinkButton, PageHeader } from "@/components/ui";
import { PricingSimulator } from "@/components/pricing/simulator";

export const metadata = { title: "Simulador de preço" };

export default async function SimulatorPage() {
  const user = await requirePermission("pricing:read");
  const [version, services] = await Promise.all([getActiveVersion(), activeServices()]);
  return (
    <>
      <PageHeader
        back={{ href: "/precificacao", label: "Precificação" }}
        title="Simulador de preço"
        subtitle={`Parâmetros vigentes v${version.label} — ${ENGINE_LABEL[version.engineVersion]}. Simulações não são salvas.`}
        actions={hasPermission(user.permissions, "pricing:write") && <LinkButton href="/precificacao/novo" variant="primary">Criar orçamento</LinkButton>}
      />
      <PricingSimulator
        params={paramsOf(version)}
        versionLabel={version.label}
        services={services}
        canSeeCosts={hasPermission(user.permissions, "pricing:costs")}
        showComparison={hasPermission(user.permissions, "pricing:approve") || hasPermission(user.permissions, "pricing:params")}
      />
    </>
  );
}
