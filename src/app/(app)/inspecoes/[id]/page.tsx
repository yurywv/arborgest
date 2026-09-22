import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Trash2, Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { CONDITION, FINDINGS_BY_CATEGORY, INSPECTION_REASONS, LEVEL3, labelOf, type FindingCategoryKey } from "@/lib/catalogs";
import { fmtDate, fmtNum } from "@/lib/format";
import { Badge, Card, ConditionBadge, DataList, LinkButton, PageHeader, PriorityBadge } from "@/components/ui";
import { ActionButton, FormAlert } from "@/components/form";
import { PhotoGallery } from "@/components/files/panels";
import { PhotoUploader } from "@/components/files/uploaders";
import { deleteInspection } from "../actions";

export const metadata = { title: "Inspeção" };

export default async function InspectionDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nova?: string }> }) {
  const user = await requirePermission("inspections:read");
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(user.permissions, p);
  const { id } = await params;
  const { nova } = await searchParams;
  const i = await db.inspection.findUnique({
    where: { id },
    include: {
      findings: true,
      inspector: { select: { name: true } },
      tree: { include: { species: true, property: true } },
      photos: { orderBy: { takenAt: "desc" }, include: { uploadedBy: { select: { name: true } } } },
    },
  });
  if (!i) notFound();
  const conds: [FindingCategoryKey, string | null][] = [
    ["RAIZES", i.rootCondition], ["TRONCO", i.trunkCondition], ["COPA", i.crownCondition], ["FITOSSANIDADE", i.phytoCondition],
  ];
  return (
    <>
      <PageHeader
        back={{ href: `/arvores/${i.tree.code}?aba=inspecoes`, label: `Árvore ${i.tree.code}` }}
        title={`Inspeção de ${fmtDate(i.inspectedAt)}`}
        subtitle={<>{i.tree.code} · {i.tree.species?.popularName ?? "—"} · {i.tree.property.name}</>}
        actions={
          <>
            {can("interventions:write") && <LinkButton href={`/intervencoes/nova?arvore=${i.tree.code}`} icon={Wrench}>Intervenção</LinkButton>}
            {can("inspections:write") && <LinkButton href={`/inspecoes/${id}/editar`} icon={Pencil}>Corrigir</LinkButton>}
            {can("inspections:delete") && <ActionButton action={deleteInspection.bind(null, id)} confirm="Excluir esta inspeção do histórico?" variant="danger-ghost" redirectTo={`/arvores/${i.tree.code}?aba=inspecoes`}><Trash2 className="size-4" /></ActionButton>}
          </>
        }
      />
      {nova && <FormAlert ok message="Inspeção registrada. Adicione as fotos abaixo." />}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Resumo" className="lg:col-span-2">
          <DataList cols={3} items={[
            ["Condição geral", <ConditionBadge key="c" value={i.generalCondition} />],
            ["Prioridade", <PriorityBadge key="p" value={i.priority} />],
            ["Técnico", i.inspector?.name],
            ["Motivo", labelOf(INSPECTION_REASONS, i.reason)],
            ["Próxima inspeção", fmtDate(i.nextInspectionAt)],
            ["Registrada em", fmtDate(i.createdAt)],
          ]} />
          <div className="mt-4 space-y-3 text-sm">
            {i.problems && <div><p className="text-xs font-medium text-stone-500">Problemas identificados</p><p className="whitespace-pre-line">{i.problems}</p></div>}
            {i.recommendation && <div><p className="text-xs font-medium text-stone-500">Recomendação</p><p className="whitespace-pre-line">{i.recommendation}</p></div>}
            {i.notes && <div><p className="text-xs font-medium text-stone-500">Observações</p><p className="whitespace-pre-line">{i.notes}</p></div>}
          </div>
        </Card>
        <Card title="Condição por componente">
          <ul className="space-y-2">
            {conds.map(([cat, c]) => (
              <li key={cat} className="flex items-center justify-between text-sm">
                <span>{FINDINGS_BY_CATEGORY[cat].label}</span>
                {c ? <ConditionBadge value={c} /> : <span className="text-stone-400">—</span>}
              </li>
            ))}
          </ul>
          <DataList cols={1} items={[
            ["Inclinação do tronco", i.trunkLeanDegrees != null ? `${fmtNum(i.trunkLeanDegrees)}°` : null],
            ["Galhos secos", i.deadBranchesPercent != null ? `${fmtNum(i.deadBranchesPercent)}%` : null],
            ["Severidade fitossanitária", labelOf(LEVEL3, i.phytoSeverity)],
            ["Diagnóstico provável", i.probableDiagnosis],
            ["Diagnóstico confirmado", i.confirmedDiagnosis],
          ].filter(([, v]) => v && v !== "—") as [string, string][]} />
        </Card>
        <Card title="Achados" className="lg:col-span-3">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(FINDINGS_BY_CATEGORY) as FindingCategoryKey[]).map((cat) => {
              const fs = i.findings.filter((f) => f.category === cat);
              return (
                <div key={cat}>
                  <p className="mb-1.5 text-xs font-semibold text-stone-500 uppercase">{FINDINGS_BY_CATEGORY[cat].label}</p>
                  {fs.length ? (
                    <div className="flex flex-wrap gap-1">{fs.map((f) => <Badge key={f.id} tone="yellow">{labelOf(FINDINGS_BY_CATEGORY[cat].options, f.code)}</Badge>)}</div>
                  ) : <p className="text-sm text-stone-400">Nenhum</p>}
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="Fotos da inspeção" className="lg:col-span-3">
          {can("files:write") && <div className="mb-4"><PhotoUploader refs={{ inspectionId: i.id, treeId: i.treeId }} defaultType="DEFEITO" /></div>}
          <PhotoGallery photos={i.photos} canDelete={can("files:delete")} />
        </Card>
      </div>
      <p className="mt-4 text-xs text-stone-500">Condições: {Object.values(CONDITION).join(" · ")}. <Link className="link" href={`/arvores/${i.tree.code}?aba=historico`}>Ver histórico completo da árvore</Link></p>
    </>
  );
}
