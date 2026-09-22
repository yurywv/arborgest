import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { treeWhere, PENDING_INTERVENTION } from "./tree-filters";
import { spGet, type SP } from "./query";
import {
  CONDITION, CONFLICTS, CONSEQUENCE, FAILURE_LIKELIHOOD, FINDINGS_BY_CATEGORY, IMPACT_LIKELIHOOD, INSPECTION_REASONS, INTERVENTION_STATUS,
  INTERVENTION_TYPES, LEVEL3, PHOTO_TYPES, PRIORITY, RISK_LEVEL, RISK_TARGETS, SERVICES, SITE_TYPES, SPECIES_ORIGIN, TREE_PARTS, TREE_STATUS,
  WORK_ORDER_STATUS, labelOf, type FindingCategoryKey,
} from "./catalogs";
import { fmtDate, toNum } from "./format";

export type Cell = string | number | null;
export type Column = { key: string; label: string; width?: number; numeric?: boolean };
export type Report = {
  title: string;
  subtitle?: string;
  columns: Column[];
  rows: Record<string, Cell>[];
  photos?: { treeCode: string; caption: string; storageKey: string }[];
};

export const REPORTS = [
  { key: "inventario", label: "Inventário arbóreo", description: "Todos os exemplares com localização, biometria e estado atual.", treeFilters: true },
  { key: "por-cliente", label: "Árvores por cliente", description: "Quantitativo por cliente, com condição e risco.", treeFilters: true },
  { key: "por-propriedade", label: "Árvores por propriedade", description: "Quantitativo por propriedade e setor.", treeFilters: true },
  { key: "por-especie", label: "Árvores por espécie", description: "Composição florística, médias de DAP e altura.", treeFilters: true },
  { key: "fitossanidade", label: "Condição fitossanitária", description: "Estado fitossanitário e ocorrências da última inspeção.", treeFilters: true },
  { key: "risco", label: "Avaliação de risco", description: "Última avaliação ISA TRAQ de cada exemplar.", treeFilters: true },
  { key: "inspecoes-vencidas", label: "Inspeções vencidas", description: "Exemplares ativos com inspeção vencida ou nos próximos 30 dias.", treeFilters: true },
  { key: "intervencoes", label: "Intervenções recomendadas", description: "Intervenções pendentes (recomendadas, programadas, em execução).", treeFilters: true },
  { key: "historico", label: "Histórico da árvore", description: "Linha do tempo completa de um exemplar (informe o código).", treeFilters: false },
  { key: "ordens-servico", label: "Ordens de serviço", description: "OS no período, com status, equipe e custos.", treeFilters: false },
  { key: "fotografico", label: "Relatório fotográfico", description: "Fotos dos exemplares filtrados (PDF com imagens).", treeFilters: true },
] as const;

export type ReportKey = (typeof REPORTS)[number]["key"];

const dateRange = (sp: SP, field: string) => {
  const from = spGet(sp, "de");
  const to = spGet(sp, "ate");
  if (!from && !to) return {};
  return { [field]: { ...(from && { gte: new Date(`${from}T00:00:00-03:00`) }), ...(to && { lte: new Date(`${to}T23:59:59-03:00`) }) } };
};

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};

const treeBase = {
  species: true,
  sector: { select: { name: true } },
  property: { select: { name: true, client: { select: { legalName: true, tradeName: true } } } },
} satisfies Prisma.TreeInclude;

