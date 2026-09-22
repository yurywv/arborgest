import Link from "next/link";
import { Plus, ShieldAlert } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { RISK_LEVEL, RISK_TARGETS, TREE_PARTS, enumOptions, labelOf } from "@/lib/catalogs";
import { clientOptions, propertyOptions } from "@/lib/options";
import { fmtDate } from "@/lib/format";
import { pageOf, spFlat, spGet, type SP } from "@/lib/query";
import { EmptyState, LinkButton, MobileCard, PageHeader, Pagination, ResponsiveTable, RiskBadge } from "@/components/ui";
import { FilterForm, FilterSelect } from "@/components/filters";

export const metadata = { title: "Avaliações de risco" };

export default async function RisksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("risk:read");
  const sp = await searchParams;
  const f = (k: string) => spGet(sp, k);
  const { page, pageSize, skip, take } = pageOf(sp, 30);
  const where: Prisma.RiskAssessmentWhereInput = {
    ...(f("risco") && { riskRating: f("risco") as never }),
    ...(f("cliente") && { tree: { property: { clientId: f("cliente") } } }),
    ...(f("propriedade") && { tree: { propertyId: f("propriedade") } }),
    ...(f("alvo") && { targets: { has: f("alvo") } }),
    ...(f("atual") && { tree: { currentRisk: { not: null } } }),
  };
  const [rows, total, clients, properties] = await Promise.all([
    db.riskAssessment.findMany({ where, skip, take, orderBy: { assessedAt: "desc" }, include: { tree: { select: { code: true, species: { select: { popularName: true } }, property: { select: { name: true } } } }, assessor: { select: { name: true } } } }),
    db.riskAssessment.count({ where }),
    clientOptions(), propertyOptions(),
  ]);
  return (
    <>
      <PageHeader title="Avaliações de risco" subtitle="Metodologia ISA TRAQ" actions={hasPermission(user.permissions, "risk:write") && <LinkButton href="/riscos/nova" variant="primary" icon={Plus}>Nova avaliação</LinkButton>} />
      <FilterForm>
        <FilterSelect name="risco" label="Classificação" options={enumOptions(RISK_LEVEL)} value={f("risco")} />
        <FilterSelect name="alvo" label="Alvo" options={RISK_TARGETS} value={f("alvo")} />
        <FilterSelect name="cliente" label="Cliente" options={clients} value={f("cliente")} />
        <FilterSelect name="propriedade" label="Propriedade" options={properties} value={f("propriedade")} />
      </FilterForm>
      {rows.length === 0 ? <EmptyState icon={ShieldAlert} title="Nenhuma avaliação encontrada" /> : (
        <ResponsiveTable
          head={<tr><th>Data</th><th>Árvore</th><th>Propriedade</th><th>Alvos</th><th>Parte</th><th>Técnico</th><th>Risco</th></tr>}
          mobile={rows.map((r) => <MobileCard key={r.id} href={`/riscos/${r.id}`} title={`${fmtDate(r.assessedAt)} · ${r.tree.code}`} subtitle={r.tree.property.name} right={<RiskBadge value={r.riskRating} />} />)}
        >
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap"><Link className="link" href={`/riscos/${r.id}`}>{fmtDate(r.assessedAt)}</Link></td>
              <td><Link className="font-mono hover:underline" href={`/arvores/${r.tree.code}`}>{r.tree.code}</Link><div className="text-xs text-stone-500">{r.tree.species?.popularName ?? "—"}</div></td>
              <td>{r.tree.property.name}</td>
              <td className="max-w-48 text-xs">{r.targets.map((t) => labelOf(RISK_TARGETS, t)).join(", ")}</td>
              <td className="text-xs">{labelOf(TREE_PARTS, r.partAtRisk)}</td>
              <td>{r.assessor?.name ?? "—"}</td>
              <td><RiskBadge value={r.riskRating} /></td>
            </tr>
          ))}
        </ResponsiveTable>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/riscos" />
    </>
  );
}
