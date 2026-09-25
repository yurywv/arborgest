import Link from "next/link";
import { FileCheck2, FileDown, FileSignature, FileText, Handshake, Paperclip, Send, Calculator } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { Badge, Card } from "@/components/ui";

export type HistoryEvent = {
  at: Date; kind: "proposta" | "envio" | "aceite" | "contrato" | "orcamento" | "documento";
  title: string; detail?: string; href?: string; external?: boolean; pdf?: string;
  status?: { label: string; tone?: Parameters<typeof Badge>[0]["tone"] };
};

const ICON = { proposta: FileText, envio: Send, aceite: FileCheck2, contrato: Handshake, orcamento: Calculator, documento: Paperclip } as const;
const KIND = { proposta: "Proposta", envio: "Envio", aceite: "Aceite", contrato: "Contrato", orcamento: "Orçamento", documento: "Documento" } as const;

/** Linha do tempo do cliente: propostas (emissão, envio, aceite), contratos, orçamentos e documentos. */
export function ClientHistory({ events }: { events: HistoryEvent[] }) {
  if (!events.length) return <Card title="Histórico"><p className="text-sm text-stone-500">Nenhum registro.</p></Card>;
  const years = [...new Set(events.map((e) => new Date(e.at).getFullYear()))];
  return (
    <Card title="Histórico do cliente">
      {years.map((y) => (
        <section key={y} className="mb-4 last:mb-0">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">{y}</h3>
          <ol className="relative space-y-3 border-l border-stone-200 pl-5" data-testid="client-history">
            {events.filter((e) => new Date(e.at).getFullYear() === y).map((e, i) => {
              const Icon = e.kind === "documento" && /assinad/i.test(e.title) ? FileSignature : ICON[e.kind];
              return (
                <li key={i} className="relative">
                  <span className="absolute -left-[31px] top-0.5 flex size-5 items-center justify-center rounded-full bg-white ring-1 ring-stone-200"><Icon className="size-3 text-emerald-700" /></span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs tabular-nums text-stone-500">{fmtDate(e.at)}</span>
                    <span className="text-[11px] font-medium uppercase text-stone-400">{KIND[e.kind]}</span>
                    {e.status && <Badge tone={e.status.tone}>{e.status.label}</Badge>}
                  </div>
                  <p className="text-sm">
                    {e.href ? (e.external
                      ? <a href={e.href} target="_blank" rel="noopener noreferrer" className="link">{e.title}</a>
                      : <Link href={e.href} className="link">{e.title}</Link>) : e.title}
                    {e.pdf && <a href={e.pdf} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-xs text-stone-600 hover:underline"><FileDown className="size-3" /> PDF</a>}
                  </p>
                  {e.detail && <p className="truncate text-xs text-stone-500">{e.detail}</p>}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </Card>
  );
}
