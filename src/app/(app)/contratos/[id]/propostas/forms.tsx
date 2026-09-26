"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm, Checkbox, Field, FormActions, FormSection, NumberField, SelectField, SubmitButton, TextArea } from "@/components/form";
import type { Option } from "@/lib/catalogs";
import { toInputDate } from "@/lib/format";
import { createContractProposal, decideContractProposal, sendContractProposal } from "./actions";

export type ProposalItemDraft = { title: string; description: string; quantity: string; unit: string; unitPrice: string };
export type ContractProposalDraft = {
  title: string; object: string; scope: string; contactId: string | null; validUntil: Date | null; deadline: string; paymentTerms: string;
  conditions: string; assumptions: string; exclusions: string; responsibilities: string; notes: string; discount: string; items: ProposalItemDraft[];
};

const EMPTY_ITEM: ProposalItemDraft = { title: "", description: "", quantity: "", unit: "", unitPrice: "" };
const num = (v: string) => Number(v.replace(/\./g, "").replace(",", ".")) || 0;
const toNum = (v: string) => (v.trim() ? String(num(v)) : "");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Formulário de proposta emitida em Contratos. Começa em branco; em "nova versão" traz o conteúdo da versão escolhida. */
export function ContractProposalForm({ contractId, contacts, draft, replacesId }: {
  contractId: string; contacts: Option[]; draft?: ContractProposalDraft; replacesId?: string;
}) {
  const [items, setItems] = useState<ProposalItemDraft[]>(draft?.items.length ? draft.items : [{ ...EMPTY_ITEM }]);
  const [discount, setDiscount] = useState(draft?.discount ?? "");
  const set = (i: number, k: keyof ProposalItemDraft, v: string) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const subtotal = items.reduce((s, i) => s + Math.round(num(i.quantity) * num(i.unitPrice) * 100) / 100, 0);
  const total = subtotal - num(discount);
  const payload = JSON.stringify(items.map((i) => ({ ...i, quantity: toNum(i.quantity), unitPrice: toNum(i.unitPrice) })));

  return (
    <ActionForm action={createContractProposal.bind(null, contractId)} className="space-y-4">
      <input type="hidden" name="items" value={payload} />
      {replacesId && <input type="hidden" name="replacesId" value={replacesId} />}
      <FormSection title="Documento" description="A proposta é gerada em PDF para envio ao cliente e fica no histórico do contrato e do cliente.">
        <Field name="title" label="Título" required defaultValue={draft?.title} wrapClassName="sm:col-span-2" />
        <SelectField name="contactId" label="Aos cuidados de (contato)" options={contacts} defaultValue={draft?.contactId} placeholder="—" />
        <Field name="validUntil" label="Válida até" type="date" defaultValue={draft?.validUntil ? toInputDate(draft.validUntil) : undefined} />
        <TextArea name="object" label="Objeto" required rows={3} defaultValue={draft?.object} wrapClassName="sm:col-span-2" />
        <TextArea name="scope" label="Escopo" rows={4} defaultValue={draft?.scope} wrapClassName="sm:col-span-2" />
      </FormSection>

      <section className="card space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Serviços e valores</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setItems((xs) => [...xs, { ...EMPTY_ITEM }])}><Plus className="size-4" /> Incluir serviço</button>
        </div>
        <ol className="space-y-3">
          {items.map((it, i) => (
            <li key={i} className="rounded-xl border border-stone-200 p-3" data-testid="proposal-item">
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-stone-500">
                <span>Serviço {i + 1}</span>
                {items.length > 1 && (
                  <button type="button" className="btn btn-ghost btn-sm text-red-700" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} aria-label={`Remover serviço ${i + 1}`}>
                    <Trash2 className="size-4" /> Remover
                  </button>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-6">
                <label className="sm:col-span-6"><span className="label">Serviço *</span>
                  <input className="input" value={it.title} onChange={(e) => set(i, "title", e.target.value)} maxLength={300} autoComplete="off" aria-label={`Serviço ${i + 1}`} /></label>
                <label className="sm:col-span-6"><span className="label">Descrição</span>
                  <textarea className="input" rows={2} value={it.description} onChange={(e) => set(i, "description", e.target.value)} maxLength={2000} autoComplete="off" aria-label={`Descrição do serviço ${i + 1}`} /></label>
                <label className="sm:col-span-2"><span className="label">Quantidade *</span>
                  <input className="input" inputMode="decimal" value={it.quantity} onChange={(e) => set(i, "quantity", e.target.value)} autoComplete="off" aria-label={`Quantidade do serviço ${i + 1}`} /></label>
                <label className="sm:col-span-1"><span className="label">Unidade *</span>
                  <input className="input" value={it.unit} onChange={(e) => set(i, "unit", e.target.value)} maxLength={30} autoComplete="off" aria-label={`Unidade do serviço ${i + 1}`} /></label>
                <label className="sm:col-span-2"><span className="label">Valor unitário (R$) *</span>
                  <input className="input" inputMode="decimal" value={it.unitPrice} onChange={(e) => set(i, "unitPrice", e.target.value)} autoComplete="off" aria-label={`Valor unitário do serviço ${i + 1}`} /></label>
                <div className="sm:col-span-1"><span className="label">Total</span><p className="py-2 text-sm font-semibold tabular-nums">{brl(Math.round(num(it.quantity) * num(it.unitPrice) * 100) / 100)}</p></div>
              </div>
            </li>
          ))}
        </ol>
        <div className="grid items-end gap-2 border-t border-stone-100 pt-3 sm:grid-cols-3">
          <p className="text-sm">Subtotal: <strong className="tabular-nums">{brl(subtotal)}</strong></p>
          <label><span className="label">Desconto (R$)</span>
            <input name="discount" className="input" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} autoComplete="off" /></label>
          <p className="text-sm sm:text-right">Total da proposta: <strong className={`tabular-nums ${total < 0 ? "text-red-700" : ""}`} data-testid="proposal-total">{brl(total)}</strong></p>
        </div>
      </section>

      <FormSection title="Condições">
        <TextArea name="deadline" label="Prazo de execução" rows={2} defaultValue={draft?.deadline} />
        <TextArea name="paymentTerms" label="Forma de pagamento" rows={2} defaultValue={draft?.paymentTerms} />
        <TextArea name="conditions" label="Condições comerciais" rows={3} defaultValue={draft?.conditions} wrapClassName="sm:col-span-2" />
        <TextArea name="assumptions" label="Premissas" rows={3} defaultValue={draft?.assumptions} wrapClassName="sm:col-span-2" />
        <TextArea name="exclusions" label="Exclusões" rows={3} defaultValue={draft?.exclusions} wrapClassName="sm:col-span-2" />
        <TextArea name="responsibilities" label="Responsabilidades" rows={3} defaultValue={draft?.responsibilities} wrapClassName="sm:col-span-2" />
        <TextArea name="notes" label="Observações" rows={3} defaultValue={draft?.notes} wrapClassName="sm:col-span-2" />
      </FormSection>
      <FormActions cancelHref={`/contratos/${contractId}`}><SubmitButton className="flex-1 md:flex-none">Gerar proposta em PDF</SubmitButton></FormActions>
    </ActionForm>
  );
}

