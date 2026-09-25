import Link from "next/link";
import { formatAddress } from "@/lib/address";
import { notFound } from "next/navigation";
import {
  ClipboardCheck, Wrench, ClipboardList, Crosshair, Camera, Map as MapIcon, QrCode, Pencil, ShieldAlert, Ruler, Trash2, Navigation, ImageOff,
} from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { findTreeId } from "@/lib/trees";
import { fileUrl } from "@/lib/files";
import { navLinks } from "@/lib/arbo";
import {
  CONFLICTS, CONSEQUENCE, COORD_SOURCES, DRAINAGE, FAILURE_LIKELIHOOD, ID_CONFIDENCE, IMPACT_LIKELIHOOD, INSPECTION_REASONS,
  INTERVENTION_STATUS, INTERVENTION_TYPES, LEVEL3, PHOTO_TYPES, PAVEMENT_TYPES, RISK_LEVEL, RISK_TARGETS, SITE_TYPES, SPECIES_ORIGIN, SUN_EXPOSURE,
  TARGET_OCCUPANCY, TREE_PARTS, TREE_STATUS, WORK_ORDER_STATUS, labelOf,
} from "@/lib/catalogs";
import { daysFromNow, fmtDate, fmtDateTime, fmtMoney, fmtNum } from "@/lib/format";
import {
  Badge, Card, ConditionBadge, DataList, FlowStatusBadge, LinkButton, PriorityBadge, RiskBadge, TabLinks, TreeStatusBadge, clsx,
} from "@/components/ui";
import { ActionButton } from "@/components/form";
import { TreeMap } from "@/components/map";
import { PhotoGallery, DocumentList } from "@/components/files/panels";
import { DocumentUploader, PhotoUploader } from "@/components/files/uploaders";
import { deleteMeasurement, deleteTree } from "../actions";
import { TreeStatusSelect } from "./status-select";
import { FindingsTab } from "./findings-tab";

export const metadata = { title: "Ficha do exemplar" };

const TABS = [
  ["geral", "Geral"], ["localizacao", "Localização"], ["botanica", "Botânica"], ["biometria", "Biometria"], ["raizes", "Raízes"],
  ["tronco", "Tronco"], ["copa", "Copa"], ["fitossanidade", "Fitossanidade"], ["riscos", "Riscos"], ["inspecoes", "Inspeções"],
  ["intervencoes", "Intervenções"], ["fotos", "Fotos"], ["documentos", "Documentos"], ["historico", "Histórico"],
] as const;

