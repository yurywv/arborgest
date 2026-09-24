import Link from "next/link";
import { FileCheck2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { diffParams } from "@/lib/pricing/params-schema";
import { getActiveVersion, paramsOf } from "@/lib/pricing/server";
import { getProposalTexts } from "@/lib/pricing/proposal-texts-server";
import { ENGINE_LABEL } from "@/lib/pricing/types";
import { ActionButton } from "@/components/form";
import { Badge, Card, LinkButton, PageHeader, TabLinks } from "@/components/ui";
import { ParamsEditor } from "./params-editor";
import { CompensationRuleForm, EditCompensationRule, ProposalTextsForm } from "./forms";
import { toggleCompensationRule, toggleService } from "./actions";
import { fmtBRL, fmtN } from "@/lib/pricing/decimal";

export const metadata = { title: "Parâmetros de precificação" };

export default async function PricingAdminPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  await requirePermission("pricing:params");
  const { aba = "parametros" } = await searchParams;
  const active = await getActiveVersion();
  return (
    <>
      <PageHeader
        title="Configurações › Precificação"
        subtitle={<>Versão vigente <b>v{active.label}</b> · {ENGINE_LABEL[active.engineVersion]} · desde {fmtDateTime(active.effectiveFrom)}</>}
        actions={<LinkButton href="/admin/precificacao/validacao" icon={FileCheck2}>Validação da lógica legada</LinkButton>}
      />
      <TabLinks active={aba} baseHref="/admin/precificacao" tabs={[
        { key: "parametros", label: "Parâmetros gerais" }, { key: "versoes", label: "Versões" },
        { key: "compensacao", label: "Compensação municipal" }, { key: "textos", label: "Textos da proposta" }, { key: "servicos", label: "Serviços" },
      ]} />
      {aba === "parametros" && (
        <ParamsEditor initial={paramsOf(active)} versionLabel={active.label}
          v2Validated={!!(await db.pricingParameterVersion.count({ where: { v2ValidatedAt: { not: null } } }))} />
      )}
      {aba === "versoes" && <Versions />}
      {aba === "textos" && <div className="max-w-3xl"><ProposalTextsForm values={await getProposalTexts()} /></div>}
      {aba === "servicos" && <Services />}
      {aba === "compensacao" && <CompensationRules />}
    </>
  );
}

async function Versions() {
  const versions = await db.pricingParameterVersion.findMany({
    orderBy: [{ createdAt: "desc" }], include: { createdBy: { select: { name: true } }, _count: { select: { estimates: true, calculations: true } } },
  });
  return (
    <div className="space-y-3">
      {versions.map((v, i) => {
        const prev = versions[i + 1];
        const changes = prev ? diffParams(paramsOf(prev), paramsOf(v)) : [];
        return (
          <Card key={v.id} title={<>v{v.label} {v.active && <Badge tone="green">Vigente</Badge>}</>}
            actions={<span className="text-xs text-stone-500">{fmtDateTime(v.createdAt)} · {v.createdBy?.name ?? "Sistema"}</span>}>
            <p className="text-sm">{v.description}</p>
            <p className="mt-1 text-xs text-stone-500">{ENGINE_LABEL[v.engineVersion]} · {v._count.estimates} orçamento(s) · {v._count.calculations} cálculo(s) salvos</p>
            {v.v2ValidatedNote && <p className="mt-1 text-xs text-emerald-800">Validação do motor v2: {v.v2ValidatedNote}</p>}
            {changes.length > 0 && (
              <details className="mt-2 text-xs"><summary className="cursor-pointer text-stone-600">{changes.length} alteração(ões) em relação à v{prev!.label}</summary>
                <ul className="mt-1 space-y-0.5 font-mono">{changes.map((c) => <li key={c.path}>{c.path}: <span className="text-red-700">{JSON.stringify(c.from)}</span> → <span className="text-emerald-700">{JSON.stringify(c.to)}</span></li>)}</ul>
              </details>
            )}
          </Card>
        );
      })}
    </div>
  );
}

async function Services() {
  const services = await db.pricingService.findMany({ orderBy: { order: "asc" } });
  return (
    <Card title="Serviços precificáveis" bodyClassName="p-0">
      <table className="table">
        <thead><tr><th>Código</th><th>Serviço</th><th>Unidade</th><th>Situação</th><th /></tr></thead>
        <tbody>
          {services.map((s) => (
            <tr key={s.id}>
              <td className="font-mono text-xs">{s.code}</td>
              <td>{s.name}<div className="text-xs text-stone-500">{s.description}</div></td>
              <td>{s.unit}</td>
              <td>{s.active ? <Badge tone="green">Ativo</Badge> : <Badge>Inativo</Badge>}</td>
              <td className="text-right"><ActionButton size="sm" action={toggleService.bind(null, s.code, !s.active)}>{s.active ? "Desativar" : "Ativar"}</ActionButton></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="p-4 text-xs text-stone-500">
        Novos serviços (plantio, transplante, laudos…) são adicionados como módulos do Pricing Engine — veja <Link className="link" href="/admin/precificacao/validacao#arquitetura">arquitetura</Link> e <code>src/lib/pricing/registry.ts</code>.
      </p>
    </Card>
  );
}

async function CompensationRules() {
  const rules = await db.compensationRule.findMany({ orderBy: [{ active: "desc" }, { state: "asc" }, { city: "asc" }] });
  const row = (r: (typeof rules)[number]) => ({
    id: r.id, city: r.city, state: r.state, lawReference: r.lawReference, seedlingsPerTree: r.seedlingsPerTree.toString(),
    freightValue: r.freightValue?.toString() ?? null, notes: r.notes,
  });
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Card title="Leis municipais de compensação ambiental" bodyClassName="p-0">
        {rules.length === 0 ? <p className="p-4 text-sm text-stone-500">Nenhuma lei cadastrada. Cadastre as leis dos municípios atendidos para sugerir a quantidade de mudas na supressão.</p> : (
          <ul className="divide-y divide-stone-100">
            {rules.map((r) => (
              <li key={r.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <b>{r.city}/{r.state}</b> {!r.active && <Badge>Inativa</Badge>}
                    <p className="text-sm">{r.lawReference}</p>
                    <p className="text-xs text-stone-500">{fmtN(r.seedlingsPerTree.toString())} muda(s) por árvore suprimida{r.freightValue ? ` · frete ${fmtBRL(r.freightValue.toString())}` : ""}{r.notes ? ` · ${r.notes}` : ""}</p>
                  </div>
                  <ActionButton size="sm" action={toggleCompensationRule.bind(null, r.id, !r.active)}>{r.active ? "Desativar" : "Ativar"}</ActionButton>
                </div>
                <EditCompensationRule rule={row(r)} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Nova lei municipal"><CompensationRuleForm /></Card>
    </div>
  );
}
