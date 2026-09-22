"use client";

import { createContext, useActionState, useContext, useEffect, useRef, useState, startTransition, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { ActionState } from "@/lib/action-state";
import type { Option } from "@/lib/catalogs";

type Ctx = { errors?: Record<string, string>; pending: boolean };
const FormCtx = createContext<Ctx>({ pending: false });
export const useFormCtx = () => useContext(FormCtx);

export type FormAction = (state: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * Formulário ligado a uma server action.
 * Usa onSubmit + startTransition para NÃO limpar os campos quando há erro de validação
 * (comportamento padrão do React 19 com `action=`).
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  onSuccess,
  refreshOnSuccess,
  id,
}: {
  action: FormAction;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (s: ActionState) => void;
  refreshOnSuccess?: boolean;
  id?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!state?.ok) {
      if (state?.errors) {
        const first = Object.keys(state.errors)[0];
        const el = ref.current?.querySelector<HTMLElement>(`[name="${CSS.escape(first)}"]`);
        el?.focus();
      }
      return;
    }
    if (state.redirectTo) {
      router.push(state.redirectTo);
      return;
    }
    if (resetOnSuccess) ref.current?.reset();
    if (refreshOnSuccess) router.refresh();
    onSuccess?.(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.ts]);

  return (
    <form
      ref={ref}
      id={id}
      className={className}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      {state?.message && !state.redirectTo && <FormAlert ok={state.ok} message={state.message} />}
      <FormCtx.Provider value={{ errors: state?.errors, pending: pending || !!state?.redirectTo }}>{children}</FormCtx.Provider>
    </form>
  );
}

export function FormAlert({ ok, message }: { ok: boolean; message: string }) {
  return (
    <div
      role={ok ? "status" : "alert"}
      className={clsx(
        "mb-4 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm",
        ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800",
      )}
    >
      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertCircle className="mt-0.5 size-4 shrink-0" />}
      <span>{message}</span>
    </div>
  );
}

