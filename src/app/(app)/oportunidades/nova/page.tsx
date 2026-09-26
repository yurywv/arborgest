import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { clientOptions, userOptions } from "@/lib/options";
import { PageHeader } from "@/components/ui";
import { OpportunityForm } from "../opportunity-form";

export const metadata = { title: "Nova oportunidade" };

export default async function NewOpportunity({ searchParams }: { searchParams: Promise<{ clientId?: string; inspecao?: string; risco?: string }> }) {
  await requirePermission("opportunities:write");
  const { clientId, inspecao, risco } = await searchParams;
  const [clients, users, insp, risk] = await Promise.all([
    clientOptions(), userOptions(),
    inspecao ? db.inspection.findUnique({ where: { id: inspecao }, select: { id: true, inspectedAt: true, tree: { select: { code: true } } } }) : null,
    risco ? db.riskAssessment.findUnique({ where: { id: risco }, select: { id: true, assessedAt: true, tree: { select: { code: true } } } }) : null,
  ]);
  const basis = { inspectionIds: insp ? [insp.id] : [], riskIds: risk ? [risk.id] : [] };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nova oportunidade" back={{ href: "/oportunidades", label: "Oportunidades" }} />
      {(insp || risk) && (
        <p className="mb-4 rounded-xl bg-sky-50 p-3 text-sm text-sky-900">
          Base técnica: {insp && `inspeção de ${fmtDate(insp.inspectedAt)} (árvore ${insp.tree.code})`}{risk && `avaliação de risco de ${fmtDate(risk.assessedAt)} (árvore ${risk.tree.code})`}.
          Depois de salvar, é possível vincular outras inspeções e avaliações na página da oportunidade.
        </p>
      )}
      <OpportunityForm clients={clients} users={users} clientId={clientId} basis={basis} />
    </div>
  );
}
