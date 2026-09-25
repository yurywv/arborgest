import "server-only";
import { db } from "@/lib/db";
import { dec } from "./decimal";
import { SERVICES } from "./registry";

/** Indicadores comerciais do período [from, to). */
export async function pricingIndicators(from: Date, to: Date) {
  const range = { gte: from, lt: to };
  const [created, sent, accepted, rejected, items, byClient, overrides] = await Promise.all([
    db.pricingEstimate.findMany({ where: { date: range }, select: { id: true, negotiatedTotal: true, effectiveMargin: true, marginAfterCommission: true, commissionAmount: true, calculatedTotal: true, itemsTotal: true, discountAmount: true, _count: { select: { items: true } } } }),
    db.pricingEstimate.findMany({ where: { sentAt: range }, select: { negotiatedTotal: true } }),
    db.pricingEstimate.findMany({ where: { acceptedAt: range, status: "ACEITO" }, select: { negotiatedTotal: true, effectiveMargin: true } }),
    db.pricingEstimate.count({ where: { rejectedAt: range, status: "RECUSADO" } }),
    db.pricingEstimateItem.groupBy({ by: ["serviceCode"], where: { estimate: { date: range } }, _count: { _all: true }, _sum: { negotiatedPrice: true, quantity: true } }),
    db.pricingEstimate.groupBy({ by: ["clientId"], where: { date: range }, _count: { _all: true }, _sum: { negotiatedTotal: true }, orderBy: { _sum: { negotiatedTotal: "desc" } }, take: 5 }),
    db.pricingOverride.count({ where: { createdAt: range } }),
  ]);
  const sum = (rows: { negotiatedTotal: unknown }[]) => rows.reduce((a, r) => a.plus(dec(String(r.negotiatedTotal))), dec(0));
  const withItems = created.filter((e) => e._count.items > 0 && e.effectiveMargin !== null);
  const avgMargin = withItems.length ? withItems.reduce((a, e) => a.plus(dec(String(e.marginAfterCommission ?? e.effectiveMargin))), dec(0)).div(withItems.length) : null;
  const commissions = created.reduce((a, e) => a.plus(dec(String(e.commissionAmount))), dec(0));
  const discounts = created.reduce((a, e) => a.plus(dec(String(e.calculatedTotal))).minus(dec(String(e.negotiatedTotal))), dec(0));
  const clients = await db.client.findMany({ where: { id: { in: byClient.map((c) => c.clientId) } }, select: { id: true, legalName: true, tradeName: true } });
  const decided = accepted.length + rejected;
  return {
    count: created.length,
    proposedValue: sum(sent).toNumber(),
    sentCount: sent.length,
    approvedValue: sum(accepted).toNumber(),
    acceptedCount: accepted.length,
    rejectedCount: rejected,
    ticket: accepted.length ? sum(accepted).div(accepted.length).toNumber() : 0,
    avgMargin: avgMargin?.toNumber() ?? null,
    conversion: decided ? accepted.length / decided : null,
    discounts: discounts.toNumber(),
    commissions: commissions.toNumber(),
    overrides,
    byService: items.map((i) => ({
      service: SERVICES[i.serviceCode as keyof typeof SERVICES]?.shortName ?? i.serviceCode, count: i._count._all,
      trees: i._sum.quantity ?? 0, value: Number(i._sum.negotiatedPrice ?? 0),
    })),
    byClient: byClient.map((c) => {
      const cl = clients.find((x) => x.id === c.clientId);
      return { client: cl?.tradeName ?? cl?.legalName ?? "—", count: c._count._all, value: Number(c._sum.negotiatedTotal ?? 0) };
    }),
  };
}