function FieldWrap({ name, label, hint, required, children, className }: {
  name: string; label?: React.ReactNode; hint?: React.ReactNode; required?: boolean; children: React.ReactNode; className?: string;
}) {
  const { errors } = useFormCtx();
  const err = errors?.[name];
  return (
    <div className={className}>
      {label && (
        <label htmlFor={`f-${name}`} className="label">
          {label}{required && <span className="text-red-600"> *</span>}
        </label>
      )}
      {children}
      {err ? (
        <p id={`e-${name}`} className="mt-1 text-xs font-medium text-red-600">{err}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-stone-500">{hint}</p>
      ) : null}
    </div>
  );
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "defaultValue"> & {
  name: string;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  defaultValue?: string | number | null;
  wrapClassName?: string;
  suffix?: string;
};

export function Field({ name, label, hint, defaultValue, wrapClassName, className, suffix, required, ...rest }: InputProps) {
  const { errors } = useFormCtx();
  const err = errors?.[name];
  const input = (
    <input
      id={`f-${name}`}
      name={name}
      defaultValue={defaultValue ?? undefined}
      aria-invalid={!!err}
      aria-describedby={err ? `e-${name}` : undefined}
      className={clsx("input", err && "input-error", suffix && "pr-12", className)}
      {...rest}
    />
  );
  return (
    <FieldWrap name={name} label={label} hint={hint} required={required} className={wrapClassName}>
      {suffix ? (
        <div className="relative">
          {input}
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-stone-400">{suffix}</span>
        </div>
      ) : (
        input
      )}
    </FieldWrap>
  );
}

/** Campo numérico com teclado decimal no celular. */
export function NumberField(props: InputProps & { decimals?: boolean }) {
  const { decimals = true, ...rest } = props;
  return <Field type="text" inputMode={decimals ? "decimal" : "numeric"} autoComplete="off" {...rest} />;
}

export function SelectField({
  name, label, hint, options, defaultValue, placeholder = "Selecione…", required, wrapClassName, onChange, disabled,
}: {
  name: string; label?: React.ReactNode; hint?: React.ReactNode; options: Option[]; defaultValue?: string | null;
  placeholder?: string | false; required?: boolean; wrapClassName?: string; disabled?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}) {
  const { errors } = useFormCtx();
  const err = errors?.[name];
  return (
    <FieldWrap name={name} label={label} hint={hint} required={required} className={wrapClassName}>
      <select
        id={`f-${name}`}
        name={name}
        defaultValue={defaultValue ?? ""}
        aria-invalid={!!err}
        disabled={disabled}
        onChange={onChange}
        className={clsx("input", err && "input-error")}
      >
        {placeholder !== false && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </FieldWrap>
  );
}

export function TextArea({
  name, label, hint, defaultValue, rows = 3, required, wrapClassName, placeholder,
}: {
  name: string; label?: React.ReactNode; hint?: React.ReactNode; defaultValue?: string | null; rows?: number;
  required?: boolean; wrapClassName?: string; placeholder?: string;
}) {
  const { errors } = useFormCtx();
  const err = errors?.[name];
  return (
    <FieldWrap name={name} label={label} hint={hint} required={required} className={wrapClassName}>
      <textarea
        id={`f-${name}`}
        name={name}
        rows={rows}
        placeholder={placeholder}
        defaultValue={defaultValue ?? undefined}
        aria-invalid={!!err}
        className={clsx("input", err && "input-error")}
      />
    </FieldWrap>
  );
}

export function Checkbox({ name, label, defaultChecked, hint, value }: { name: string; label: React.ReactNode; defaultChecked?: boolean; hint?: string; value?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5 has-checked:border-brand-400 has-checked:bg-brand-50">
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="mt-0.5 size-5 shrink-0 accent-brand-600" />
      <span className="text-sm">
        <span className="font-medium text-stone-800">{label}</span>
        {hint && <span className="block text-xs text-stone-500">{hint}</span>}
      </span>
    </label>
  );
}

export function CheckboxGroup({ name, label, options, defaultValues = [], columns = 2 }: {
  name: string; label?: React.ReactNode; options: Option[]; defaultValues?: string[]; columns?: 1 | 2 | 3;
}) {
  const { errors } = useFormCtx();
  return (
    <fieldset>
      {label && <legend className="label">{label}</legend>}
      <div className={clsx("grid gap-2", columns >= 2 && "sm:grid-cols-2", columns === 3 && "lg:grid-cols-3")}>
        {options.map((o) => (
          <Checkbox key={o.value} name={name} value={o.value} label={o.label} defaultChecked={defaultValues.includes(o.value)} />
        ))}
      </div>
      {errors?.[name] && <p className="mt-1 text-xs font-medium text-red-600">{errors[name]}</p>}
    </fieldset>
  );
}

export function SubmitButton({ children = "Salvar", className, variant = "primary" }: { children?: React.ReactNode; className?: string; variant?: "primary" | "secondary" | "danger" }) {
  const { pending } = useFormCtx();
  return (
    <button type="submit" disabled={pending} className={clsx("btn", `btn-${variant}`, className)}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="card card-body">
      <h2 className="text-base font-semibold text-stone-900">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-stone-500">{description}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/** Barra de ações fixa no rodapé no celular (alcance do polegar). */
export function FormActions({ children, cancelHref }: { children?: React.ReactNode; cancelHref?: string }) {
  return (
    <div className="safe-bottom sticky bottom-[5.75rem] z-10 rounded-t-2xl -mx-4 flex gap-2 border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:backdrop-blur-none">
      {cancelHref && (
        <a href={cancelHref} className="btn btn-secondary flex-1 md:flex-none">Cancelar</a>
      )}
      {children ?? <SubmitButton className="flex-1 md:flex-none">Salvar</SubmitButton>}
    </div>
  );
}

/** Botão que executa uma server action (ex.: excluir, mudar status), com confirmação opcional. */
export function ActionButton({
  action,
  confirm: confirmText,
  children,
  className,
  variant = "secondary",
  size,
  redirectTo,
}: {
  action: () => Promise<ActionState>;
  confirm?: string;
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost" | "danger-ghost";
  size?: "sm";
  redirectTo?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        className={clsx("btn", `btn-${variant}`, size === "sm" && "btn-sm", className)}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          start(async () => {
            const r = await action();
            if (r && !r.ok) {
              setError(r.message ?? "Falha na operação.");
              window.alert(r.message ?? "Falha na operação.");
              return;
            }
            setError(null);
            if (redirectTo) router.push(redirectTo);
            else router.refresh();
          });
        }}
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        {children}
      </button>
      {error && <span className="sr-only" role="alert">{error}</span>}
    </>
  );
}
