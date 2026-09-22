import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus, Trash2, Navigation } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { CONTRACT_STATUS, PROPERTY_TYPES, labelOf } from "@/lib/catalogs";
import { fmtDate, fmtMoney, fmtNum } from "@/lib/format";
import { navLinks } from "@/lib/arbo";
import { loadMapPoints } from "@/lib/tree-points";
import { Badge, Card, ConditionBadge, DataList, LinkButton, PageHeader, RiskBadge, TabLinks, TreeStatusBadge } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { TreeMap } from "@/components/map";
import { DocumentList } from "@/components/files/panels";
import { DocumentUploader } from "@/components/files/uploaders";
import { SectorForm } from "../sector-form";
import { deleteProperty } from "../actions";

export const metadata = { title: "Propriedade" };

export default async function PropertyDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const user = await requirePermission("properties:read");
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(user.permissions, p);
  const { id } = await params;
  const tab = (await searchParams).aba ?? "resumo";
  const p = await db.property.findUnique({
    where: { id },
    include: {
      client: true,
      sectors: { orderBy: { name: "asc" }, include: { _count: { select: { trees: true } } } },
      contracts: { orderBy: { startDate: "desc" } },
      documents: { orderBy: { createdAt: "desc" }, include: { uploadedBy: { select: { name: true } } } },
      _count: { select: { trees: true } },
    },
  });
  if (!p) notFound();
  const [points, trees] = await Promise.all([
    tab === "resumo" ? loadMapPoints({ propertyId: id }) : Promise.resolve([]),
    tab === "arvores"
      ? db.tree.findMany({ where: { propertyId: id }, orderBy: { code: "asc" }, include: { species: true, sector: true } })
      : Promise.resolve([]),
  ]);
  const links = p.latitude != null && p.longitude != null ? navLinks(p.latitude, p.longitude, p.name) : null;

  const tabs = [
    { key: "resumo", label: "Resumo" },
    { key: "setores", label: "Setores", count: p.sectors.length },
    { key: "arvores", label: "Árvores", count: p._count.trees },
    { key: "contratos", label: "Contratos", count: p.contracts.length },
    { key: "documentos", label: "Documentos", count: p.documents.length },
  ];

  return (
    <>
      <PageHeader
        back={{ href: "/propriedades", label: "Propriedades" }}
        title={p.name}
        subtitle={<><Link className="link" href={`/clientes/${p.clientId}`}>{p.client.tradeName ?? p.client.legalName}</Link> · {labelOf(PROPERTY_TYPES, p.propertyType)}{!p.active && " · Inativa"}</>}
        actions={
          <>
            {can("trees:write") && <LinkButton href={`/arvores/novo?propertyId=${id}`} variant="primary" icon={Plus}>Nova árvore</LinkButton>}
            {can("properties:write") && <LinkButton href={`/propriedades/${id}/editar`} icon={Pencil}>Editar</LinkButton>}
            {can("properties:delete") && (
              <ActionButton action={deleteProperty.bind(null, id)} confirm="Excluir esta propriedade?" variant="danger-ghost" redirectTo="/propriedades"><Trash2 className="size-4" /></ActionButton>
            )}
          </>
        }
      />
      <TabLinks tabs={tabs} active={tab} baseHref={`/propriedades/${id}`} />

      {tab === "resumo" && (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card title="Dados" className="lg:col-span-2">
            <DataList cols={1} items={[
              ["Endereço", [p.address, p.number, p.complement].filter(Boolean).join(", ")],
              ["Bairro / cidade", [p.district, p.city && `${p.city}/${p.state ?? ""}`].filter(Boolean).join(" · ")],
              ["CEP", p.zipCode],
              ["Área total", fmtNum(p.totalArea, "m²")],
              ["Responsável local", p.localManager],
              ["Telefone", p.phone && <a key="t" className="link" href={`tel:${p.phone}`}>{p.phone}</a>],
              ["Coordenadas (WGS84)", p.latitude != null ? `${p.latitude.toFixed(6)}, ${p.longitude?.toFixed(6)}` : null],
              ["Árvores cadastradas", p._count.trees],
              ["Observações", p.notes],
            ]} />
            {links && (
              <div className="mt-4 flex flex-wrap gap-2">
                <a className="btn btn-secondary btn-sm" href={links.googleDirections} target="_blank" rel="noopener noreferrer"><Navigation className="size-3.5" /> Google Maps</a>
                <a className="btn btn-secondary btn-sm" href={links.apple} target="_blank" rel="noopener noreferrer">Apple Maps</a>
                <a className="btn btn-secondary btn-sm" href={links.waze} target="_blank" rel="noopener noreferrer">Waze</a>
              </div>
            )}
          </Card>
          <Card title={`Mapa (${points.length} árvores georreferenciadas)`} className="lg:col-span-3" bodyClassName="p-2">
            <div className="h-80 lg:h-[26rem]"><TreeMap points={points} /></div>
          </Card>
        </div>
      )}

      {tab === "setores" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Setores / áreas">
            {p.sectors.length === 0 ? <p className="text-sm text-stone-500">Nenhum setor cadastrado.</p> : (
              <ul className="divide-y divide-stone-100">
                {p.sectors.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="font-medium">{s.name}</p>
                      <p className="truncate text-xs text-stone-500">{s.description ?? "—"} · {fmtNum(s.approxArea, "m²")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/arvores?setor=${s.id}`}><Badge tone="green">{s._count.trees} árvores</Badge></Link>
                      {can("properties:write") && <LinkButton size="sm" variant="ghost" href={`/propriedades/${id}/setores/${s.id}`} icon={Pencil} />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {can("properties:write") && (
            <Card title="Adicionar setor">
              <SectorForm propertyId={id} fallback={p.latitude != null && p.longitude != null ? [p.latitude, p.longitude] : undefined} />
            </Card>
          )}
        </div>
      )}

      {tab === "arvores" && (
        <Card title="Exemplares" actions={<LinkButton size="sm" href={`/arvores?propriedade=${id}`}>Abrir na lista</LinkButton>}>
          {trees.length === 0 ? <p className="text-sm text-stone-500">Nenhuma árvore cadastrada.</p> : (
            <ul className="divide-y divide-stone-100">
              {trees.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/arvores/${t.code}`} className="link">{t.code}</Link>
                    <span className="ml-2 text-sm">{t.species?.popularName ?? "Não identificada"}</span>
                    <p className="text-xs text-stone-500">{t.sector?.name ?? "Sem setor"} · DAP {fmtNum(t.currentDap, "cm")} · {fmtNum(t.currentHeight, "m")}</p>
                  </div>
                  <div className="flex gap-1.5"><TreeStatusBadge value={t.status} /><ConditionBadge value={t.currentCondition} /><RiskBadge value={t.currentRisk} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "contratos" && (
        <Card title="Contratos">
          {p.contracts.length === 0 ? <p className="text-sm text-stone-500">Nenhum contrato vinculado.</p> : (
            <ul className="divide-y divide-stone-100">
              {p.contracts.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div><Link href={`/contratos/${k.id}`} className="link">{k.number}</Link><p className="text-xs text-stone-500">{fmtDate(k.startDate)} a {fmtDate(k.endDate)} · {fmtMoney(k.value)}</p></div>
                  <Badge tone={k.status === "ATIVO" ? "green" : "gray"}>{CONTRACT_STATUS[k.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "documentos" && (
        <Card title="Documentos">
          {can("files:write") && <div className="mb-4"><DocumentUploader refs={{ propertyId: id }} /></div>}
          <DocumentList docs={p.documents} canDelete={can("files:delete")} />
        </Card>
      )}
    </>
  );
}
