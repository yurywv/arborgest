import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { fmtDateTime } from "@/lib/format";
import { calculate, SERVICES } from "@/lib/pricing/registry";
import { snapshotHash } from "@/lib/pricing/server";
import { ENGINE_LABEL, type CalcResult, type PricingParams, type ServiceCode } from "@/lib/pricing/types";
import { fmtBRL } from "@/lib/pricing/decimal";
import { Card, DataList, PageHeader } from "@/components/ui";
import { CalcMemory } from "@/components/pricing/simulator";

export const metadata = { title: "Memória de cálculo" };

type Snapshot = {
  engine: { build: string; version: keyof typeof ENGINE_LABEL };
  parameterVersion: { id: string; label: string };
  service: ServiceCode; inputs: Record<string, unknown>; treeIds: string[]; params: PricingParams; result: CalcResult;
  user: { id: string; name: string }; createdAt: string;
};

export default async function CalculationPage({ params }: { params: Promise<{ calcId: string }> }) {
  const user = await requirePermission("pricing:read");
  const costs = hasPermission(user.permissions, "pricing:costs");
  const { calcId } = await params;
  const c = await db.pricingCalculation.findUnique({ where: { id: calcId }, include: { estimate: { select: { id: true, number: true } } } });
  if (!c) notFound();
  const s = c.snapshot as unknown as Snapshot;

  // Reconstrução: recalcula com os parâmetros e as entradas gravados no snapshot (independe da versão vigente).
  let rebuilt: CalcResult | null = null;
  let rebuildError: string | null = null;
  try { rebuilt = calculate(s.service, s.inputs, s.params).result; } catch (e) { rebuildError = (e as Error).message; }
  const same = rebuilt?.finalPrice === s.result.finalPrice && rebuilt.operationalCost === s.result.operationalCost;
  const integrity = snapshotHash(c.snapshot) === c.snapshotHash;
  const trees = s.treeIds?.length ? await db.tree.findMany({ where: { id: { in: s.treeIds } }, select: { id: true, code: true }, orderBy: { code: "asc" } }) : [];

  return (
    <>
      <PageHeader
        back={c.estimate ? { href: `/precificacao/${c.estimate.id}?aba=historico`, label: `Orçamento ${c.estimate.number}` } : { href: "/precificacao", label: "Precificação" }}
        title={`Cálculo — ${SERVICES[s.service]?.name ?? s.service}`}
        subtitle={`${fmtDateTime(s.createdAt)} · ${s.user.name} · parâmetros v${s.parameterVersion.label}`}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Card title="Resultado gravado">
            <DataList cols={3} items={[
              ["Preço final", <b key="p">{fmtBRL(s.result.finalPriceRounded)}</b>],
              [`Preço por ${SERVICES[s.service]?.unit ?? "unidade"}`, fmtBRL(s.result.unitPriceRounded)],
              ["Dias / equipe", `${s.result.days} dia(s) · ${s.result.technicians} téc. + ${s.result.auxiliaries} aux.`],
              ...(costs ? [["Custo operacional", fmtBRL(s.result.operationalCost)] as [string, React.ReactNode]] : []),
              ["Motor", ENGINE_LABEL[s.engine.version]],
              ["Build", s.engine.build],
            ]} />
          </Card>
          <Card title="Entradas">
            <DataList cols={3} items={Object.entries(s.inputs).map(([k, v]) => [
              SERVICES[s.service]?.fields.find((f) => f.key === k)?.label ?? k,
              Array.isArray(v) ? (v.length ? v.join(", ") : "—") : typeof v === "boolean" ? (v ? "Sim" : "Não") : String(v),
            ])} />
            {trees.length > 0 && <p className="mt-3 text-sm">Árvores: {trees.map((t) => <Link key={t.id} className="link mr-1.5" href={`/arvores/${t.code}`}>{t.code}</Link>)}</p>}
          </Card>
          {costs && (
            <details className="card card-body">
              <summary className="cursor-pointer text-sm font-semibold">Snapshot completo (JSON imutável)</summary>
              <pre className="mt-3 max-h-[32rem] overflow-auto rounded-xl bg-stone-900 p-3 text-xs text-stone-100">{JSON.stringify(c.snapshot, null, 2)}</pre>
            </details>
          )}
        </div>
        <aside className="space-y-4">
          <Card title="Verificação">
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2">{integrity ? <CheckCircle2 className="size-5 text-emerald-600" /> : <XCircle className="size-5 text-red-600" />}
                <span>Integridade do snapshot (SHA-256) {integrity ? "confirmada" : "divergente"}<span className="block font-mono text-[10px] break-all text-stone-500">{c.snapshotHash}</span></span></li>
              <li className="flex gap-2">{same ? <CheckCircle2 className="size-5 text-emerald-600" /> : <XCircle className="size-5 text-red-600" />}
                <span>{same ? "Reconstrução a partir do snapshot reproduz exatamente o resultado gravado." : `Reconstrução divergente${rebuildError ? `: ${rebuildError}` : rebuilt ? ` (${fmtBRL(rebuilt.finalPrice)})` : ""}.`}</span></li>
            </ul>
          </Card>
          <CalcMemory result={s.result} canSeeCosts={costs} />
        </aside>
      </div>
    </>
  );
}
