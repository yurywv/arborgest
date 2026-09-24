"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Loader2, SlidersHorizontal } from "lucide-react";
import type { PricingEstimateStatus } from "@prisma/client";
import { ActionForm, Checkbox, Field, SubmitButton, TextArea } from "@/components/form";
import type { ActionState } from "@/lib/action-state";
import {
  adjustItem, changeStatus, createWorkOrdersFromEstimate, decideApproval, repriceWithActiveParams, saveItem, setDiscount, setEstimateMargin,
} from "../actions";
import { PricingSimulator, type SimulatorProps } from "@/components/pricing/simulator";

/** Botão que pede motivo (quando exigido) e executa uma ação. */
export function ReasonButton({
  label, prompt, required = false, run, variant = "secondary", confirmText, className,
}: {
  label: React.ReactNode; prompt?: string; required?: boolean; run: (reason: string) => Promise<ActionState>;
  variant?: "primary" | "secondary" | "danger" | "ghost" | "danger-ghost"; confirmText?: string; className?: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button type="button" disabled={pending} className={clsx("btn btn-sm", `btn-${variant}`, className)}
      onClick={() => {
        let reason = "";
        if (prompt) {
          const r = window.prompt(prompt);
          if (r === null) return;
          reason = r.trim();
          if (required && reason.length < 5) { window.alert("Informe o motivo (mínimo 5 caracteres)."); return; }
        } else if (confirmText && !window.confirm(confirmText)) return;
        start(async () => {
          const res = await run(reason);
          if (res && !res.ok) window.alert(res.message ?? "Falha na operação.");
          else if (res?.message) window.alert(res.message);
          router.refresh();
        });
      }}>
      {pending && <Loader2 className="size-3.5 animate-spin" />} {label}
    </button>
  );
}

export function StatusButton({ id, target, label, prompt, required, variant }: {
  id: string; target: PricingEstimateStatus; label: string; prompt?: string; required?: boolean; variant?: "primary" | "secondary" | "danger-ghost";
}) {
  return <ReasonButton label={label} prompt={prompt} required={required} variant={variant} run={(r) => changeStatus(id, target, r)} />;
}

export function RepriceButton({ id, from, to }: { id: string; from: string; to: string }) {
  return (
    <ReasonButton label={`Atualizar para parâmetros v${to}`} required
      prompt={`Recalcular todos os itens com os parâmetros vigentes (v${from} → v${to})? Os ajustes manuais são mantidos e a aprovação será refeita.\n\nMotivo:`}
      run={(r) => repriceWithActiveParams(id, r)} />
  );
}

export function ApprovalDecision({ approvalId }: { approvalId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ReasonButton label="Aprovar" variant="primary" prompt="Comentário (opcional):" run={(c) => decideApproval(approvalId, true, c)} />
      <ReasonButton label="Reprovar" variant="danger-ghost" prompt="Motivo da reprovação:" required run={(c) => decideApproval(approvalId, false, c)} />
    </div>
  );
}

/** Ajustes autorizados do item: margem, custo adicional, preço final — sempre com motivo. */
export function AdjustItem({ estimateId, itemId, marginOverride, extraCost, priceOverride }: {
  estimateId: string; itemId: string; marginOverride: string | null; extraCost: string; priceOverride: string | null;
}) {
  const [open, setOpen] = useState(false);
  const pctStr = marginOverride ? String(Math.round(Number(marginOverride) * 1e4) / 100).replace(".", ",") : "";
  const brl = (v: string | null) => (v && Number(v) ? Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "");
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}><SlidersHorizontal className="size-3.5" /> Ajustar</button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/30 sm:place-items-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Ajustar preço do item">
            <h3 className="mb-1 font-semibold">Ajustar preço do item</h3>
            <p className="mb-3 text-xs text-stone-500">O preço calculado original é preservado. Deixe em branco para remover o ajuste.</p>
            <ActionForm action={adjustItem.bind(null, estimateId, itemId)} className="space-y-3" onSuccess={() => setOpen(false)} refreshOnSuccess>
              <div className="grid grid-cols-2 gap-3">
                <Field name="marginOverride" label="Margem (%)" inputMode="decimal" defaultValue={pctStr} placeholder="35" hint="≥ 0% e < 100%" />
                <Field name="extraCost" label="Custo adicional (R$)" inputMode="decimal" defaultValue={brl(extraCost)} />
              </div>
              <Field name="priceOverride" label="Preço final do item (R$)" inputMode="decimal" defaultValue={brl(priceOverride)} hint="Se preenchido, prevalece sobre margem e custo adicional." />
              <TextArea name="adjustReason" label="Motivo" required rows={2} />
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
                <SubmitButton>Aplicar ajuste</SubmitButton>
              </div>
            </ActionForm>
          </div>
        </div>
      )}
    </>
  );
}