export default async function TreePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const user = await requirePermission("trees:read");
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(user.permissions, p);
  const ref = await findTreeId((await params).id);
  if (!ref) notFound();
  const tab = (await searchParams).aba ?? "geral";

  const t = await db.tree.findUniqueOrThrow({
    where: { id: ref.id },
    include: {
      property: { include: { client: { select: { id: true, legalName: true, tradeName: true } } } },
      sector: true,
      species: true,
      responsible: { select: { name: true } },
      measurements: { orderBy: { measuredAt: "desc" }, include: { measuredBy: { select: { name: true } } } },
      inspections: { orderBy: { inspectedAt: "desc" }, include: { findings: true, inspector: { select: { name: true } } } },
      riskAssessments: { orderBy: { assessedAt: "desc" }, include: { assessor: { select: { name: true } } } },
      interventions: { orderBy: [{ createdAt: "desc" }], include: { responsible: { select: { name: true } }, team: { select: { name: true } }, workOrder: { select: { id: true, number: true } } } },
      workOrders: { orderBy: { createdAt: "desc" } },
      photos: { orderBy: { takenAt: "desc" }, include: { uploadedBy: { select: { name: true } } } },
      documents: { orderBy: { createdAt: "desc" }, include: { uploadedBy: { select: { name: true } } } },
      _count: { select: { photos: true } },
    },
  });
  const cover = t.photos.find((p) => p.id === t.coverPhotoId) ?? t.photos[0];
  const m = t.measurements[0];
  const lastRisk = t.riskAssessments[0];
  const hasGeo = t.latitude != null && t.longitude != null;
  const links = hasGeo ? navLinks(t.latitude!, t.longitude!, t.code) : null;
  const point = hasGeo
    ? [{ id: t.id, code: t.code, lat: t.latitude!, lng: t.longitude!, status: t.status, condition: t.currentCondition, risk: t.currentRisk, species: t.species?.popularName, dap: t.currentDap, height: t.currentHeight }]
    : [];
  const nextDays = daysFromNow(t.nextInspectionAt);
  const pendingInterventions = t.interventions.filter((i) => ["RECOMENDADA", "PROGRAMADA", "EM_EXECUCAO"].includes(i.status));

  const quick = [
    can("inspections:write") && { href: `/inspecoes/nova?arvore=${t.code}`, label: "Nova inspeção", icon: ClipboardCheck, primary: true },
    can("interventions:write") && { href: `/intervencoes/nova?arvore=${t.code}`, label: "Registrar intervenção", icon: Wrench },
    can("workorders:write") && { href: `/ordens-servico/nova?arvore=${t.code}`, label: "Criar OS", icon: ClipboardList },
    can("risk:write") && { href: `/riscos/nova?arvore=${t.code}`, label: "Avaliar risco", icon: ShieldAlert },
    can("trees:write") && { href: `/arvores/${t.code}/localizacao`, label: "Capturar localização", icon: Crosshair },
    can("files:write") && { href: `/arvores/${t.code}?aba=fotos#fotos`, label: "Adicionar foto", icon: Camera },
    can("trees:write") && { href: `/arvores/${t.code}/medicao`, label: "Nova medição", icon: Ruler },
    { href: hasGeo ? `/mapa?focus=${t.code}&propriedade=${t.propertyId}` : `/mapa?propriedade=${t.propertyId}`, label: "Abrir mapa", icon: MapIcon },
    { href: `/arvores/${t.code}/qrcode`, label: "Imprimir QR Code", icon: QrCode },
  ].filter(Boolean) as { href: string; label: string; icon: typeof Wrench; primary?: boolean }[];

  const tabs = TABS.map(([key, label]) => ({
    key,
    label,
    count:
      key === "inspecoes" ? t.inspections.length
      : key === "intervencoes" ? t.interventions.length
      : key === "riscos" ? t.riskAssessments.length
      : key === "fotos" ? t._count.photos
      : key === "documentos" ? t.documents.length
      : key === "biometria" ? t.measurements.length
      : undefined,
  }));

  return (
    <>
      <Link href="/arvores" className="mb-2 inline-block text-sm text-stone-500 hover:text-stone-800">← Exemplares</Link>

      {/* Cabeçalho */}
      <section className="card mb-4 overflow-hidden">
        <div className="grid gap-0 md:grid-cols-[16rem_1fr_18rem]">
          <div className="relative h-44 bg-stone-100 sm:h-56 md:h-full md:min-h-52">
            {cover ? (
              <a href={fileUrl(cover.storageKey)} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl(cover.storageKey)} alt={`Foto de ${t.code}`} className="absolute inset-0 size-full object-cover" />
              </a>
            ) : (
              <div className="absolute inset-0 grid place-items-center text-stone-400"><ImageOff className="size-10" /></div>
            )}
          </div>
          <div className="space-y-2 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-2xl font-bold tracking-tight">{t.code}</h1>
              {can("trees:write") ? <TreeStatusSelect id={t.id} status={t.status} /> : <TreeStatusBadge value={t.status} />}
            </div>
            <div>
              <p className="text-lg font-semibold text-stone-900">{t.species?.popularName ?? "Espécie não identificada"}</p>
              {t.species && <p className="text-sm text-stone-500 italic">{t.species.scientificName}{t.cultivar ? ` '${t.cultivar}'` : ""} · {t.species.family}</p>}
            </div>
            <p className="text-sm text-stone-600">
              <Link className="link" href={`/propriedades/${t.propertyId}`}>{t.property.name}</Link>
              {t.sector && <> › {t.sector.name}</>}
              <span className="text-stone-400"> · </span>
              <Link className="link" href={`/clientes/${t.property.client.id}`}>{t.property.client.tradeName ?? t.property.client.legalName}</Link>
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <ConditionBadge value={t.currentCondition} />
              <RiskBadge value={t.currentRisk} />
              {pendingInterventions.length > 0 && <Badge tone="orange">{pendingInterventions.length} intervenção(ões) pendente(s)</Badge>}
              {t.species?.invasive && <Badge tone="red">Espécie invasora</Badge>}
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {can("trees:write") && <LinkButton size="sm" href={`/arvores/${t.code}/editar`} icon={Pencil}>Editar</LinkButton>}
              {can("trees:delete") && (
                <ActionButton size="sm" variant="danger-ghost" action={deleteTree.bind(null, t.id)} redirectTo="/arvores"
                  confirm="Excluir definitivamente? Só é permitido para cadastros sem histórico. O código não será reutilizado.">
                  <Trash2 className="size-3.5" /> Excluir
                </ActionButton>
              )}
            </div>
          </div>
          <div className="h-48 border-t border-stone-100 p-2 md:h-auto md:border-t-0 md:border-l">
            {hasGeo ? <TreeMap points={point} compact /> : (
              <div className="grid h-full place-items-center rounded-xl bg-stone-50 p-4 text-center text-sm text-stone-500">
                Sem coordenadas. {can("trees:write") && <Link className="link" href={`/arvores/${t.code}/localizacao`}>Capturar agora</Link>}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Indicadores */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <Metric label="DAP" value={fmtNum(t.currentDap, "cm")} />
        <Metric label="Altura" value={fmtNum(t.currentHeight, "m")} />
        <Metric label="Copa (diâm. médio)" value={fmtNum(t.currentCrownDiam, "m")} hint={m?.crownArea ? `${fmtNum(m.crownArea)} m²` : undefined} />
        <Metric label="Condição" value={<ConditionBadge value={t.currentCondition} />} />
        <Metric label="Risco" value={<RiskBadge value={t.currentRisk} />} />
        <Metric label="Última inspeção" value={fmtDate(t.lastInspectionAt)} />
        <Metric label="Próxima inspeção" value={fmtDate(t.nextInspectionAt)} tone={nextDays !== null && nextDays < 0 ? "red" : nextDays !== null && nextDays <= 30 ? "amber" : undefined}
          hint={nextDays !== null ? (nextDays < 0 ? `vencida há ${-nextDays} dia(s)` : `em ${nextDays} dia(s)`) : undefined} />
      </div>

      {/* Ações rápidas — rolagem horizontal no celular */}
      <nav className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 no-print" aria-label="Ações rápidas">
        {quick.map((a) => (
          <Link key={a.label} href={a.href}
            className={clsx("btn shrink-0 flex-col gap-1 px-3 py-2 text-xs sm:flex-row sm:text-sm", a.primary ? "btn-primary" : "btn-secondary", "min-h-16 min-w-24 sm:min-h-11 sm:min-w-0")}>
            <a.icon className="size-5 sm:size-4" /> {a.label}
          </Link>
        ))}
      </nav>

      <TabLinks tabs={tabs} active={tab} baseHref={`/arvores/${t.code}`} />

      {tab === "geral" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Identificação">
            <DataList items={[
              ["ID interno", <span key="id" className="font-mono text-xs">{t.id}</span>],
              ["Código", <span key="c" className="font-mono">{t.code}</span>],
              ["Cliente", t.property.client.tradeName ?? t.property.client.legalName],
              ["Propriedade", t.property.name],
              ["Setor", t.sector?.name],
              ["Status", TREE_STATUS[t.status]],
              ["Data de cadastro", fmtDateTime(t.createdAt)],
              ["Técnico responsável", t.responsible?.name],
              ["QR Code", <Link key="q" className="link" href={`/arvores/${t.code}/qrcode`}>Ver / imprimir</Link>],
            ]} />
            {t.notes && <p className="mt-4 text-sm whitespace-pre-line text-stone-700">{t.notes}</p>}
          </Card>
          <Card title="Local de implantação">
            <DataList items={[
              ["Tipo de local", labelOf(SITE_TYPES, t.siteType)],
              ["Pavimento", labelOf(PAVEMENT_TYPES, t.pavementType)],
              ["Área permeável", fmtNum(t.permeableArea, "m²")],
              ["Largura da calçada", fmtNum(t.sidewalkWidth, "m")],
              ["Canteiro (L × C)", t.bedWidth || t.bedLength ? `${fmtNum(t.bedWidth)} × ${fmtNum(t.bedLength)} m` : null],
              ["Volume de solo", fmtNum(t.soilVolume, "m³")],
              ["Compactação do solo", labelOf(LEVEL3, t.soilCompaction)],
              ["Drenagem", labelOf(DRAINAGE, t.drainage)],
              ["Exposição solar", labelOf(SUN_EXPOSURE, t.sunExposure)],
            ]} />
          </Card>
          <Card title="Infraestrutura e conflitos" className="lg:col-span-2">
            {t.conflicts.length ? (
              <div className="flex flex-wrap gap-1.5">{t.conflicts.map((c) => <Badge key={c} tone="orange">{labelOf(CONFLICTS, c)}</Badge>)}</div>
            ) : <p className="text-sm text-stone-500">Nenhum conflito registrado.</p>}
            {t.conflictNotes && <p className="mt-3 text-sm whitespace-pre-line">{t.conflictNotes}</p>}
          </Card>
        </div>
      )}

      {tab === "localizacao" && (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card title="Coordenadas" className="lg:col-span-2" actions={can("trees:write") && <LinkButton size="sm" href={`/arvores/${t.code}/localizacao`} icon={Crosshair}>Capturar</LinkButton>}>
            <DataList cols={1} items={[
              ["Latitude", t.latitude?.toFixed(7)],
              ["Longitude", t.longitude?.toFixed(7)],
              ["Precisão do GPS", fmtNum(t.gpsAccuracy, "m")],
              ["Altitude", fmtNum(t.altitude, "m")],
              ["Data/hora da captura", fmtDateTime(t.gpsCapturedAt)],
              ["Origem da coordenada", labelOf(COORD_SOURCES, t.coordSource)],
              ["Sistema geodésico", t.geodeticDatum],
              ["Endereço", formatAddress({ address: t.address, number: t.addressNumber }, { withCity: false })],
              ["Referência física", t.physicalRef],
            ]} />
            {links && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                <a className="btn btn-secondary btn-sm" href={links.googleDirections} target="_blank" rel="noopener noreferrer"><Navigation className="size-3.5" /> Google</a>
                <a className="btn btn-secondary btn-sm" href={links.apple} target="_blank" rel="noopener noreferrer">Apple</a>
                <a className="btn btn-secondary btn-sm" href={links.waze} target="_blank" rel="noopener noreferrer">Waze</a>
              </div>
            )}
          </Card>
          <Card title="Mapa" className="lg:col-span-3" bodyClassName="p-2">
            <div className="h-80 lg:h-[26rem]">{hasGeo ? <TreeMap points={point} /> : <p className="p-4 text-sm text-stone-500">Sem coordenadas cadastradas.</p>}</div>
          </Card>
        </div>
      )}

      {tab === "botanica" && (
        <Card title="Identificação botânica">
          <DataList cols={3} items={[
            ["Nome científico", t.species && <em key="s">{t.species.scientificName}</em>],
            ["Nome popular", t.species?.popularName],
            ["Família botânica", t.species?.family],
            ["Gênero", t.species?.genus && <em key="g">{t.species.genus}</em>],
            ["Espécie (epíteto)", t.species?.epithet && <em key="e">{t.species.epithet}</em>],
            ["Cultivar", t.cultivar],
            ["Origem", labelOf(SPECIES_ORIGIN, t.species?.origin)],
            ["Distribuição de origem", t.species?.nativeRange],
            ["Espécie nativa", t.species ? (t.species.origin === "NATIVA" ? "Sim" : "Não") : null],
            ["Espécie exótica", t.species ? (t.species.origin === "EXOTICA" ? "Sim" : "Não") : null],
            ["Espécie invasora", t.species ? (t.species.invasive ? <Badge key="i" tone="red">Sim</Badge> : "Não") : null],
            ["Confiança da identificação", labelOf(ID_CONFIDENCE, t.identificationConfidence)],
          ]} />
          {t.botanicalNotes && <p className="mt-4 text-sm whitespace-pre-line">{t.botanicalNotes}</p>}
          {t.species && <p className="mt-4 text-sm"><Link className="link" href={`/arvores?especie=${t.speciesId}`}>Ver todos os exemplares desta espécie</Link></p>}
        </Card>
      )}

      {tab === "biometria" && (
        <Card title="Histórico de medições" actions={can("trees:write") && <LinkButton size="sm" variant="primary" href={`/arvores/${t.code}/medicao`} icon={Ruler}>Nova medição</LinkButton>}>
          {t.measurements.length === 0 ? <p className="text-sm text-stone-500">Nenhuma medição registrada.</p> : (
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <table className="table">
                <thead><tr><th>Data</th><th>CAP</th><th>DAP</th><th>Alt. medição</th><th>Fustes</th><th>Altura total</th><th>Alt. fuste</th><th>Início copa</th><th>Copa N-S</th><th>Copa L-O</th><th>Área copa</th><th>Por</th><th /></tr></thead>
                <tbody>
                  {t.measurements.map((x) => (
                    <tr key={x.id}>
                      <td className="whitespace-nowrap">{fmtDate(x.measuredAt)}</td>
                      <td>{fmtNum(x.cap, "cm")}</td>
                      <td className="font-semibold">{fmtNum(x.dap, "cm")}</td>
                      <td>{fmtNum(x.measurementHeight, "m")}</td>
                      <td>{x.stemCount ?? "—"}{x.stemDaps.length > 1 && <div className="text-xs text-stone-500">{x.stemDaps.join("; ")} cm</div>}</td>
                      <td>{fmtNum(x.totalHeight, "m")}</td>
                      <td>{fmtNum(x.stemHeight, "m")}</td>
                      <td>{fmtNum(x.crownBaseHeight, "m")}</td>
                      <td>{fmtNum(x.crownDiameterNS, "m")}</td>
                      <td>{fmtNum(x.crownDiameterEW, "m")}</td>
                      <td>{fmtNum(x.crownArea, "m²")}</td>
                      <td className="text-xs">{x.measuredBy?.name ?? "—"}</td>
                      <td>{can("trees:delete") && <ActionButton size="sm" variant="danger-ghost" action={deleteMeasurement.bind(null, x.id)} confirm="Excluir esta medição?"><Trash2 className="size-3.5" /></ActionButton>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-stone-500">DAP = CAP / π. Para multifuste, DAP equivalente = √(Σ dᵢ²). Área da copa = π · (N-S/2) · (L-O/2).</p>
        </Card>
      )}

      {tab === "raizes" && <FindingsTab category="RAIZES" inspections={t.inspections} treeCode={t.code} />}
      {tab === "tronco" && <FindingsTab category="TRONCO" inspections={t.inspections} treeCode={t.code} />}
      {tab === "copa" && <FindingsTab category="COPA" inspections={t.inspections} treeCode={t.code} />}
      {tab === "fitossanidade" && <FindingsTab category="FITOSSANIDADE" inspections={t.inspections} treeCode={t.code} />}

      {tab === "riscos" && (
        <Card title="Avaliações de risco (ISA TRAQ)" actions={can("risk:write") && <LinkButton size="sm" variant="primary" href={`/riscos/nova?arvore=${t.code}`} icon={ShieldAlert}>Nova avaliação</LinkButton>}>
          {t.riskAssessments.length === 0 ? <p className="text-sm text-stone-500">Nenhuma avaliação de risco.</p> : (
            <ul className="space-y-3">
              {t.riskAssessments.map((r, i) => (
                <li key={r.id} className={clsx("rounded-xl border p-3", i === 0 ? "border-brand-200 bg-brand-50/40" : "border-stone-200")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/riscos/${r.id}`} className="font-medium hover:underline">{fmtDate(r.assessedAt)} · {r.assessor?.name ?? "—"}</Link>
                    <div className="flex gap-1.5"><RiskBadge value={r.riskRating} />{r.residualRisk && <Badge>Residual: {RISK_LEVEL[r.residualRisk]}</Badge>}</div>
                  </div>
                  <DataList cols={3} items={[
                    ["Alvos", r.targets.map((x) => labelOf(RISK_TARGETS, x)).join(", ")],
                    ["Frequência do alvo", labelOf(TARGET_OCCUPANCY, r.targetOccupancy)],
                    ["Parte com possibilidade de falha", labelOf(TREE_PARTS, r.partAtRisk)],
                    ["Probabilidade de falha", labelOf(FAILURE_LIKELIHOOD, r.failureLikelihood)],
                    ["Probabilidade de impacto", labelOf(IMPACT_LIKELIHOOD, r.impactLikelihood)],
                    ["Consequência", labelOf(CONSEQUENCE, r.consequence)],
                  ]} />
                  {r.recommendedAction && <p className="mt-2 text-sm"><strong>Ação recomendada:</strong> {r.recommendedAction}</p>}
                </li>
              ))}
            </ul>
          )}
          {lastRisk && <p className="mt-3 text-xs text-stone-500">O risco atual do exemplar corresponde à avaliação mais recente.</p>}
        </Card>
      )}

      {tab === "inspecoes" && (
        <Card title="Inspeções" actions={can("inspections:write") && <LinkButton size="sm" variant="primary" href={`/inspecoes/nova?arvore=${t.code}`} icon={ClipboardCheck}>Nova inspeção</LinkButton>}>
          {t.inspections.length === 0 ? <p className="text-sm text-stone-500">Nenhuma inspeção registrada.</p> : (
            <ol className="relative space-y-4 border-l-2 border-stone-200 pl-5">
              {t.inspections.map((i) => (
                <li key={i.id} className="relative">
                  <span className="absolute top-1.5 -left-[27px] size-3 rounded-full border-2 border-white bg-brand-600 ring-2 ring-brand-200" />
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/inspecoes/${i.id}`} className="font-semibold hover:underline">{fmtDate(i.inspectedAt)}</Link>
                    <ConditionBadge value={i.generalCondition} />
                    <PriorityBadge value={i.priority} />
                    <span className="text-xs text-stone-500">{labelOf(INSPECTION_REASONS, i.reason)} · {i.inspector?.name ?? "—"}</span>
                  </div>
                  {i.problems && <p className="mt-1 text-sm text-stone-700">{i.problems}</p>}
                  {i.recommendation && <p className="text-sm"><strong>Recomendação:</strong> {i.recommendation}</p>}
                  <p className="text-xs text-stone-500">Próxima inspeção: {fmtDate(i.nextInspectionAt)} · {i.findings.length} achado(s)</p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      {tab === "intervencoes" && (
        <Card title="Intervenções" actions={can("interventions:write") && <LinkButton size="sm" variant="primary" href={`/intervencoes/nova?arvore=${t.code}`} icon={Wrench}>Registrar</LinkButton>}>
          {t.interventions.length === 0 ? <p className="text-sm text-stone-500">Nenhuma intervenção.</p> : (
            <ul className="divide-y divide-stone-100">
              {t.interventions.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/intervencoes/${i.id}`} className="link">{labelOf(INTERVENTION_TYPES, i.type)}</Link>
                    <p className="text-xs text-stone-500">
                      Programada {fmtDate(i.scheduledAt)} · executada {fmtDate(i.executedAt)} · {i.team?.name ?? i.responsible?.name ?? "—"}
                      {i.workOrder && <> · <Link className="link" href={`/ordens-servico/${i.workOrder.id}`}>{i.workOrder.number}</Link></>}
                      {" · "}{fmtMoney(i.actualCost ?? i.estimatedCost)}
                    </p>
                  </div>
                  <div className="flex gap-1.5"><PriorityBadge value={i.priority} /><FlowStatusBadge value={i.status} labels={INTERVENTION_STATUS} /></div>
                </li>
              ))}
            </ul>
          )}
          {t.workOrders.length > 0 && (
            <div className="mt-4 border-t border-stone-100 pt-3">
              <p className="mb-2 text-xs font-semibold text-stone-500 uppercase">Ordens de serviço</p>
              <div className="flex flex-wrap gap-2">
                {t.workOrders.map((w) => (
                  <Link key={w.id} href={`/ordens-servico/${w.id}`} className="btn btn-secondary btn-sm">{w.number} · {WORK_ORDER_STATUS[w.status]}</Link>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {tab === "fotos" && (
        <Card title="Fotos" className="scroll-mt-20" >
          <div id="fotos" />
          {can("files:write") && <div className="mb-4"><PhotoUploader refs={{ treeId: t.id }} /></div>}
          <PhotoGallery photos={t.photos} canDelete={can("files:delete")} />
        </Card>
      )}

      {tab === "documentos" && (
        <Card title="Documentos (laudos, autorizações, relatórios)">
          {can("files:write") && <div className="mb-4"><DocumentUploader refs={{ treeId: t.id }} /></div>}
          <DocumentList docs={t.documents} canDelete={can("files:delete")} />
        </Card>
      )}

      {tab === "historico" && <History tree={t} />}
    </>
  );
}

function Metric({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "red" | "amber" }) {
  return (
    <div className={clsx("card p-3", tone === "red" && "border-red-200 bg-red-50", tone === "amber" && "border-amber-200 bg-amber-50")}>
      <div className="text-[11px] font-medium text-stone-500 uppercase">{label}</div>
      <div className="mt-0.5 text-base font-bold text-stone-900">{value}</div>
      {hint && <div className="text-xs text-stone-500">{hint}</div>}
    </div>
  );
}

type TreeFull = Awaited<ReturnType<typeof db.tree.findUniqueOrThrow>> & {
  measurements: { id: string; measuredAt: Date; dap: number | null; totalHeight: number | null }[];
  inspections: { id: string; inspectedAt: Date; generalCondition: string; recommendation: string | null }[];
  riskAssessments: { id: string; assessedAt: Date; riskRating: string }[];
  interventions: { id: string; type: string; status: string; executedAt: Date | null; scheduledAt: Date | null; createdAt: Date }[];
  workOrders: { id: string; number: string; createdAt: Date; status: string }[];
  photos: { id: string; takenAt: Date; type: string }[];
};

/** Linha do tempo consolidada, agrupada por ano (ex.: 2026 — inspeção). */
function History({ tree }: { tree: TreeFull }) {
  type Ev = { date: Date; kind: string; text: React.ReactNode; href?: string; tone: string };
  const ev: Ev[] = [
    { date: tree.createdAt, kind: "Cadastro", text: `Exemplar cadastrado como ${tree.code}`, tone: "bg-stone-400" },
    ...tree.measurements.map((m) => ({ date: m.measuredAt, kind: "Medição", text: `DAP ${fmtNum(m.dap, "cm")} · altura ${fmtNum(m.totalHeight, "m")}`, tone: "bg-sky-500" })),
    ...tree.inspections.map((i) => ({ date: i.inspectedAt, kind: "Inspeção", text: <>Condição <ConditionBadge value={i.generalCondition} /> {i.recommendation}</>, href: `/inspecoes/${i.id}`, tone: "bg-brand-600" })),
    ...tree.riskAssessments.map((r) => ({ date: r.assessedAt, kind: "Avaliação de risco", text: <RiskBadge value={r.riskRating} />, href: `/riscos/${r.id}`, tone: "bg-orange-500" })),
    ...tree.interventions.map((i) => ({
      date: i.executedAt ?? i.scheduledAt ?? i.createdAt,
      kind: labelOf(INTERVENTION_TYPES, i.type),
      text: INTERVENTION_STATUS[i.status],
      href: `/intervencoes/${i.id}`,
      tone: i.status === "CONCLUIDA" ? "bg-emerald-600" : "bg-amber-500",
    })),
    ...tree.workOrders.map((w) => ({ date: w.createdAt, kind: "Ordem de serviço", text: `${w.number} · ${WORK_ORDER_STATUS[w.status]}`, href: `/ordens-servico/${w.id}`, tone: "bg-violet-500" })),
    ...tree.photos.map((p) => ({ date: p.takenAt, kind: "Foto", text: `Foto — ${labelOf(PHOTO_TYPES, p.type)}`, tone: "bg-stone-300" })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const years = [...new Set(ev.map((e) => e.date.getFullYear()))];
  return (
    <Card title="Histórico técnico">
      <div className="space-y-6">
        {years.map((y) => (
          <section key={y}>
            <h3 className="mb-2 text-lg font-bold text-stone-800">{y}</h3>
            <ol className="relative space-y-3 border-l-2 border-stone-200 pl-5">
              {ev.filter((e) => e.date.getFullYear() === y).map((e, i) => (
                <li key={i} className="relative">
                  <span className={clsx("absolute top-1.5 -left-[27px] size-3 rounded-full border-2 border-white", e.tone)} />
                  <div className="text-sm">
                    <span className="font-semibold">{y} — {e.kind.toLowerCase()}</span>{" "}
                    <span className="text-xs text-stone-500">{fmtDate(e.date)}</span>
                  </div>
                  <div className="text-sm text-stone-700">{e.href ? <Link href={e.href} className="hover:underline">{e.text}</Link> : e.text}</div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </Card>
  );
}
