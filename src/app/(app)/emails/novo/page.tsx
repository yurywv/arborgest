import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { DOCUMENT_TYPES, labelOf } from "@/lib/catalogs";
import { getMailAccount } from "@/lib/mail";
import { PageHeader } from "@/components/ui";
import { ComposeForm } from "../compose-form";

export const metadata = { title: "Enviar e-mail" };

export default async function ComposeEmail({ searchParams }: { searchParams: Promise<{ cliente?: string; contato?: string; para?: string }> }) {
  const user = await requirePermission("clients:write");
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(user.permissions, p);
  const sp = await searchParams;
  const contact = sp.contato ? await db.contact.findUnique({ where: { id: sp.contato }, select: { id: true, clientId: true, email: true } }) : null;
  const clientId = contact?.clientId ?? sp.cliente;
  if (!clientId) notFound();
  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true, legalName: true, tradeName: true, email: true } });
  if (!client) notFound();
  const [account, contacts, docs, proposals] = await Promise.all([
    getMailAccount(),
    db.contact.findMany({ where: { clientId }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    db.document.findMany({
      where: { OR: [{ clientId }, { contract: { clientId } }, { proposal: { clientId } }] }, orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, fileName: true, type: true, size: true },
    }),
    db.commercialProposal.findMany({
      where: { clientId, status: { notIn: ["CANCELADA", "SUBSTITUIDA"] }, OR: [...(can("pricing:read") ? [{ estimateId: { not: null } }] : []), ...(can("contracts:read") ? [{ contractId: { not: null } }] : [])] },
      orderBy: { date: "desc" }, take: 30, select: { id: true, number: true, version: true, title: true },
    }),
  ]);
  const to = sp.para ?? contact?.email ?? "";
  const back = contact ? `/clientes/${clientId}?aba=resumo` : `/clientes/${clientId}`;
  const ready = !!account?.hasPassword;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: back, label: client.tradeName ?? client.legalName }} title="Enviar e-mail" subtitle={client.tradeName ?? client.legalName} />
      {!ready && (
        <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          Nenhuma conta Gmail cadastrada para envio.{" "}
          {can("settings:manage") ? <Link className="link" href="/admin/configuracoes">Cadastrar em Configurações</Link> : "Peça ao administrador para cadastrá-la em Administração › Configurações."}
        </p>
      )}
      <ComposeForm
        clientId={clientId} to={to} contactId={contact?.id ?? null} back={back} disabled={!ready}
        from={account?.hasPassword ? `${account.senderName} <${account.user}>` : null}
        contacts={contacts.map((c) => ({ value: c.id, label: c.email ? `${c.name} — ${c.email}` : c.name }))}
        docs={docs.map((d) => ({ value: d.id, label: `${d.fileName} (${labelOf(DOCUMENT_TYPES, d.type)}, ${(d.size / 1048576).toFixed(1)} MB)` }))}
        proposals={proposals.map((p) => ({ value: p.id, label: `${p.number}${p.version > 1 ? ` v${p.version}` : ""} — ${p.title}` }))}
      />
    </div>
  );
}
