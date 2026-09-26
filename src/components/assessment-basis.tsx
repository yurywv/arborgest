import Link from "next/link";
import { Calculator, ClipboardCheck, ShieldAlert, X } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { CONDITION, RISK_LEVEL } from "@/lib/catalogs";
import { PLAN_SERVICE_LABEL, URGENCY_LABEL, type Urgency } from "@/lib/assessment-basis";
import { availableBasis, loadBasis, type BasisTarget } from "@/lib/assessment-basis-server";
import { linkBasis, unlinkBasis } from "@/app/(app)/base-tecnica/actions";
import { Badge, Card, ConditionBadge, RiskBadge } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { BasisPicker } from "./assessment-basis-picker";

const URG_TONE: Record<Urgency, "gray" | "blue" | "orange" | "red"> = { BAIXA: "gray", MEDIA: "blue", ALTA: "orange", URGENTE: "red" };

/**
 * Base técnica (inspeções e avaliações de risco) da oportunidade ou do orçamento, com o plano de intervenções:
 * urgência e alcance por exemplar e, no orçamento, atalhos para precificar cada grupo com as árvores já selecionadas.
 */
export async function AssessmentBasis({ target, id, clientId, propertyId, canWrite, priceHref }: {
  target: BasisTarget; id: string; clientId: string; propertyId?: string | null; canWrite: boolean;
  /** Orçamento: monta o link do item (serviço + árvores + urgência). */
  priceHref?: (service: string, treeIds: string[], urgency: Urgency) => string;
}) {
  const [basis, available] = await Promise.all([loadBasis(target, id), canWrite ? availableBasis(target, id, clientId, propertyId) : null]);
  const { inspections, risks, plan } = basis;
  const count = inspections.length + risks.length;
  return (
    <div className="space-y-4" data-testid="assessment-basis">
      <Card title={`Base técnica — inspeções e avaliações de risco (${count})`}>
        {count === 0 ? <p className="text-sm text-stone-500">Nenhuma inspeção ou avaliação de risco vinculada.</p> : (
          <ul className="divide-y divide-stone-100" data-testid="basis-linked">
            {risks.map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-2 text-sm">
                <ShieldAlert className="size-4 shrink-0 text-stone-400" />
                <div className="min-w-0 flex-1">
                  <Link href={`/riscos/${r.id}`} className="link font-mono">{r.tree.code}</Link> · avaliação de risco de {fmtDate(r.assessedAt)} · {r.tree.property.name}
                  {r.recommendedAction && <p className="truncate text-xs text-stone-500">Ação recomendada: {r.recommendedAction}</p>}
                </div>
                <RiskBadge value={r.riskRating} />
                {canWrite && <ActionButton action={unlinkBasis.bind(null, target, id, "risk", r.id)} variant="ghost" size="sm"><X className="size-3.5" /><span className="sr-only">Desvincular</span></ActionButton>}
              </li>
            ))}
            {inspections.map((i) => (
              <li key={i.id} className="flex items-center gap-2 py-2 text-sm">
                <ClipboardCheck className="size-4 shrink-0 text-stone-400" />
                <div className="min-w-0 flex-1">
                  <Link href={`/inspecoes/${i.id}`} className="link font-mono">{i.tree.code}</Link> · inspeção de {fmtDate(i.inspectedAt)} · {i.tree.property.name}
                  {i.recommendation && <p className="truncate text-xs text-stone-500">Recomendação: {i.recommendation}</p>}
                </div>
                <ConditionBadge value={i.generalCondition} />
                {canWrite && <ActionButton action={unlinkBasis.bind(null, target, id, "inspection", i.id)} variant="ghost" size="sm"><X className="size-3.5" /><span className="sr-only">Desvincular</span></ActionButton>}
              </li>
            ))}
          </ul>
        )}
        {canWrite && available && (
          <details className="mt-3 rounded-xl border border-dashed border-stone-300 p-3" open={count === 0}>
            <summary className="cursor-pointer text-sm font-medium">Vincular inspeções / avaliações de risco</summary>
            <div className="mt-3">
              <BasisPicker action={linkBasis.bind(null, target, id)} rows={[
                ...available.risks.map((r) => ({ id: r.id, kind: "risk" as const, date: fmtDate(r.assessedAt), tree: r.tree.code, label: `Risco ${RISK_LEVEL[r.riskRating].toLowerCase()}`, place: r.tree.property.name })),
                ...available.inspections.map((i) => ({ id: i.id, kind: "inspection" as const, date: fmtDate(i.inspectedAt), tree: i.tree.code, label: `Condição ${CONDITION[i.generalCondition].toLowerCase()}`, place: i.tree.property.name })),
              ]} />
            </div>
          </details>
        )}
      </Card>

      {(plan.trees.length > 0 || plan.excluded.length > 0) && (
        <Card title="Plano de intervenções (urgência e alcance)">
          <p className="mb-3 text-xs text-stone-500">
            Por exemplar, com a inspeção e a avaliação de risco mais recentes: urgência pela classificação de risco (Extremo → Urgente, Alto → Alta,
            Moderado → Média) ou pela condição geral (Crítica → Urgente, Ruim → Alta, Regular → Média), a maior delas; alcance: risco Extremo ou
            condição Crítica → remoção/supressão; risco Alto/Moderado ou condição Ruim/Regular → poda; fitossanidade comprometida → tratamento.
          </p>
          <ul className="space-y-3" data-testid="basis-plan">
            {plan.groups.map((g) => (
              <li key={`${g.service}-${g.urgency}`} className="rounded-xl border border-stone-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={URG_TONE[g.urgency]}>Urgência {URGENCY_LABEL[g.urgency].toLowerCase()}</Badge>
                  <span className="font-medium">{PLAN_SERVICE_LABEL[g.service]}</span>
                  <span className="text-sm text-stone-500">· {g.trees.length} árvore(s)</span>
                  {priceHref && canWrite && (
                    <Link href={priceHref(g.service, g.trees.map((t) => t.treeId), g.urgency)} className="btn btn-primary btn-sm ml-auto">
                      <Calculator className="size-3.5" /> Precificar
                    </Link>
                  )}
                </div>
                <ul className="mt-2 space-y-0.5 text-xs text-stone-600">
                  {g.trees.map((t) => (
                    <li key={t.treeId}><span className="font-mono">{t.code}</span> — {t.reasons.join(", ")}{t.recommendations.length ? ` · ${t.recommendations.join(" / ")}` : ""}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {plan.excluded.length > 0 && (
            <p className="mt-3 text-xs text-stone-500">Fora do plano (removidas, transplantadas ou não localizadas): {plan.excluded.map((t) => t.code).join(", ")}.</p>
          )}
          {plan.monitorOnly.length > 0 && (
            <p className="mt-3 text-xs text-stone-500">Sem intervenção imediata (monitorar): {plan.monitorOnly.map((t) => t.code).join(", ")}.</p>
          )}
        </Card>
      )}
    </div>
  );
}
