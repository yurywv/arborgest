import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { CONTRACT_STATUS, PERIODICITY, labelOf } from "@/lib/catalogs";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Badge, Card, DataList, LinkButton, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { DocumentList } from "@/components/files/panels";
import { DocumentUploader } from "@/components/files/uploaders";
import { deleteContract } from "../actions";

export const metadata = { title: "Contrato" };

export default async function ContractDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("contracts:read");
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(user.permissions, p);
  const { id } = await params;
  const c = await db.contract.findUnique({
    where: { id },
    include: { client: true, property: true, owner: true, pricingEstimate: { select: { id: true, number: true } }, documents: { orderBy: { createdAt: "desc" }, include: { uploadedBy: { select: { name: true } } } } },
  });
  if (!c) notFound();
  return (
    <>
      <PageHeader
        back={{ href: "/contratos", label: "Contratos" }}
        title={`Contrato ${c.number}`}
        subtitle={<Badge tone={c.status === "ATIVO" ? "green" : "gray"}>{CONTRACT_STATUS[c.status]}</Badge>}
        actions={
          <>
            {can("contracts:write") && <LinkButton href={`/contratos/${id}/editar`} icon={Pencil}>Editar</LinkButton>}
            {can("contracts:delete") && (
              <ActionButton action={deleteContract.bind(null, id)} confirm="Excluir este contrato?" variant="danger-ghost" redirectTo="/contratos"><Trash2 className="size-4" /> Excluir</ActionButton>
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Dados do contrato" className="lg:col-span-2">
          <DataList items={[
            ["Cliente", <Link key="c" className="link" href={`/clientes/${c.clientId}`}>{c.client.tradeName ?? c.client.legalName}</Link>],
            ["Propriedade", c.property && <Link key="p" className="link" href={`/propriedades/${c.property.id}`}>{c.property.name}</Link>],
            ["Início", fmtDate(c.startDate)],
            ["Término", fmtDate(c.endDate)],
            ["Valor", fmtMoney(c.value)],
            ["Periodicidade", labelOf(PERIODICITY, c.periodicity)],
            ["Responsável", c.owner?.name],
            ["Cadastro", fmtDate(c.createdAt)],
            ...(c.pricingEstimate ? [["Orçamento de origem", <Link key="e" className="link" href={`/precificacao/${c.pricingEstimate.id}`}>{c.pricingEstimate.number}</Link>] as [string, React.ReactNode]] : []),
          ]} />
          <div className="mt-4 space-y-3 text-sm">
            <div><p className="text-xs font-medium text-stone-500">Objeto</p><p className="whitespace-pre-line">{c.object}</p></div>
            {c.notes && <div><p className="text-xs font-medium text-stone-500">Observações</p><p className="whitespace-pre-line">{c.notes}</p></div>}
          </div>
        </Card>
        <Card title="Documentos anexos">
          {can("files:write") && <div className="mb-3"><DocumentUploader refs={{ contractId: id, clientId: c.clientId }} /></div>}
          <DocumentList docs={c.documents} canDelete={can("files:delete")} />
        </Card>
      </div>
    </>
  );
}
