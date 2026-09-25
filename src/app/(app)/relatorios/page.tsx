import Link from "next/link";
import { FileDown, FileSpreadsheet, FileText } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { REPORTS, buildReport } from "@/lib/reports";
import { treeFilterOptions } from "@/lib/tree-filters";
import { WORK_ORDER_STATUS, enumOptions } from "@/lib/catalogs";
import { spFlat, spGet, type SP } from "@/lib/query";
import { Card, PageHeader, clsx } from "@/components/ui";
import { TreeFilters } from "@/components/tree-filters";
import { FilterForm, FilterSelect } from "@/components/filters";

export const metadata = { title: "Relatórios" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("reports:view");
  const sp = await searchParams;
  const key = spGet(sp, "tipo") ?? "inventario";
  const meta = REPORTS.find((r) => r.key === key) ?? REPORTS[0];
  const [report, options] = await Promise.all([buildReport(meta.key, sp), treeFilterOptions()]);
  const params = new URLSearchParams(Object.entries(spFlat(sp)).filter(([k, v]) => v && k !== "tipo" && k !== "page") as [string, string][]);
  const exportHref = (format: string) => `/api/relatorios/${meta.key}?${new URLSearchParams([...params, ["format", format]])}`;
  const canExport = hasPermission(user.permissions, "reports:export");
  const preview = report?.rows.slice(0, 200) ?? [];

  return (
    <>
      <PageHeader title="Relatórios" subtitle="Selecione o relatório, aplique filtros e exporte." />
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <nav className="card h-fit p-2">
          <ul className="scrollbar-none flex gap-1 overflow-x-auto lg:block lg:space-y-0.5">
            {REPORTS.map((r) => (
              <li key={r.key} className="shrink-0">
                <Link href={`/relatorios?tipo=${r.key}`} className={clsx("block rounded-lg px-3 py-2 text-sm", r.key === meta.key ? "bg-brand-50 font-semibold text-brand-800" : "text-stone-700 hover:bg-stone-50")}>
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{report?.title ?? meta.label}</h2>
            <p className="text-sm text-stone-500">{meta.description} {report?.subtitle && `· ${report.subtitle}`}</p>
          </div>
          {meta.treeFilters && (
            <div className="[&>form]:mb-0">
              <TreeFilters sp={sp} options={options} action="/relatorios" hidden={{ tipo: meta.key }} />
            </div>
          )}
          {(meta.key === "historico" || meta.key === "ordens-servico" || meta.key === "intervencoes" || meta.key === "fotografico") && (
            <FilterForm action="/relatorios">
              <input type="hidden" name="tipo" value={meta.key} />
              {[...params].filter(([k]) => !["de", "ate", "arvore", "cliente", "status_os"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              {meta.key === "historico" && (
                <label className="flex-1"><span className="mb-0.5 block text-[11px] font-medium text-stone-500">Código da árvore</span>
                  <input name="arvore" defaultValue={spGet(sp, "arvore")} className="input min-h-10 font-mono" autoComplete="off" /></label>
              )}
              {meta.key === "ordens-servico" && <>
                <FilterSelect name="cliente" label="Cliente" options={options.clients} value={spGet(sp, "cliente")} />
                <FilterSelect name="status_os" label="Status" options={enumOptions(WORK_ORDER_STATUS)} value={spGet(sp, "status_os")} />
              </>}
              {meta.key !== "historico" && <>
                <label><span className="mb-0.5 block text-[11px] font-medium text-stone-500">De</span><input type="date" name="de" defaultValue={spGet(sp, "de")} className="input min-h-10 py-1.5" /></label>
                <label><span className="mb-0.5 block text-[11px] font-medium text-stone-500">Até</span><input type="date" name="ate" defaultValue={spGet(sp, "ate")} className="input min-h-10 py-1.5" /></label>
              </>}
              <button className="btn btn-secondary btn-sm min-h-10">Aplicar</button>
            </FilterForm>
          )}

          {canExport && report && report.columns.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <a className="btn btn-primary" href={exportHref("pdf")} target="_blank" rel="noopener noreferrer"><FileText className="size-4" /> PDF</a>
              <a className="btn btn-secondary" href={exportHref("xlsx")}><FileSpreadsheet className="size-4" /> Excel</a>
              <a className="btn btn-secondary" href={exportHref("csv")}><FileDown className="size-4" /> CSV</a>
            </div>
          )}

          <Card bodyClassName="p-0">
            {!report || report.columns.length === 0 ? (
              <p className="p-5 text-sm text-stone-500">{report?.subtitle ?? "Sem dados."}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table text-xs">
                  <thead><tr>{report.columns.map((c) => <th key={c.key} className={c.numeric ? "text-right" : ""}>{c.label}</th>)}</tr></thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i}>{report.columns.map((c) => (
                        <td key={c.key} className={clsx(c.numeric && "text-right tabular-nums", "max-w-72 truncate")}>
                          {c.key === "code" && row.code ? <Link className="link font-mono" href={`/arvores/${row.code}`}>{row.code}</Link>
                            : typeof row[c.key] === "number" ? (row[c.key] as number).toLocaleString("pt-BR") : row[c.key] ?? "—"}
                        </td>
                      ))}</tr>
                    ))}
                    {preview.length === 0 && <tr><td colSpan={report.columns.length} className="py-6 text-center text-stone-500">Nenhum registro com os filtros atuais.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          {report && report.rows.length > 200 && <p className="text-xs text-stone-500">Pré-visualização limitada a 200 linhas; a exportação inclui todos os {report.rows.length} registros.</p>}
        </div>
      </div>
    </>
  );
}
