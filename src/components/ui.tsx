import Link from "next/link";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { CONDITION, CONTACT_TYPE, PRIORITY, RISK_LEVEL, TREE_STATUS } from "@/lib/catalogs";

export { clsx };

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1 inline-block text-sm text-stone-500 hover:text-stone-800">
            ← {back.label}
          </Link>
        )}
        <h1 className="truncate text-2xl font-bold tracking-tight text-stone-900">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-stone-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={clsx("card", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-stone-100 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-stone-800">{title}</h2>
          {actions && <div className="flex gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx("card-body", bodyClassName)}>{children}</div>
    </section>
  );
}

const TONES = {
  gray: "bg-stone-100 text-stone-700 ring-stone-200",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  lime: "bg-lime-50 text-lime-800 ring-lime-200",
  yellow: "bg-amber-50 text-amber-800 ring-amber-200",
  orange: "bg-orange-50 text-orange-800 ring-orange-200",
  red: "bg-red-50 text-red-800 ring-red-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
  violet: "bg-violet-50 text-violet-800 ring-violet-200",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const CONDITION_TONE: Record<string, Tone> = { OTIMA: "green", BOA: "lime", REGULAR: "yellow", RUIM: "orange", CRITICA: "red" };
export const RISK_TONE: Record<string, Tone> = { BAIXO: "green", MODERADO: "yellow", ALTO: "orange", EXTREMO: "red" };
export const PRIORITY_TONE: Record<string, Tone> = { BAIXA: "gray", MEDIA: "blue", ALTA: "orange", URGENTE: "red" };
export const CONTACT_TYPE_TONE: Record<string, Tone> = { GERAL: "gray", ADMINISTRATIVO: "violet", COMERCIAL: "blue", TECNICO: "lime" };
export const TREE_STATUS_TONE: Record<string, Tone> = {
  ATIVA: "green", MORTA: "red", REMOVIDA: "gray", TRANSPLANTADA: "blue", SUBSTITUIDA: "violet", NAO_LOCALIZADA: "yellow",
};
export const FLOW_STATUS_TONE: Record<string, Tone> = {
  RECOMENDADA: "yellow", ABERTA: "yellow", PROGRAMADA: "blue", EM_EXECUCAO: "violet", CONCLUIDA: "green", CANCELADA: "gray",
};

/** Cores hex para marcadores no mapa e gráficos. */
export const CONDITION_COLOR: Record<string, string> = { OTIMA: "#059669", BOA: "#65a30d", REGULAR: "#d97706", RUIM: "#ea580c", CRITICA: "#dc2626" };
export const RISK_COLOR: Record<string, string> = { BAIXO: "#059669", MODERADO: "#d97706", ALTO: "#ea580c", EXTREMO: "#b91c1c" };

export const ConditionBadge = ({ value }: { value?: string | null }) =>
  value ? <Badge tone={CONDITION_TONE[value]}>{CONDITION[value]}</Badge> : <Badge>Sem avaliação</Badge>;
export const RiskBadge = ({ value }: { value?: string | null }) =>
  value ? <Badge tone={RISK_TONE[value]}>Risco {RISK_LEVEL[value].toLowerCase()}</Badge> : <Badge>Risco n/a</Badge>;
export const PriorityBadge = ({ value }: { value?: string | null }) =>
  value ? <Badge tone={PRIORITY_TONE[value]}>{PRIORITY[value]}</Badge> : null;
export const TreeStatusBadge = ({ value }: { value: string }) => <Badge tone={TREE_STATUS_TONE[value]}>{TREE_STATUS[value]}</Badge>;
export const FlowStatusBadge = ({ value, labels }: { value: string; labels: Record<string, string> }) => (
  <Badge tone={FLOW_STATUS_TONE[value] ?? "gray"}>{labels[value] ?? value}</Badge>
);

export const ContactTypeBadge = ({ value }: { value: string }) => <Badge tone={CONTACT_TYPE_TONE[value]}>{CONTACT_TYPE[value] ?? value}</Badge>;

export function StatCard({
  label,
  value,
  icon: Icon,
  href,
  tone = "brand",
  hint,
}: {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  href?: string;
  tone?: "brand" | "red" | "amber" | "sky" | "stone";
  hint?: React.ReactNode;
}) {
  const toneCls = {
    brand: "bg-brand-50 text-brand-700",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
    sky: "bg-sky-50 text-sky-700",
    stone: "bg-stone-100 text-stone-700",
  }[tone];
  const inner = (
    <div className="card flex h-full items-center gap-2.5 p-3 transition hover:shadow-md sm:gap-3 sm:p-4">
      {Icon && (
        <div className={clsx("grid size-9 shrink-0 place-items-center rounded-xl sm:size-11", toneCls)}>
          <Icon className="size-5" />
        </div>
      )}
      <div className="min-w-0">
        <div className="text-2xl leading-tight font-bold text-stone-900 tabular-nums">{value}</div>
        <div className="text-xs leading-tight font-medium text-stone-500">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-stone-400">{hint}</div>}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

export function EmptyState({ title, description, action, icon: Icon }: { title: string; description?: string; action?: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
      {Icon && <Icon className="mb-3 size-10 text-stone-300" />}
      <p className="font-semibold text-stone-700">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-stone-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Lista de pares rótulo/valor para fichas de detalhe. */
export function DataList({ items, cols = 2 }: { items: [React.ReactNode, React.ReactNode][]; cols?: 1 | 2 | 3 }) {
  return (
    <dl
      className={clsx(
        "grid gap-x-6 gap-y-3",
        cols === 2 && "sm:grid-cols-2",
        cols === 3 && "sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs font-medium text-stone-500">{k}</dt>
          <dd className="mt-0.5 text-sm break-words text-stone-900">{v === null || v === undefined || v === "" ? "—" : v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LinkButton({
  href,
  children,
  variant = "secondary",
  size,
  className,
  icon: Icon,
  target,
}: {
  href: string;
  children?: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm";
  className?: string;
  icon?: LucideIcon;
  target?: string;
}) {
  return (
    <Link
      href={href}
      target={target}
      rel={target === "_blank" ? "noopener noreferrer" : undefined}
      className={clsx("btn", `btn-${variant}`, size === "sm" && "btn-sm", className)}
    >
      {Icon && <Icon className={size === "sm" ? "size-3.5" : "size-4"} />}
      {children}
    </Link>
  );
}

/** Abas navegáveis por URL (?aba=). Renderizadas no servidor; rolagem horizontal no celular. */
export function TabLinks({ tabs, active, baseHref }: { tabs: { key: string; label: string; count?: number }[]; active: string; baseHref: string }) {
  return (
    <nav className="scrollbar-none -mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-stone-200 px-4 sm:mx-0 sm:px-0">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`${baseHref}?aba=${t.key}`}
          scroll={false}
          className={clsx(
            "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap",
            t.key === active ? "border-brand-600 text-brand-700" : "border-transparent text-stone-500 hover:text-stone-800",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-stone-100 px-1.5 text-xs text-stone-600">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function Pagination({ page, pageSize, total, searchParams, basePath }: {
  page: number; pageSize: number; total: number; searchParams: Record<string, string | undefined>; basePath: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="mt-3 text-xs text-stone-500">{total} registro(s)</p>;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (v && k !== "page") sp.set(k, v);
    sp.set("page", String(p));
    return `${basePath}?${sp}`;
  };
  return (
    <div className="mt-4 flex items-center justify-between gap-2 text-sm">
      <span className="text-stone-500">{total} registro(s) · página {page} de {pages}</span>
      <div className="flex gap-2">
        {page > 1 && <Link className="btn btn-secondary btn-sm" href={href(page - 1)}>Anterior</Link>}
        {page < pages && <Link className="btn btn-secondary btn-sm" href={href(page + 1)}>Próxima</Link>}
      </div>
    </div>
  );
}

/** Tabela responsiva: tabela no desktop; o chamador pode fornecer `mobile` para cartões no celular. */
export function ResponsiveTable({ head, children, mobile }: { head: React.ReactNode; children: React.ReactNode; mobile?: React.ReactNode }) {
  return (
    <>
      {mobile && <div className="space-y-2 md:hidden">{mobile}</div>}
      <div className={clsx("card overflow-x-auto", mobile && "hidden md:block")}>
        <table className="table">
          <thead>{head}</thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </>
  );
}

export function MobileCard({ href, title, subtitle, right, children }: { href: string; title: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Link href={href} className="card block p-3.5 active:bg-stone-50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold text-stone-900">{title}</div>
          {subtitle && <div className="truncate text-sm text-stone-500">{subtitle}</div>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {children && <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>}
    </Link>
  );
}
