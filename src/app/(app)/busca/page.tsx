import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, MapPinned, Search, Trees } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { ci, spGet, type SP } from "@/lib/query";
import { treeWhere } from "@/lib/tree-filters";
import { Card, ConditionBadge, EmptyState, PageHeader, TreeStatusBadge } from "@/components/ui";

export const metadata = { title: "Busca" };

/** Busca global: código/QR da árvore, nome popular/científico, cliente, propriedade e endereço. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = spGet(sp, "q");
  if (!q) return <><PageHeader title="Busca" /><EmptyState icon={Search} title="Digite um termo na barra de busca" /></>;

  // Código exato (ou conteúdo de QR com URL) → vai direto para a ficha
  const code = q.toUpperCase().match(/ARB-\d{6,}/)?.[0];
  if (code && hasPermission(user.permissions, "trees:read")) {
    const t = await db.tree.findUnique({ where: { code }, select: { code: true } });
    if (t) redirect(`/arvores/${t.code}`);
  }
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(user.permissions, p);
  const [trees, clients, properties] = await Promise.all([
    can("trees:read") ? db.tree.findMany({ where: treeWhere({ q }), take: 30, orderBy: { code: "asc" }, include: { species: true, property: { select: { name: true } } } }) : [],
    can("clients:read") ? db.client.findMany({ where: { OR: [{ legalName: ci(q) }, { tradeName: ci(q) }, { document: { contains: q.replace(/\D/g, "") || q } }, { address: ci(q) }] }, take: 10 }) : [],
    can("properties:read") ? db.property.findMany({ where: { OR: [{ name: ci(q) }, { address: ci(q) }, { district: ci(q) }, { city: ci(q) }] }, take: 10, include: { client: { select: { tradeName: true, legalName: true } } } }) : [],
  ]);
  const total = trees.length + clients.length + properties.length;
  return (
    <>
      <PageHeader title={`Resultados para “${q}”`} subtitle={`${total} resultado(s)`} />
      {total === 0 && <EmptyState icon={Search} title="Nada encontrado" description="Tente o código da árvore (ex.: 12 ou ARB-000012), a espécie, o cliente ou o endereço." />}
      <div className="grid gap-4 lg:grid-cols-3">
        {trees.length > 0 && (
          <Card title={<span className="flex items-center gap-2"><Trees className="size-4" /> Árvores ({trees.length})</span>} className="lg:col-span-2">
            <ul className="divide-y divide-stone-100">
              {trees.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <Link className="link font-mono" href={`/arvores/${t.code}`}>{t.code}</Link> <span className="text-sm">{t.species?.popularName ?? "—"}</span>
                    <p className="truncate text-xs text-stone-500">{t.species?.scientificName} · {t.property.name} · {t.address ?? ""}</p>
                  </div>
                  <div className="flex gap-1"><TreeStatusBadge value={t.status} /><ConditionBadge value={t.currentCondition} /></div>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <div className="space-y-4">
          {clients.length > 0 && (
            <Card title={<span className="flex items-center gap-2"><Building2 className="size-4" /> Clientes</span>}>
              <ul className="space-y-2">{clients.map((c) => <li key={c.id}><Link className="link" href={`/clientes/${c.id}`}>{c.tradeName ?? c.legalName}</Link><p className="text-xs text-stone-500">{c.city}</p></li>)}</ul>
            </Card>
          )}
          {properties.length > 0 && (
            <Card title={<span className="flex items-center gap-2"><MapPinned className="size-4" /> Propriedades</span>}>
              <ul className="space-y-2">{properties.map((p) => <li key={p.id}><Link className="link" href={`/propriedades/${p.id}`}>{p.name}</Link><p className="text-xs text-stone-500">{p.client.tradeName ?? p.client.legalName} · {p.address}</p></li>)}</ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
