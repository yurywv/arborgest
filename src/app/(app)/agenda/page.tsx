import Link from "next/link";
import { ChevronLeft, ChevronRight, ClipboardCheck, ClipboardList, Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { INTERVENTION_TYPES, SERVICES, labelOf } from "@/lib/catalogs";
import { teamOptions } from "@/lib/options";
import { spGet, type SP } from "@/lib/query";
import { PageHeader, PriorityBadge, clsx } from "@/components/ui";
import { FilterForm, FilterSelect } from "@/components/filters";

export const metadata = { title: "Agenda" };

const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const dayLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "long" });

type Ev = { date: Date; kind: "os" | "int" | "insp"; title: string; subtitle: string; href: string; priority?: string; team?: string | null };

export default async function AgendaPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission("workorders:read");
  const sp = await searchParams;
  const startParam = spGet(sp, "inicio");
  const teamId = spGet(sp, "equipe");
  const today = new Date(`${dayKey(new Date())}T00:00:00-03:00`);
  const start = startParam && /^\d{4}-\d{2}-\d{2}$/.test(startParam) ? new Date(`${startParam}T00:00:00-03:00`) : today;
  const end = new Date(start.getTime() + 14 * 86_400_000);
  const shift = (days: number) => dayKey(new Date(start.getTime() + days * 86_400_000));

  const [wos, ints, insps, teams] = await Promise.all([
    db.workOrder.findMany({
      where: { scheduledAt: { gte: start, lt: end }, status: { in: ["ABERTA", "PROGRAMADA", "EM_EXECUCAO"] }, ...(teamId && { teamId }) },
      include: { client: { select: { tradeName: true, legalName: true } }, property: { select: { name: true } }, team: { select: { name: true } }, _count: { select: { trees: true } } },
    }),
    db.intervention.findMany({
      where: { scheduledAt: { gte: start, lt: end }, workOrderId: null, status: { in: ["PROGRAMADA", "EM_EXECUCAO", "RECOMENDADA"] }, ...(teamId && { teamId }) },
      include: { tree: { select: { code: true, property: { select: { name: true } } } }, team: { select: { name: true } } },
    }),
    teamId ? Promise.resolve([]) : db.tree.findMany({
      where: { status: "ATIVA", nextInspectionAt: { gte: start, lt: end } },
      select: { code: true, nextInspectionAt: true, species: { select: { popularName: true } }, property: { select: { name: true } } },
    }),
    teamOptions(),
  ]);

  const events: Ev[] = [
    ...wos.map((w) => ({ date: w.scheduledAt!, kind: "os" as const, title: `${w.number} · ${labelOf(SERVICES, w.service)}`, subtitle: `${w.client.tradeName ?? w.client.legalName}${w.property ? ` · ${w.property.name}` : ""} · ${w._count.trees} árvore(s)`, href: `/ordens-servico/${w.id}`, priority: w.priority, team: w.team?.name })),
    ...ints.map((i) => ({ date: i.scheduledAt!, kind: "int" as const, title: labelOf(INTERVENTION_TYPES, i.type), subtitle: `${i.tree.code} · ${i.tree.property.name}`, href: `/intervencoes/${i.id}`, priority: i.priority, team: i.team?.name })),
    ...insps.map((t) => ({ date: t.nextInspectionAt!, kind: "insp" as const, title: `Inspeção ${t.code}`, subtitle: `${t.species?.popularName ?? "—"} · ${t.property.name}`, href: `/inspecoes/nova?arvore=${t.code}` })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const days = Array.from({ length: 14 }, (_, i) => dayKey(new Date(start.getTime() + i * 86_400_000 + 3_600_000)));
  const icon = { os: ClipboardList, int: Wrench, insp: ClipboardCheck };
  const color = { os: "border-l-violet-500", int: "border-l-amber-500", insp: "border-l-brand-600" };

  return (
    <>
      <PageHeader
        title="Agenda"
        subtitle="Ordens de serviço, intervenções programadas e inspeções previstas — 14 dias"
        actions={<>
          <Link className="btn btn-secondary" href={`/agenda?inicio=${shift(-14)}${teamId ? `&equipe=${teamId}` : ""}`}><ChevronLeft className="size-4" /> Anterior</Link>
          <Link className="btn btn-secondary" href="/agenda">Hoje</Link>
          <Link className="btn btn-secondary" href={`/agenda?inicio=${shift(14)}${teamId ? `&equipe=${teamId}` : ""}`}>Próxima <ChevronRight className="size-4" /></Link>
        </>}
      />
      <FilterForm>
        <input type="hidden" name="inicio" value={dayKey(start)} />
        <FilterSelect name="equipe" label="Equipe" options={teams} value={teamId} />
      </FilterForm>
      <div className="space-y-4">
        {days.map((d) => {
          const list = events.filter((e) => dayKey(e.date) === d);
          const isToday = d === dayKey(new Date());
          if (!list.length && !isToday) return null;
          return (
            <section key={d}>
              <h2 className={clsx("mb-2 text-sm font-semibold capitalize", isToday ? "text-brand-700" : "text-stone-600")}>
                {dayLabel.format(new Date(`${d}T12:00:00-03:00`))}{isToday && " · hoje"}
              </h2>
              {list.length === 0 ? <p className="text-sm text-stone-400">Nada agendado.</p> : (
                <ul className="space-y-2">
                  {list.map((e, i) => {
                    const Icon = icon[e.kind];
                    return (
                      <li key={i}>
                        <Link href={e.href} className={clsx("card flex items-center gap-3 border-l-4 p-3 hover:shadow-md", color[e.kind])}>
                          <Icon className="size-5 shrink-0 text-stone-500" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{e.title}</p>
                            <p className="truncate text-xs text-stone-500">{e.subtitle}{e.team ? ` · ${e.team}` : ""}</p>
                          </div>
                          {e.priority && <PriorityBadge value={e.priority} />}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
        {events.length === 0 && <p className="text-sm text-stone-500">Nenhum compromisso no período.</p>}
      </div>
    </>
  );
}