export function SendContractProposalForm({ contractId, proposalId, smtp }: { contractId: string; proposalId: string; smtp: boolean }) {
  return (
    <ActionForm action={sendContractProposal.bind(null, contractId, proposalId)} className="space-y-3" refreshOnSuccess>
      <Field name="to" label="Destinatário(s)" hint="Separe vários e-mails por vírgula." />
      <TextArea name="message" label="Mensagem" rows={3} />
      <Checkbox name="byEmail" label="Enviar por e-mail com o PDF anexo"
        hint={smtp ? "Envia pela conta Gmail cadastrada no sistema." : "Nenhuma conta Gmail cadastrada — apenas registra o envio (baixe o PDF e envie manualmente)."} />
      <SubmitButton>Registrar envio</SubmitButton>
    </ActionForm>
  );
}

const OUTCOMES: Option[] = [
  { value: "ACEITA", label: "Aceita pelo cliente" },
  { value: "RECUSADA", label: "Recusada pelo cliente" },
  { value: "CANCELADA", label: "Cancelada" },
];

export function DecideContractProposalForm({ contractId, proposalId }: { contractId: string; proposalId: string }) {
  const [status, setStatus] = useState("");
  return (
    <ActionForm action={decideContractProposal.bind(null, contractId, proposalId)} className="space-y-3" refreshOnSuccess>
      <SelectField name="status" label="Resultado" required options={OUTCOMES} onChange={(e) => setStatus(e.target.value)} />
      {status === "ACEITA" && <Field name="acceptedBy" label="Aceita por (nome / cargo)" required />}
      <TextArea name="note" label="Observação" rows={2} />
      <p className="text-xs text-stone-500">Anexe a proposta assinada em “Documentos” escolhendo o tipo “Proposta assinada”.</p>
      <SubmitButton variant="secondary">Registrar resultado</SubmitButton>
    </ActionForm>
  );
}
