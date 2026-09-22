import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, CheckCircle2, Pencil, Play, Trash2, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { INTERVENTION_STATUS, INTERVENTION_TYPES, labelOf } from "@/lib/catalogs";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Card, DataList, FlowStatusBadge, LinkButton, PageHeader, PriorityBadge } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { PhotoGallery } from "@/components/files/panels";
import { PhotoUploader } from "@/components/files/uploaders";
import { deleteIntervention, setInterventionStatus } from "../actions";

export const metadata = { title: "Intervenção" };

export default async function InterventionDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("interventions:read");
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(user.permissions, p);
  const { id } = await params;
  const i = await db.intervention.findUnique({
    where: { id },
    include: {
      tree: { include: { species: true, property: true } }, responsible: true, team: true, workOrder: true,
      photos: { orderBy: { takenAt: "asc" }, include: { uploadedBy: { select: { name: true } } } },
    },
  });
  if (!i) notFound();
  const before = i.photos.filter((p) => p.type === "ANTES");
  const after = i.photos.filter((p) => p.type === "DEPOIS");
  const other = i.photos.filter((p) => p.type !== "ANTES" && p.type !== "DEPOIS");
  const w = can("interventions:write");
  const done = i.status === "CONCLUIDA" || i.status === "CANCELADA";
  return (
    <>
      <PageHeader
        back={{ href: `/arvores/${i.tree.code}?aba=intervencoes`, label: `Árvore ${i.tree.code}` }}
        title={labelOf(INTERVENTION_TYPES, i.type)}
        subtitle={<span className="flex flex-wrap items-center gap-2">{i.tree.code} · {i.tree.species?.popularName ?? "—"} · {i.tree.property.name} <FlowStatusBadge value={i.status} labels={INTERVENTION_STATUS} /> <PriorityBadge value={i.priority} /></span>}
        actions={<>
          {w && <LinkButton href={`/intervencoes/${id}/editar`} icon={Pencil}>Editar</LinkButton>}
          {can("interventions:delete") && <ActionButton action={deleteIntervention.bind(null, id)} confirm="Excluir esta intervenção?" variant="danger-ghost" redirectTo="/intervencoes"><Trash2 className="size-4" /></ActionButton>}
        </>}
      />
      {w && !done && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:flex">
          {i.status === "RECOMENDADA" && <ActionButton action={setInterventionStatus.bind(null, id, "PROGRAMADA")} className="min-h-12"><CalendarCheck className="size-4" /> Programar</ActionButton>}
          {i.status !== "EM_EXECUCAO" && <ActionButton action={setInterventionStatus.bind(null, id, "EM_EXECUCAO")} className="min-h-12"><Play className="size-4" /> Iniciar</ActionButton>}
          <ActionButton action={setInterventionStatus.bind(null, id, "CONCLUIDA")} variant="primary" confirm="Marcar como concluída hoje?" className="min-h-12"><CheckCircle2 className="size-4" /> Concluir</ActionButton>
          <ActionButton action={setInterventionStatus.bind(null, id, "CANCELADA")} variant="danger-ghost" confirm="Cancelar esta intervenção?" className="min-h-12"><XCircle className="size-4" /> Cancelar</ActionButton>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Dados" className="lg:col-span-2">
          <DataList cols={3} items={[
            ["Data recomendada", fmtDate(i.recommendedAt)],
            ["Data programada", fmtDate(i.scheduledAt)],
            ["Data executada", fmtDate(i.executedAt)],
            ["Responsável", i.responsible?.name],
            ["Equipe", i.team?.name],
            ["Ordem de serviço", i.workOrder && <Link key="w" className="link" href={`/ordens-servico/${i.workOrder.id}`}>{i.workOrder.number}</Link>],
            ["Custo previsto", fmtMoney(i.estimatedCost)],
            ["Custo real", fmtMoney(i.actualCost)],
          ]} />
          {i.description && <p className="mt-4 text-sm whitespace-pre-line">{i.description}</p>}
          {i.notes && <p className="mt-2 text-sm whitespace-pre-line text-stone-600">{i.notes}</p>}
        </Card>
        <Card title="Registrar fotos">
          {can("files:write") ? <PhotoUploader refs={{ interventionId: i.id, treeId: i.treeId }} defaultType={i.status === "CONCLUIDA" ? "DEPOIS" : "ANTES"} types={["ANTES", "DEPOIS", "DEFEITO", "GERAL", "OUTRA"]} /> : <p className="text-sm text-stone-500">Sem permissão para enviar.</p>}
        </Card>
        <Card title={`Antes (${before.length})`} className="lg:col-span-3 xl:col-span-1"><PhotoGallery photos={before} canDelete={can("files:delete")} /></Card>
        <Card title={`Depois (${after.length})`} className="lg:col-span-3 xl:col-span-1"><PhotoGallery photos={after} canDelete={can("files:delete")} /></Card>
        {other.length > 0 && <Card title="Outras fotos" className="lg:col-span-3 xl:col-span-1"><PhotoGallery photos={other} canDelete={can("files:delete")} /></Card>}
      </div>
    </>
  );
}
