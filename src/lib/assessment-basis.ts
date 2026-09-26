/* Base técnica da oportunidade/orçamento: inspeções (condição geral) e avaliações de risco (classificação)
 * determinam a urgência e o alcance das intervenções de cada exemplar — e, por consequência, os serviços,
 * quantidades e valores do orçamento. Código puro (sem banco), usado no servidor e testado isoladamente.
 *
 * Critérios (por exemplar, usando a inspeção e a avaliação de risco MAIS RECENTES vinculadas):
 *  Urgência = a maior entre
 *    risco:    Extremo → Urgente · Alto → Alta · Moderado → Média · Baixo → Baixa
 *    condição: Crítica → Urgente · Ruim → Alta · Regular → Média · Boa/Ótima → Baixa
 *    prioridade registrada na inspeção
 *  Alcance (serviço):
 *    Remoção / supressão — risco Extremo ou condição Crítica
 *    Poda                — risco Alto/Moderado ou condição Ruim/Regular
 *    Tratamento fitossanitário (adicional) — fitossanidade Ruim/Crítica ou severidade Alta
 *    Sem intervenção imediata (monitorar) — risco Baixo e condição Boa/Ótima
 *  Árvore morta → remoção/supressão. Árvores removidas, transplantadas ou não localizadas ficam fora do plano.
 */

export type Urgency = "BAIXA" | "MEDIA" | "ALTA" | "URGENTE";
export type PlanService = "SUPRESSAO" | "PODA" | "FITOSSANIDADE";
export const URGENCY_ORDER: Urgency[] = ["BAIXA", "MEDIA", "ALTA", "URGENTE"];
export const URGENCY_LABEL: Record<Urgency, string> = { BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", URGENTE: "Urgente" };
export const PLAN_SERVICE_LABEL: Record<PlanService, string> = { SUPRESSAO: "Remoção / supressão", PODA: "Poda", FITOSSANIDADE: "Tratamento fitossanitário" };

const RISK_URGENCY: Record<string, Urgency> = { EXTREMO: "URGENTE", ALTO: "ALTA", MODERADO: "MEDIA", BAIXO: "BAIXA" };
const CONDITION_URGENCY: Record<string, Urgency> = { CRITICA: "URGENTE", RUIM: "ALTA", REGULAR: "MEDIA", BOA: "BAIXA", OTIMA: "BAIXA" };
const COND_LABEL: Record<string, string> = { OTIMA: "ótima", BOA: "boa", REGULAR: "regular", RUIM: "ruim", CRITICA: "crítica" };
const RISK_LABEL: Record<string, string> = { BAIXO: "baixo", MODERADO: "moderado", ALTO: "alto", EXTREMO: "extremo" };

export type BasisInspection = {
  id: string; treeId: string; date: Date | string; generalCondition: string; phytoCondition?: string | null; phytoSeverity?: string | null;
  priority?: string | null; recommendation?: string | null;
};
export type BasisRisk = { id: string; treeId: string; date: Date | string; riskRating: string; recommendedAction?: string | null };
export type BasisTree = { id: string; code: string; label?: string; status?: string };
const PLANNABLE = ["ATIVA", "MORTA"];

export type TreePlan = {
  treeId: string; code: string; label?: string;
  urgency: Urgency;
  services: PlanService[]; // vazio = sem intervenção imediata
  reasons: string[];
  recommendations: string[];
  inspectionId?: string; riskId?: string;
};
export type PlanGroup = { service: PlanService; urgency: Urgency; trees: TreePlan[] };

const maxUrgency = (xs: (Urgency | undefined)[]) =>
  xs.filter((x): x is Urgency => !!x).reduce<Urgency>((a, b) => (URGENCY_ORDER.indexOf(b) > URGENCY_ORDER.indexOf(a) ? b : a), "BAIXA");
const latest = <T extends { date: Date | string }>(xs: T[]) => xs.reduce<T | undefined>((a, b) => (!a || new Date(b.date) > new Date(a.date) ? b : a), undefined);

export function planInterventions(trees: BasisTree[], inspections: BasisInspection[], risks: BasisRisk[]) {
  const plans: TreePlan[] = [];
  const excluded: BasisTree[] = [];
  for (const t of trees) {
    if (t.status && !PLANNABLE.includes(t.status)) { excluded.push(t); continue; }
    const insp = latest(inspections.filter((i) => i.treeId === t.id));
    const risk = latest(risks.filter((r) => r.treeId === t.id));
    if (!insp && !risk) continue;
    const reasons: string[] = [];
    if (risk) reasons.push(`risco ${RISK_LABEL[risk.riskRating] ?? risk.riskRating}`);
    if (insp) reasons.push(`condição geral ${COND_LABEL[insp.generalCondition] ?? insp.generalCondition}`);
    const urgency = maxUrgency([
      risk && RISK_URGENCY[risk.riskRating],
      insp && CONDITION_URGENCY[insp.generalCondition],
      insp?.priority && (URGENCY_ORDER as string[]).includes(insp.priority) ? (insp.priority as Urgency) : undefined,
    ]);
    const services: PlanService[] = [];
    const r = risk?.riskRating, c = insp?.generalCondition;
    if (t.status === "MORTA") reasons.push("árvore morta");
    if (r === "EXTREMO" || c === "CRITICA" || t.status === "MORTA") services.push("SUPRESSAO");
    else if (r === "ALTO" || r === "MODERADO" || c === "RUIM" || c === "REGULAR") services.push("PODA");
    const phyto = insp && (insp.phytoCondition === "RUIM" || insp.phytoCondition === "CRITICA" || insp.phytoSeverity === "ALTA");
    if (phyto && !services.includes("SUPRESSAO")) { services.push("FITOSSANIDADE"); reasons.push("fitossanidade comprometida"); }
    plans.push({
      treeId: t.id, code: t.code, label: t.label, urgency, services, reasons,
      recommendations: [risk?.recommendedAction, insp?.recommendation].filter((x): x is string => !!x?.trim()),
      inspectionId: insp?.id, riskId: risk?.id,
    });
  }
  plans.sort((a, b) => URGENCY_ORDER.indexOf(b.urgency) - URGENCY_ORDER.indexOf(a.urgency) || a.code.localeCompare(b.code));

  const groups: PlanGroup[] = [];
  for (const p of plans)
    for (const s of p.services) {
      const g = groups.find((x) => x.service === s && x.urgency === p.urgency);
      if (g) g.trees.push(p);
      else groups.push({ service: s, urgency: p.urgency, trees: [p] });
    }
  const svcOrder: PlanService[] = ["SUPRESSAO", "PODA", "FITOSSANIDADE"];
  groups.sort((a, b) => URGENCY_ORDER.indexOf(b.urgency) - URGENCY_ORDER.indexOf(a.urgency) || svcOrder.indexOf(a.service) - svcOrder.indexOf(b.service));
  return { trees: plans, groups, monitorOnly: plans.filter((p) => !p.services.length), excluded };
}
