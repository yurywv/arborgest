import Link from "next/link";
import { formatAddress } from "@/lib/address";
import { notFound } from "next/navigation";
import { CalendarCheck, CheckCircle2, Pencil, Play, Trash2, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { INTERVENTION_STATUS, INTERVENTION_TYPES, SERVICES, WORK_ORDER_STATUS, labelOf } from "@/lib/catalogs";
import { daysFromNow, fmtDate, fmtMoney, fmtNum } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { Badge, Card, ConditionBadge, DataList, FlowStatusBadge, LinkButton, PageHeader, PriorityBadge, RiskBadge } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { PrintButton } from "@/components/print-button";
import { DocumentList, PhotoGallery } from "@/components/files/panels";
import { DocumentUploader, PhotoUploader } from "@/components/files/uploaders";
import { deleteWorkOrder, setWorkOrderStatus } from "../actions";

export const metadata = { title: "Ordem de serviço" };

export default async function WorkOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("workorders:read");
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(user.permissions, p);
  const { id } = await params;
  const [w, settings] = await Promise.all([
    db.workOrder.findUnique({
      where: { id },
      include: {
        client: true, property: true, team: { include: { members: { select: { name: true } } } }, responsible: true,
        trees: { orderBy: { code: "asc" }, include: { species: true, sector: true } },
        interventions: { include: { tree: { select: { code: true } } }, orderBy: { createdAt: "asc" } },
        photos: { orderBy: { takenAt: "desc" }, include: { uploadedBy: { select: { name: true } } } },
        documents: { orderBy: { createdAt: "desc" }, include: { uploadedBy: { select: { name: true } } } },
      },
    }),
    getSettings(),
  ]);
  if (!w) notFound();
  const open = !["CONCLUIDA", "CANCELADA"].includes(w.status);
  const late = open && w.scheduledAt && (daysFromNow(w.scheduledAt) ?? 0) < 0;
  const canW = can("workorders:write");
  return (
    <>
      <div className="no-print">
        <PageHeader
          back={{ href: "/ordens-servico", label: "Ordens de serviço" }}
          title={w.number}
          subtitle={<span className="flex flex-wrap items-center gap-2"><FlowStatusBadge value={w.status} labels={WORK_ORDER_STATUS} /><PriorityBadge value={w.priority} />{late && <Badge tone="red">Atrasada</Badge>}</span>}
          actions={<>
            <PrintButton label="Imprimir OS" />
            {canW && <LinkButton href={`/ordens-servico/${id}/editar`} icon={Pencil}>Editar</LinkButton>}
            {can("workorders:delete") && <ActionButton action={deleteWorkOrder.bind(null, id)} confirm="Excluir esta OS? As intervenções vinculadas serão mantidas." variant="danger-ghost" redirectTo="/ordens-servico"><Trash2 className="size-4" /></ActionButton>}
          </>}
        />
        {canW && open && (
          <div className="mb-4 grid grid-cols-2 gap-2 sm:flex">
            {w.status === "ABERTA" && <ActionButton action={setWorkOrderStatus.bind(null, id, "PROGRAMADA")} className="min-h-12"><CalendarCheck className="size-4" /> Programar</ActionButton>}
            {w.status !== "EM_EXECUCAO" && <ActionButton action={setWorkOrderStatus.bind(null, id, "EM_EXECUCAO")} className="min-h-12"><Play className="size-4" /> Iniciar execução</ActionButton>}
            <ActionButton action={setWorkOrderStatus.bind(null, id, "CONCLUIDA")} variant="primary" confirm="Concluir a OS? Intervenções vinculadas em aberto também serão concluídas." className="min-h-12"><CheckCircle2 className="size-4" /> Concluir</ActionButton>
            <ActionButton action={setWorkOrderStatus.bind(null, id, "CANCELADA")} variant="danger-ghost" confirm="Cancelar esta OS?" className="min-h-12"><XCircle className="size-4" /> Cancelar</ActionButton>
          </div>
        )}
      </div>

      {/* Cabeçalho somente para impressão */}
      <div className="hidden print:block">
        <p className="text-sm text-stone-500">{settings.company_name} · {settings.company_phone}</p>
        <h1 className="text-2xl font-bold">Ordem de serviço {w.number}</h1>
        <p className="text-sm">Status: {WORK_ORDER_STATUS[w.status]} · Emitida em {fmtDate(new Date())}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Dados da OS" className="lg:col-span-2">
          <DataList cols={3} items={[
            ["Cliente", <Link key="c" className="link" href={`/clientes/${w.clientId}`}>{w.client.tradeName ?? w.client.legalName}</Link>],
            ["Propriedade", w.property && <Link key="p" className="link" href={`/propriedades/${w.property.id}`}>{w.property.name}</Link>],
            ["Serviço", labelOf(SERVICES, w.service)],
            ["Data prevista", fmtDate(w.scheduledAt)],
            ["Data executada", fmtDate(w.executedAt)],
            ["Custo", fmtMoney(w.cost)],
            ["Equipe", w.team ? `${w.team.name}${w.team.members.length ? ` (${w.team.members.map((m) => m.name).join(", ")})` : ""}` : null],
            ["Responsável", w.responsible?.name],
            ["Aberta em", fmtDate(w.createdAt)],
          ]} />
          {w.description && <p className="mt-4 text-sm whitespace-pre-line">{w.description}</p>}
          {w.notes && <p className="mt-2 text-sm whitespace-pre-line text-stone-600">{w.notes}</p>}
          {w.property?.address && <p className="mt-2 text-xs text-stone-500">Endereço: {formatAddress({ address: w.property.address, number: w.property.number, complement: w.property.complement, district: w.property.district, city: w.property.city, state: w.property.state })}</p>}
        </Card>
        <Card title={`Intervenções (${w.interventions.length})`}>
          {w.interventions.length === 0 ? <p className="text-sm text-stone-500">Nenhuma intervenção vinculada.</p> : (
            <ul className="divide-y divide-stone-100">
              {w.interventions.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <Link className="link" href={`/intervencoes/${i.id}`}>{i.tree.code} · {labelOf(INTERVENTION_TYPES, i.type)}</Link>
                  <FlowStatusBadge value={i.status} labels={INTERVENTION_STATUS} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={`Árvores (${w.trees.length})`} className="lg:col-span-3">
          {w.trees.length === 0 ? <p className="text-sm text-stone-500">OS sem árvores específicas.</p> : (
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <table className="table">
                <thead><tr><th>Código</th><th>Espécie</th><th>Setor</th><th>DAP</th><th>Altura</th><th>Condição</th><th>Risco</th><th className="hidden print:table-cell">Executado ☐</th></tr></thead>
                <tbody>
                  {w.trees.map((t) => (
                    <tr key={t.id}>
                      <td className="font-mono"><Link className="link" href={`/arvores/${t.code}`}>{t.code}</Link></td>
                      <td>{t.species?.popularName ?? "—"}</td>
                      <td>{t.sector?.name ?? "—"}</td>
                      <td>{fmtNum(t.currentDap, "cm")}</td>
                      <td>{fmtNum(t.currentHeight, "m")}</td>
                      <td><ConditionBadge value={t.currentCondition} /></td>
                      <td><RiskBadge value={t.currentRisk} /></td>
                      <td className="hidden print:table-cell">☐</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="hidden print:block lg:col-span-3">
          <div className="mt-10 grid grid-cols-2 gap-10 text-center text-sm">
            <div className="border-t border-stone-800 pt-1">Responsável técnico</div>
            <div className="border-t border-stone-800 pt-1">Cliente / recebedor</div>
          </div>
        </div>
        <Card title="Fotos" className="no-print lg:col-span-2">
          {can("files:write") && <div className="mb-4"><PhotoUploader refs={{ workOrderId: w.id }} defaultType="ANTES" types={["ANTES", "DEPOIS", "GERAL", "DEFEITO", "OUTRA"]} /></div>}
          <PhotoGallery photos={w.photos} canDelete={can("files:delete")} />
        </Card>
        <Card title="Anexos" className="no-print">
          {can("files:write") && <div className="mb-4"><DocumentUploader refs={{ workOrderId: w.id }} /></div>}
          <DocumentList docs={w.documents} canDelete={can("files:delete")} />
        </Card>
      </div>
    </>
  );
}
