import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { COMBINED_LIKELIHOOD, combinedLikelihood, computeRisk } from "@/lib/arbo";
import { CONSEQUENCE, FAILURE_LIKELIHOOD, IMPACT_LIKELIHOOD, RISK_LEVEL, RISK_TARGETS, TARGET_OCCUPANCY, TREE_PARTS, labelOf } from "@/lib/catalogs";
import { fmtDate } from "@/lib/format";
import { Badge, Card, DataList, LinkButton, PageHeader, RiskBadge } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { deleteRisk } from "../actions";

export const metadata = { title: "Avaliação de risco" };

export default async function RiskDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("risk:read");
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(user.permissions, p);
  const { id } = await params;
  const r = await db.riskAssessment.findUnique({ where: { id }, include: { assessor: true, tree: { include: { species: true, property: true } } } });
  if (!r) notFound();
  const matrix = computeRisk(r.failureLikelihood, r.impactLikelihood, r.consequence);
  const combined = combinedLikelihood(r.failureLikelihood, r.impactLikelihood);
  return (
    <>
      <PageHeader
        back={{ href: `/arvores/${r.tree.code}?aba=riscos`, label: `Árvore ${r.tree.code}` }}
        title={`Avaliação de risco — ${fmtDate(r.assessedAt)}`}
        subtitle={<>{r.tree.code} · {r.tree.species?.popularName ?? "—"} · {r.tree.property.name}</>}
        actions={<>
          {can("risk:write") && <LinkButton href={`/riscos/${id}/editar`} icon={Pencil}>Editar</LinkButton>}
          {can("risk:delete") && <ActionButton action={deleteRisk.bind(null, id)} confirm="Excluir esta avaliação?" variant="danger-ghost" redirectTo="/riscos"><Trash2 className="size-4" /></ActionButton>}
        </>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Classificação">
          <div className="space-y-3 text-center">
            <RiskBadge value={r.riskRating} />
            <p className="text-xs text-stone-500">Matriz ISA TRAQ: {matrix ? RISK_LEVEL[matrix] : "—"}{matrix && matrix !== r.riskRating && " (ajustado pelo avaliador)"}</p>
            <p className="text-xs text-stone-500">Falha × impacto: {combined !== null ? COMBINED_LIKELIHOOD[combined] : "—"}</p>
            {r.residualRisk && <Badge>Risco residual: {RISK_LEVEL[r.residualRisk]}</Badge>}
          </div>
        </Card>
        <Card title="Detalhes" className="lg:col-span-2">
          <DataList items={[
            ["Técnico", r.assessor?.name],
            ["Alvos potenciais", r.targets.map((t) => labelOf(RISK_TARGETS, t)).join(", ")],
            ["Frequência do alvo", labelOf(TARGET_OCCUPANCY, r.targetOccupancy)],
            ["Parte com possibilidade de falha", labelOf(TREE_PARTS, r.partAtRisk)],
            ["Probabilidade de falha", labelOf(FAILURE_LIKELIHOOD, r.failureLikelihood)],
            ["Probabilidade de impacto", labelOf(IMPACT_LIKELIHOOD, r.impactLikelihood)],
            ["Consequência", labelOf(CONSEQUENCE, r.consequence)],
          ]} />
          {r.recommendedAction && <p className="mt-4 text-sm"><strong>Ação recomendada:</strong> {r.recommendedAction}</p>}
          {r.notes && <p className="mt-2 text-sm whitespace-pre-line">{r.notes}</p>}
          <p className="mt-4 text-sm"><Link className="link" href={`/intervencoes/nova?arvore=${r.tree.code}`}>Registrar intervenção de mitigação →</Link></p>
        </Card>
      </div>
    </>
  );
}
