import Link from "next/link";
import clsx from "clsx";
import { Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { OPPORTUNITY_STAGE, SERVICES, labelOf } from "@/lib/catalogs";
import { clientOptions, userOptions } from "@/lib/options";
import { fmtDate, fmtMoney, toNum } from "@/lib/format";
import { spGet, type SP } from "@/lib/query";
import { Badge, LinkButton, PageHeader } from "@/components/ui";
import { FilterForm, FilterSelect } from "@/components/filters";
import { StageSelect } from "./stage-select";

export const metadata = { title: "Oportunidades" };

const STAGE_COLOR: Record<string, string> = {
  LEAD: "border-t-stone-400", QUALIFICACAO: "border-t-sky-400", VISITA: "border-t-cyan-500", PROPOSTA: "border-t-amber-500",
  NEGOCIACAO: "border-t-orange-500", GANHA: "border-t-emerald-600", PERDIDA: "border-t-stone-300",
};

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("opportunities:read");
  const canWrite = hasPermission(user.permissions, "opportunities:write");
  const canPrice = hasPermission(user.permissions, "pricing:write");
  const sp = await searchParams;
  const clientId = spGet(sp, "cliente");
  const ownerId = spGet(sp, "responsavel");
  const where: Prisma.OpportunityWhereInput = { ...(clientId && { clientId }), ...(ownerId && { ownerId }) };
  const [rows, clients, users] = await Promise.all([
    db.opportunity.findMany({ where, orderBy: [{ expectedDate: "asc" }], include: { client: { select: { legalName: true, tradeName: true } }, owner: { select: { name: true } } } }),
    clientOptions(),
    userOptions(),
  ]);
  const open = rows.filter((r) => r.stage !== "GANHA" && r.stage !== "PERDIDA");
  const pipeline = open.reduce((s, r) => s + (toNum(r.estimatedValue) ?? 0), 0);
  const weighted = open.reduce((s, r) => s + ((toNum(r.estimatedValue) ?? 0) * r.probability) / 100, 0);
  const won = rows.filter((r) => r.stage === "GANHA").reduce((s, r) => s + (toNum(r.estimatedValue) ?? 0), 0);

  return (
    <>
      <PageHeader title="Oportunidades" subtitle="Funil comercial" actions={canWrite && <LinkButton href="/oportunidades/nova" variant="primary" icon={Plus}>Nova oportunidade</LinkButton>} />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="card p-3"><div className="text-xs text-stone-500">Em aberto</div><div className="text-lg font-bold">{fmtMoney(pipeline)}</div></div>
        <div className="card p-3"><div className="text-xs text-stone-500">Ponderado</div><div className="text-lg font-bold">{fmtMoney(weighted)}</div></div>
        <div className="card p-3"><div className="text-xs text-stone-500">Ganhas</div><div className="text-lg font-bold text-emerald-700">{fmtMoney(won)}</div></div>
      </div>
      <FilterForm>
        <FilterSelect name="cliente" label="Cliente" options={clients} value={clientId} />
        <FilterSelect name="responsavel" label="Responsável" options={users} value={ownerId} />
      </FilterForm>

      <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 lg:mx-0 lg:px-0">
        {Object.entries(OPPORTUNITY_STAGE).map(([stage, label]) => {
          const items = rows.filter((r) => r.stage === stage);
          const total = items.reduce((s, r) => s + (toNum(r.estimatedValue) ?? 0), 0);
          return (
            <section key={stage} className={clsx("w-72 shrink-0 snap-start rounded-2xl border-t-4 bg-stone-100 p-2", STAGE_COLOR[stage])}>
              <header className="flex items-center justify-between px-1 py-1.5">
                <h2 className="text-sm font-semibold">{label} <span className="text-stone-500">({items.length})</span></h2>
                <span className="text-xs text-stone-500">{fmtMoney(total)}</span>
              </header>
              <ul className="space-y-2">
                {items.map((o) => (
                  <li key={o.id} className="card space-y-2 p-3">
                    <Link href={canWrite ? `/oportunidades/${o.id}/editar` : "#"} className="block text-sm font-medium hover:underline">{o.description}</Link>
                    <p className="text-xs text-stone-500">{o.client.tradeName ?? o.client.legalName}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge tone="blue">{fmtMoney(o.estimatedValue)}</Badge>
                      <Badge>{o.probability}%</Badge>
                      {o.service && <Badge tone="green">{labelOf(SERVICES, o.service)}</Badge>}
                    </div>
                    <p className="text-xs text-stone-500">{o.owner?.name ?? "Sem responsável"} · {fmtDate(o.expectedDate)}</p>
                    {canWrite && <StageSelect id={o.id} stage={o.stage} />}
                    {canPrice && !["GANHA", "PERDIDA"].includes(o.stage) && <Link href={`/precificacao/novo?oportunidade=${o.id}`} className="btn btn-secondary btn-sm w-full">Precificar</Link>}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