export async function buildReport(key: string, sp: SP): Promise<Report | null> {
  const where = treeWhere(sp);
  switch (key as ReportKey) {
    case "inventario": {
      const trees = await db.tree.findMany({ where, orderBy: { code: "asc" }, include: treeBase });
      return {
        title: "Inventário arbóreo",
        subtitle: `${trees.length} exemplar(es)`,
        columns: [
          { key: "code", label: "Código", width: 22 }, { key: "status", label: "Status", width: 18 }, { key: "client", label: "Cliente", width: 30 },
          { key: "property", label: "Propriedade", width: 30 }, { key: "sector", label: "Setor", width: 22 }, { key: "popular", label: "Nome popular", width: 24 },
          { key: "scientific", label: "Nome científico", width: 30 }, { key: "family", label: "Família", width: 20 }, { key: "origin", label: "Origem", width: 12 },
          { key: "dap", label: "DAP (cm)", numeric: true, width: 12 }, { key: "height", label: "Altura (m)", numeric: true, width: 12 },
          { key: "crown", label: "Copa (m)", numeric: true, width: 12 }, { key: "condition", label: "Condição", width: 14 }, { key: "risk", label: "Risco", width: 14 },
          { key: "site", label: "Local", width: 18 }, { key: "conflicts", label: "Conflitos", width: 30 },
          { key: "lat", label: "Latitude", numeric: true, width: 14 }, { key: "lng", label: "Longitude", numeric: true, width: 14 },
          { key: "last", label: "Última inspeção", width: 14 }, { key: "next", label: "Próxima inspeção", width: 14 },
        ],
        rows: trees.map((t) => ({
          code: t.code, status: TREE_STATUS[t.status], client: t.property.client.tradeName ?? t.property.client.legalName, property: t.property.name,
          sector: t.sector?.name ?? null, popular: t.species?.popularName ?? null, scientific: t.species?.scientificName ?? null, family: t.species?.family ?? null,
          origin: labelOf(SPECIES_ORIGIN, t.species?.origin), dap: t.currentDap, height: t.currentHeight, crown: t.currentCrownDiam,
          condition: t.currentCondition ? CONDITION[t.currentCondition] : null, risk: t.currentRisk ? RISK_LEVEL[t.currentRisk] : null,
          site: labelOf(SITE_TYPES, t.siteType), conflicts: t.conflicts.map((c) => labelOf(CONFLICTS, c)).join(", "),
          lat: t.latitude, lng: t.longitude, last: fmtDate(t.lastInspectionAt), next: fmtDate(t.nextInspectionAt),
        })),
      };
    }
    case "por-cliente":
    case "por-propriedade": {
      const byClient = key === "por-cliente";
      const trees = await db.tree.findMany({ where, include: treeBase });
      const groups = new Map<string, typeof trees>();
      for (const t of trees) {
        const k = byClient ? (t.property.client.tradeName ?? t.property.client.legalName) : `${t.property.name}${t.sector ? ` › ${t.sector.name}` : ""}`;
        groups.set(k, [...(groups.get(k) ?? []), t]);
      }
      const count = (ts: typeof trees, f: (t: (typeof trees)[number]) => boolean) => ts.filter(f).length;
      return {
        title: byClient ? "Árvores por cliente" : "Árvores por propriedade e setor",
        subtitle: `${trees.length} exemplar(es) em ${groups.size} grupo(s)`,
        columns: [
          { key: "group", label: byClient ? "Cliente" : "Propriedade › setor", width: 44 }, { key: "total", label: "Total", numeric: true },
          { key: "active", label: "Ativas", numeric: true }, { key: "species", label: "Espécies", numeric: true },
          { key: "good", label: "Ótima/Boa", numeric: true }, { key: "regular", label: "Regular", numeric: true }, { key: "bad", label: "Ruim/Crítica", numeric: true },
          { key: "highRisk", label: "Risco alto/extremo", numeric: true }, { key: "overdue", label: "Insp. vencidas", numeric: true },
          { key: "dap", label: "DAP médio (cm)", numeric: true },
        ],
        rows: [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([g, ts]) => ({
          group: g, total: ts.length, active: count(ts, (t) => t.status === "ATIVA"), species: new Set(ts.map((t) => t.speciesId)).size,
          good: count(ts, (t) => t.currentCondition === "OTIMA" || t.currentCondition === "BOA"), regular: count(ts, (t) => t.currentCondition === "REGULAR"),
          bad: count(ts, (t) => t.currentCondition === "RUIM" || t.currentCondition === "CRITICA"),
          highRisk: count(ts, (t) => t.currentRisk === "ALTO" || t.currentRisk === "EXTREMO"),
          overdue: count(ts, (t) => t.status === "ATIVA" && !!t.nextInspectionAt && t.nextInspectionAt < new Date()),
          dap: avg(ts.map((t) => t.currentDap)),
        })),
      };
    }
    case "por-especie": {
      const trees = await db.tree.findMany({ where, include: { species: true } });
      const groups = new Map<string, typeof trees>();
      for (const t of trees) groups.set(t.speciesId ?? "—", [...(groups.get(t.speciesId ?? "—") ?? []), t]);
      return {
        title: "Árvores por espécie",
        subtitle: `${trees.length} exemplar(es), ${groups.size} espécie(s)`,
        columns: [
          { key: "popular", label: "Nome popular", width: 26 }, { key: "scientific", label: "Nome científico", width: 32 }, { key: "family", label: "Família", width: 20 },
          { key: "origin", label: "Origem", width: 12 }, { key: "invasive", label: "Invasora", width: 10 }, { key: "count", label: "Qtde.", numeric: true },
          { key: "pct", label: "%", numeric: true }, { key: "dap", label: "DAP médio (cm)", numeric: true }, { key: "height", label: "Altura média (m)", numeric: true },
        ],
        rows: [...groups.values()].sort((a, b) => b.length - a.length).map((ts) => {
          const s = ts[0].species;
          return {
            popular: s?.popularName ?? "Não identificada", scientific: s?.scientificName ?? null, family: s?.family ?? null, origin: labelOf(SPECIES_ORIGIN, s?.origin),
            invasive: s ? (s.invasive ? "Sim" : "Não") : null, count: ts.length, pct: Math.round((ts.length / trees.length) * 1000) / 10,
            dap: avg(ts.map((t) => t.currentDap)), height: avg(ts.map((t) => t.currentHeight)),
          };
        }),
      };
    }
    case "fitossanidade": {
      const trees = await db.tree.findMany({
        where, orderBy: { code: "asc" },
        include: { ...treeBase, inspections: { orderBy: { inspectedAt: "desc" }, take: 1, include: { findings: true } } },
      });
      const cat: FindingCategoryKey = "FITOSSANIDADE";
      return {
        title: "Condição fitossanitária",
        subtitle: "Baseado na última inspeção de cada exemplar",
        columns: [
          { key: "code", label: "Código", width: 22 }, { key: "popular", label: "Espécie", width: 26 }, { key: "property", label: "Propriedade", width: 28 },
          { key: "date", label: "Inspeção", width: 14 }, { key: "phyto", label: "Estado fitossanitário", width: 18 }, { key: "severity", label: "Severidade", width: 12 },
          { key: "findings", label: "Ocorrências", width: 40 }, { key: "probable", label: "Diagnóstico provável", width: 30 }, { key: "confirmed", label: "Diagnóstico confirmado", width: 30 },
        ],
        rows: trees.map((t) => {
          const i = t.inspections[0];
          return {
            code: t.code, popular: t.species?.popularName ?? null, property: t.property.name, date: fmtDate(i?.inspectedAt),
            phyto: i?.phytoCondition ? CONDITION[i.phytoCondition] : null, severity: labelOf(LEVEL3, i?.phytoSeverity),
            findings: i ? i.findings.filter((f) => f.category === cat).map((f) => labelOf(FINDINGS_BY_CATEGORY[cat].options, f.code)).join(", ") : null,
            probable: i?.probableDiagnosis ?? null, confirmed: i?.confirmedDiagnosis ?? null,
          };
        }),
      };
    }
    case "risco": {
      const trees = await db.tree.findMany({
        where: { AND: [where, { riskAssessments: { some: {} } }] }, orderBy: { code: "asc" },
        include: { ...treeBase, riskAssessments: { orderBy: { assessedAt: "desc" }, take: 1, include: { assessor: { select: { name: true } } } } },
      });
      const order = { EXTREMO: 0, ALTO: 1, MODERADO: 2, BAIXO: 3 };
      return {
        title: "Avaliação de risco (ISA TRAQ)",
        subtitle: `${trees.length} exemplar(es) avaliados — ordenado por risco`,
        columns: [
          { key: "code", label: "Código", width: 22 }, { key: "popular", label: "Espécie", width: 24 }, { key: "property", label: "Propriedade", width: 28 },
          { key: "date", label: "Data", width: 14 }, { key: "targets", label: "Alvos", width: 30 }, { key: "part", label: "Parte", width: 22 },
          { key: "failure", label: "Prob. falha", width: 14 }, { key: "impact", label: "Prob. impacto", width: 14 }, { key: "consequence", label: "Consequência", width: 14 },
          { key: "rating", label: "Risco", width: 12 }, { key: "residual", label: "Residual", width: 12 }, { key: "action", label: "Ação recomendada", width: 40 },
        ],
        rows: trees
          .map((t) => ({ t, r: t.riskAssessments[0] }))
          .sort((a, b) => order[a.r.riskRating] - order[b.r.riskRating])
          .map(({ t, r }) => ({
            code: t.code, popular: t.species?.popularName ?? null, property: t.property.name, date: fmtDate(r.assessedAt),
            targets: r.targets.map((x) => labelOf(RISK_TARGETS, x)).join(", "), part: labelOf(TREE_PARTS, r.partAtRisk),
            failure: labelOf(FAILURE_LIKELIHOOD, r.failureLikelihood), impact: labelOf(IMPACT_LIKELIHOOD, r.impactLikelihood),
            consequence: labelOf(CONSEQUENCE, r.consequence), rating: RISK_LEVEL[r.riskRating], residual: r.residualRisk ? RISK_LEVEL[r.residualRisk] : null,
            action: r.recommendedAction,
          })),
      };
    }
    case "inspecoes-vencidas": {
      const trees = await db.tree.findMany({
        where: { AND: [where, { status: "ATIVA", nextInspectionAt: { lte: new Date(Date.now() + 30 * 86_400_000) } }] },
        orderBy: { nextInspectionAt: "asc" }, include: treeBase,
      });
      return {
        title: "Inspeções vencidas e próximas (30 dias)",
        subtitle: `${trees.length} exemplar(es)`,
        columns: [
          { key: "code", label: "Código", width: 22 }, { key: "popular", label: "Espécie", width: 24 }, { key: "client", label: "Cliente", width: 28 },
          { key: "property", label: "Propriedade", width: 28 }, { key: "last", label: "Última inspeção", width: 14 }, { key: "next", label: "Próxima inspeção", width: 14 },
          { key: "days", label: "Dias", numeric: true }, { key: "situation", label: "Situação", width: 12 }, { key: "condition", label: "Condição", width: 12 }, { key: "risk", label: "Risco", width: 12 },
        ],
        rows: trees.map((t) => {
          const days = Math.round((t.nextInspectionAt!.getTime() - Date.now()) / 86_400_000);
          return {
            code: t.code, popular: t.species?.popularName ?? null, client: t.property.client.tradeName ?? t.property.client.legalName, property: t.property.name,
            last: fmtDate(t.lastInspectionAt), next: fmtDate(t.nextInspectionAt), days, situation: days < 0 ? "Vencida" : "A vencer",
            condition: t.currentCondition ? CONDITION[t.currentCondition] : null, risk: t.currentRisk ? RISK_LEVEL[t.currentRisk] : null,
          };
        }),
      };
    }
    case "intervencoes": {
      const rows = await db.intervention.findMany({
        where: { status: { in: [...PENDING_INTERVENTION] }, tree: where, ...dateRange(sp, "recommendedAt") },
        orderBy: [{ priority: "desc" }, { recommendedAt: "asc" }],
        include: { tree: { include: treeBase }, team: { select: { name: true } }, workOrder: { select: { number: true } } },
      });
      return {
        title: "Intervenções recomendadas e pendentes",
        subtitle: `${rows.length} intervenção(ões) · custo previsto ${rows.reduce((s, i) => s + (toNum(i.estimatedCost) ?? 0), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
        columns: [
          { key: "code", label: "Árvore", width: 22 }, { key: "popular", label: "Espécie", width: 22 }, { key: "property", label: "Propriedade", width: 28 },
          { key: "type", label: "Tipo", width: 26 }, { key: "priority", label: "Prioridade", width: 12 }, { key: "status", label: "Status", width: 14 },
          { key: "recommended", label: "Recomendada", width: 14 }, { key: "scheduled", label: "Programada", width: 14 }, { key: "team", label: "Equipe", width: 20 },
          { key: "wo", label: "OS", width: 16 }, { key: "cost", label: "Custo previsto (R$)", numeric: true },
        ],
        rows: rows.map((i) => ({
          code: i.tree.code, popular: i.tree.species?.popularName ?? null, property: i.tree.property.name, type: labelOf(INTERVENTION_TYPES, i.type),
          priority: PRIORITY[i.priority], status: INTERVENTION_STATUS[i.status], recommended: fmtDate(i.recommendedAt), scheduled: fmtDate(i.scheduledAt),
          team: i.team?.name ?? null, wo: i.workOrder?.number ?? null, cost: toNum(i.estimatedCost),
        })),
      };
    }
    case "historico": {
      const code = spGet(sp, "arvore")?.toUpperCase();
      if (!code) return { title: "Histórico da árvore", subtitle: "Informe o código da árvore no filtro.", columns: [], rows: [] };
      const t = await db.tree.findUnique({
        where: { code },
        include: {
          ...treeBase,
          measurements: { orderBy: { measuredAt: "asc" } },
          inspections: { orderBy: { inspectedAt: "asc" }, include: { inspector: { select: { name: true } }, findings: true } },
          riskAssessments: { orderBy: { assessedAt: "asc" } },
          interventions: { orderBy: { createdAt: "asc" } },
        },
      });
      if (!t) return { title: "Histórico da árvore", subtitle: `Árvore ${code} não encontrada.`, columns: [], rows: [] };
      type Row = { date: Date; kind: string; detail: string; by?: string | null };
      const ev: Row[] = [
        { date: t.createdAt, kind: "Cadastro", detail: `Código ${t.code}` },
        ...t.measurements.map((m) => ({ date: m.measuredAt, kind: "Medição", detail: `CAP ${m.cap ?? "—"} cm · DAP ${m.dap ?? "—"} cm · altura ${m.totalHeight ?? "—"} m · copa ${m.crownDiameterNS ?? "—"}×${m.crownDiameterEW ?? "—"} m` })),
        ...t.inspections.map((i) => ({
          date: i.inspectedAt, kind: "Inspeção", by: i.inspector?.name,
          detail: `${labelOf(INSPECTION_REASONS, i.reason)} · condição ${CONDITION[i.generalCondition]} · ${i.findings.length} achado(s)${i.recommendation ? ` · ${i.recommendation}` : ""}`,
        })),
        ...t.riskAssessments.map((r) => ({ date: r.assessedAt, kind: "Avaliação de risco", detail: `Risco ${RISK_LEVEL[r.riskRating]}${r.recommendedAction ? ` · ${r.recommendedAction}` : ""}` })),
        ...t.interventions.map((i) => ({ date: i.executedAt ?? i.scheduledAt ?? i.createdAt, kind: labelOf(INTERVENTION_TYPES, i.type), detail: `${INTERVENTION_STATUS[i.status]}${i.description ? ` · ${i.description}` : ""}` })),
      ].sort((a, b) => a.date.getTime() - b.date.getTime());
      return {
        title: `Histórico da árvore ${t.code}`,
        subtitle: `${t.species?.popularName ?? "Espécie não identificada"}${t.species ? ` (${t.species.scientificName})` : ""} · ${t.property.name} · ${TREE_STATUS[t.status]}`,
        columns: [{ key: "year", label: "Ano", width: 8 }, { key: "date", label: "Data", width: 14 }, { key: "kind", label: "Evento", width: 26 }, { key: "detail", label: "Detalhes", width: 80 }, { key: "by", label: "Responsável", width: 22 }],
        rows: ev.map((e) => ({ year: e.date.getFullYear(), date: fmtDate(e.date), kind: e.kind, detail: e.detail, by: e.by ?? null })),
      };
    }
    case "ordens-servico": {
      const status = spGet(sp, "status_os");
      const clientId = spGet(sp, "cliente");
      const rows = await db.workOrder.findMany({
        where: { ...(status && { status: status as never }), ...(clientId && { clientId }), ...dateRange(sp, "scheduledAt") },
        orderBy: { scheduledAt: "asc" },
        include: { client: { select: { tradeName: true, legalName: true } }, property: { select: { name: true } }, team: { select: { name: true } }, responsible: { select: { name: true } }, _count: { select: { trees: true } } },
      });
      return {
        title: "Ordens de serviço",
        subtitle: `${rows.length} OS · custo total ${rows.reduce((s, w) => s + (toNum(w.cost) ?? 0), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
        columns: [
          { key: "number", label: "Número", width: 18 }, { key: "client", label: "Cliente", width: 28 }, { key: "property", label: "Propriedade", width: 28 },
          { key: "service", label: "Serviço", width: 24 }, { key: "trees", label: "Árvores", numeric: true }, { key: "priority", label: "Prioridade", width: 12 },
          { key: "scheduled", label: "Prevista", width: 14 }, { key: "executed", label: "Executada", width: 14 }, { key: "team", label: "Equipe", width: 20 },
          { key: "responsible", label: "Responsável", width: 20 }, { key: "status", label: "Status", width: 14 }, { key: "cost", label: "Custo (R$)", numeric: true },
        ],
        rows: rows.map((w) => ({
          number: w.number, client: w.client.tradeName ?? w.client.legalName, property: w.property?.name ?? null, service: labelOf(SERVICES, w.service),
          trees: w._count.trees, priority: PRIORITY[w.priority], scheduled: fmtDate(w.scheduledAt), executed: fmtDate(w.executedAt),
          team: w.team?.name ?? null, responsible: w.responsible?.name ?? null, status: WORK_ORDER_STATUS[w.status], cost: toNum(w.cost),
        })),
      };
    }
    case "fotografico": {
      const photos = await db.photo.findMany({
        where: { tree: where, ...dateRange(sp, "takenAt") },
        orderBy: [{ tree: { code: "asc" } }, { takenAt: "asc" }],
        take: 400,
        include: { tree: { include: { species: true, property: { select: { name: true } } } }, uploadedBy: { select: { name: true } } },
      });
      return {
        title: "Relatório fotográfico",
        subtitle: `${photos.length} foto(s)${photos.length === 400 ? " (limite de 400)" : ""}`,
        columns: [
          { key: "code", label: "Árvore", width: 22 }, { key: "popular", label: "Espécie", width: 24 }, { key: "property", label: "Propriedade", width: 28 },
          { key: "type", label: "Tipo", width: 14 }, { key: "date", label: "Data", width: 14 }, { key: "description", label: "Descrição", width: 40 }, { key: "by", label: "Enviada por", width: 20 },
        ],
        rows: photos.map((p) => ({
          code: p.tree?.code ?? null, popular: p.tree?.species?.popularName ?? null, property: p.tree?.property.name ?? null,
          type: labelOf(PHOTO_TYPES, p.type), date: fmtDate(p.takenAt), description: p.description, by: p.uploadedBy?.name ?? null,
        })),
        photos: photos.map((p) => ({
          treeCode: p.tree?.code ?? "",
          caption: `${p.tree?.code ?? ""} · ${p.tree?.species?.popularName ?? ""} · ${labelOf(PHOTO_TYPES, p.type)} · ${fmtDate(p.takenAt)}${p.description ? ` — ${p.description}` : ""}`,
          storageKey: p.storageKey,
        })),
      };
    }
    default:
      return null;
  }
}
