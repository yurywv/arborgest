import "server-only";
import { db } from "./db";
import { getSettings } from "./settings";
import { PENDING_INTERVENTION } from "./tree-filters";
import type { Permission } from "./auth/permissions";

/**
 * Gera alertas (idempotente por dedupeKey):
 *  - INSPECAO_VENCIDA / INSPECAO_PROXIMA / INTERVENCAO_PENDENTE / OS_ATRASADA: resumo diário por usuário
 *  - CONTRATO_VENCENDO: um alerta por contrato e usuário
 * Disparado pelo cron (/api/cron/notificacoes) e, como fallback, ao abrir a central de notificações.
 * Estrutura pronta para canais externos (e-mail/WhatsApp/push) — ver README.
 */
export async function generateNotifications() {
  const settings = await getSettings();
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
  const inspDays = Number(settings.inspection_alert_days) || 30;
  const contractDays = Number(settings.contract_alert_days) || 60;

  const [overdue, upcoming, pending, lateWO, contracts, users] = await Promise.all([
    db.tree.count({ where: { status: "ATIVA", nextInspectionAt: { lt: now } } }),
    db.tree.count({ where: { status: "ATIVA", nextInspectionAt: { gte: now, lte: new Date(Date.now() + inspDays * 86_400_000) } } }),
    db.intervention.count({ where: { status: { in: [...PENDING_INTERVENTION] }, priority: { in: ["ALTA", "URGENTE"] } } }),
    db.workOrder.count({ where: { status: { in: ["ABERTA", "PROGRAMADA", "EM_EXECUCAO"] }, scheduledAt: { lt: now } } }),
    db.contract.findMany({
      where: { status: "ATIVO", endDate: { gte: now, lte: new Date(Date.now() + contractDays * 86_400_000) } },
      include: { client: { select: { tradeName: true, legalName: true } } },
    }),
    db.user.findMany({ where: { active: true }, include: { role: { select: { permissions: true } } } }),
  ]);

  const rows: { userId: string; type: string; title: string; message: string; link: string; dedupeKey: string }[] = [];
  const to = (perm: Permission) => users.filter((u) => u.role.permissions.includes(perm));

  for (const u of to("inspections:write")) {
    if (overdue) rows.push({ userId: u.id, type: "INSPECAO_VENCIDA", title: "Inspeções vencidas", message: `${overdue} árvore(s) com inspeção vencida.`, link: "/arvores?inspecao=vencida", dedupeKey: `INSPECAO_VENCIDA:${u.id}:${day}` });
    if (upcoming) rows.push({ userId: u.id, type: "INSPECAO_PROXIMA", title: "Próximas inspeções", message: `${upcoming} inspeção(ões) previstas nos próximos ${inspDays} dias.`, link: "/arvores?inspecao=30dias", dedupeKey: `INSPECAO_PROXIMA:${u.id}:${day}` });
  }
  for (const u of to("interventions:write")) {
    if (pending) rows.push({ userId: u.id, type: "INTERVENCAO_PENDENTE", title: "Intervenções prioritárias pendentes", message: `${pending} intervenção(ões) de prioridade alta/urgente aguardando execução.`, link: "/intervencoes?pendentes=1", dedupeKey: `INTERVENCAO_PENDENTE:${u.id}:${day}` });
  }
  for (const u of to("workorders:write")) {
    if (lateWO) rows.push({ userId: u.id, type: "OS_ATRASADA", title: "Ordens de serviço atrasadas", message: `${lateWO} OS com data prevista vencida.`, link: "/ordens-servico?atrasadas=1", dedupeKey: `OS_ATRASADA:${u.id}:${day}` });
  }
  for (const u of to("contracts:read")) {
    for (const c of contracts) {
      rows.push({
        userId: u.id, type: "CONTRATO_VENCENDO", title: `Contrato ${c.number} próximo do vencimento`,
        message: `${c.client.tradeName ?? c.client.legalName} — vence em ${new Intl.DateTimeFormat("pt-BR").format(c.endDate!)}.`,
        link: `/contratos/${c.id}`, dedupeKey: `CONTRATO_VENCENDO:${c.id}:${u.id}:${c.endDate!.toISOString().slice(0, 10)}`,
      });
    }
  }
  const res = await db.notification.createMany({ data: rows, skipDuplicates: true });
  await db.setting.upsert({ where: { key: "notifications_last_run" }, create: { key: "notifications_last_run", value: now.toISOString() }, update: { value: now.toISOString() } });
  return { created: res.count };
}

/** Executa a geração se a última rodada foi há mais de 6 horas (fallback sem cron). */
export async function maybeGenerateNotifications() {
  const last = await db.setting.findUnique({ where: { key: "notifications_last_run" } });
  if (!last || Date.now() - new Date(last.value).getTime() > 6 * 3_600_000) await generateNotifications();
}