export function DiscountForm({ estimateId, type, value, reason, alert }: { estimateId: string; type: string | null; value: string | null; reason: string | null; alert: string }) {
  const [t, setT] = useState(type ?? "");
  const display = value ? (type === "PERCENT" ? String(Math.round(Number(value) * 1e4) / 100) : Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })).replace(".", type === "PERCENT" ? "," : ".") : "";
  return (
    <ActionForm action={setDiscount.bind(null, estimateId)} className="space-y-3" refreshOnSuccess>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="discountType">Tipo</label>
          <select id="discountType" name="discountType" className="input" value={t} onChange={(e) => setT(e.target.value)}>
            <option value="">Sem desconto</option>
            <option value="PERCENT">Percentual (%)</option>
            <option value="AMOUNT">Valor (R$)</option>
          </select>
        </div>
        <Field name="discountValue" label={t === "AMOUNT" ? "Desconto (R$)" : "Desconto (%)"} inputMode="decimal" defaultValue={display} disabled={!t} />
      </div>
      <TextArea name="reason" label="Motivo" rows={2} defaultValue={reason} />
      <Checkbox name="confirmDiscount" label={`Confirmo desconto acima de ${alert}, se for o caso`} />
      <SubmitButton variant="secondary">Aplicar desconto</SubmitButton>
    </ActionForm>
  );
}

export function EstimateMarginForm({ estimateId, current, defaultPct }: { estimateId: string; current: string | null; defaultPct: string }) {
  const pct = current ? String(Math.round(Number(current) * 1e6) / 1e4).replace(".", ",") : "";
  return (
    <ActionForm action={setEstimateMargin.bind(null, estimateId)} className="space-y-3" refreshOnSuccess>
      <Field name="marginPercent" label="Margem de lucro (%)" inputMode="decimal" defaultValue={pct} placeholder={defaultPct} suffix="%"
        hint={`Em branco = padrão (${defaultPct}%). Não pode ser negativa. Vale para todos os itens sem margem ou preço próprios.`} />
      <TextArea name="marginReason" label="Motivo" rows={2} required />
      <SubmitButton variant="secondary">Aplicar margem</SubmitButton>
    </ActionForm>
  );
}

export function WorkOrderForm({ estimateId }: { estimateId: string }) {
  return (
    <ActionForm action={createWorkOrdersFromEstimate.bind(null, estimateId)} className="flex flex-wrap items-end gap-2" refreshOnSuccess>
      <Field name="scheduledAt" label="Programar para" type="date" wrapClassName="min-w-44" />
      <SubmitButton variant="secondary">Criar ordens de serviço</SubmitButton>
    </ActionForm>
  );
}

/** Simulador ligado ao orçamento (salva o item via servidor). */
export function ItemSimulator(props: Omit<SimulatorProps, "onSave"> & { estimateId: string; itemId: string | null }) {
  const { estimateId, itemId, ...rest } = props;
  return (
    <PricingSimulator {...rest} saveLabel={itemId ? "Salvar alterações do item" : "Adicionar à proposta"}
      onSave={async (payload) => saveItem(estimateId, itemId, JSON.stringify(payload))} />
  );
}
