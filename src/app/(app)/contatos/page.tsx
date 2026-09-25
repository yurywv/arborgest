import Link from "next/link";
import { Contact as ContactIcon, MessageCircle, Phone, Plus } from "lucide-react";
import { ContactType, type Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { ci, pageOf, spFlat, spGet, type SP } from "@/lib/query";
import { clientOptions } from "@/lib/options";
import { whatsappLink } from "@/lib/format";
import { CONTACT_TYPE } from "@/lib/catalogs";
import { Badge, ContactTypeBadge, EmptyState, LinkButton, PageHeader, Pagination } from "@/components/ui";
import { FilterForm, FilterSelect, SearchBox } from "@/components/filters";

export const metadata = { title: "Contatos" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("clients:read");
  const sp = await searchParams;
  const q = spGet(sp, "q");
  const clientId = spGet(sp, "cliente");
  const typeParam = spGet(sp, "tipo");
  const type = typeParam && typeParam in ContactType ? (typeParam as ContactType) : undefined;
  const { page, pageSize, skip, take } = pageOf(sp, 30);
  const where: Prisma.ContactWhereInput = {
    ...(q && { OR: [{ name: ci(q) }, { email: ci(q) }, { jobTitle: ci(q) }, { mobile: { contains: q } }] }),
    ...(clientId && { clientId }),
    ...(type && { type }),
  };
  const [rows, total, clients] = await Promise.all([
    db.contact.findMany({ where, skip, take, orderBy: { name: "asc" }, include: { client: { select: { id: true, legalName: true, tradeName: true } } } }),
    db.contact.count({ where }),
    clientOptions(),
  ]);
  return (
    <>
      <PageHeader title="Contatos" actions={hasPermission(user.permissions, "clients:write") && <LinkButton href="/contatos/novo" variant="primary" icon={Plus}>Novo contato</LinkButton>} />
      <FilterForm>
        <SearchBox defaultValue={q} />
        <FilterSelect name="cliente" label="Cliente" options={clients} value={clientId} />
        <FilterSelect name="tipo" label="Classificação" options={Object.entries(CONTACT_TYPE).map(([value, label]) => ({ value, label }))} value={type} />
      </FilterForm>
      {rows.length === 0 ? <EmptyState icon={ContactIcon} title="Nenhum contato encontrado" /> : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((k) => (
            <li key={k.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/contatos/${k.id}/editar`} className="font-semibold hover:underline">{k.name}</Link>
                  <p className="truncate text-xs text-stone-500">{k.jobTitle ?? "—"} · <Link className="link" href={`/clientes/${k.client.id}`}>{k.client.tradeName ?? k.client.legalName}</Link></p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  <ContactTypeBadge value={k.type} />
                  {k.isPrimary && <Badge tone="green">Principal</Badge>}
                </div>
              </div>
              {k.email && <p className="mt-2 truncate text-sm"><a className="link" href={`mailto:${k.email}`}>{k.email}</a></p>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(k.mobile || k.phone) && <a href={`tel:${k.mobile ?? k.phone}`} className="btn btn-secondary btn-sm"><Phone className="size-3.5" /> {k.mobile ?? k.phone}</a>}
                {k.whatsapp && <a href={whatsappLink(k.whatsapp)!} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm"><MessageCircle className="size-3.5" /> WhatsApp</a>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/contatos" />
    </>
  );
}
