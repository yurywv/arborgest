import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { redirect, unstable_rethrow } from "next/navigation";
import { ForbiddenError } from "./auth/session";
import type { ActionState } from "./action-state";
import { EngineError } from "./pricing/engine";

export class UserError extends Error {}

/** Executa uma server action convertendo erros conhecidos em mensagens amigáveis. */
export async function runAction(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    const r = await fn();
    return { ok: true, ...(r ?? {}), ts: Date.now() };
  } catch (e) {
    unstable_rethrow(e); // redirect()/notFound() precisam propagar
    if (e instanceof z.ZodError) {
      const errors: Record<string, string> = {};
      for (const issue of e.issues) {
        const k = issue.path.join(".") || "_";
        errors[k] ??= issue.message;
      }
      return { ok: false, message: "Verifique os campos destacados.", errors, ts: Date.now() };
    }
    if (e instanceof ForbiddenError || e instanceof UserError || e instanceof EngineError) {
      return { ok: false, message: e.message, ts: Date.now() };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        const target = (e.meta?.target as string[] | undefined)?.join(", ");
        return { ok: false, message: `Já existe um registro com este valor${target ? ` (${target})` : ""}.`, ts: Date.now() };
      }
      if (e.code === "P2003" || e.code === "P2014") {
        return { ok: false, message: "Este registro possui vínculos e não pode ser excluído.", ts: Date.now() };
      }
      if (e.code === "P2025") return { ok: false, message: "Registro não encontrado.", ts: Date.now() };
    }
    console.error("[action] erro inesperado", e);
    return { ok: false, message: "Erro inesperado. Tente novamente.", ts: Date.now() };
  }
}

// ───────────── Helpers de validação para FormData ─────────────

const clean = (v: unknown) => {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  return v;
};

/** Texto opcional: "" → null. Remove caracteres de controle. */
export const optStr = (max = 500) =>
  z.preprocess(
    (v) => {
      const c = clean(v);
      return typeof c === "string" ? c.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "") : c;
    },
    z.string().max(max, `Máximo de ${max} caracteres.`).nullable(),
  );

export const reqStr = (label = "Campo", max = 500) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "") : ""),
    z.string().min(1, `${label} é obrigatório.`).max(max, `Máximo de ${max} caracteres.`),
  );

const toNumber = (v: unknown) => {
  const c = clean(v);
  if (c === null) return null;
  if (typeof c === "number") return c;
  const s = String(c).replace(/\s/g, "");
  // aceita "1.234,56" e "1234.56"
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
};

export const optNum = (opts: { min?: number; max?: number } = {}) =>
  z.preprocess(
    toNumber,
    z
      .number({ error: "Número inválido." })
      .min(opts.min ?? -Infinity, `Valor mínimo: ${opts.min}.`)
      .max(opts.max ?? Infinity, `Valor máximo: ${opts.max}.`)
      .nullable(),
  );

export const optInt = (opts: { min?: number; max?: number } = {}) =>
  z.preprocess(
    toNumber,
    z
      .number({ error: "Número inválido." })
      .int("Use um número inteiro.")
      .min(opts.min ?? -Infinity, `Valor mínimo: ${opts.min}.`)
      .max(opts.max ?? Infinity, `Valor máximo: ${opts.max}.`)
      .nullable(),
  );

/** Datas de input type=date (yyyy-mm-dd) → meio-dia em Brasília para evitar deslocamento de fuso. */
const toDate = (v: unknown) => {
  const c = clean(v);
  if (c === null) return null;
  if (c instanceof Date) return c;
  const s = String(c);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00-03:00`);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) return new Date(`${s}-03:00`);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
};

export const optDate = () => z.preprocess(toDate, z.date({ error: "Data inválida." }).nullable());
export const reqDate = (label = "Data") =>
  z.preprocess(toDate, z.date({ error: `${label} é obrigatória.` }));

export const bool = () => z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const optEnum = <T extends string>(values: readonly T[]) =>
  z.preprocess(clean, z.enum(values as [T, ...T[]], { error: "Opção inválida." }).nullable());

export const reqEnum = <T extends string>(values: readonly T[], label = "Campo") =>
  z.preprocess(clean, z.enum(values as [T, ...T[]], { error: `${label}: selecione uma opção.` }));

export const optId = () => z.preprocess(clean, z.string().max(40).nullable());

export const optEmail = () =>
  z.preprocess((v) => {
    const c = clean(v);
    return typeof c === "string" ? c.toLowerCase() : c;
  }, z.email("E-mail inválido.").nullable());

export const optUrl = () =>
  z.preprocess((v) => {
    const c = clean(v);
    if (typeof c === "string" && !/^https?:\/\//i.test(c)) return `https://${c}`;
    return c;
  }, z.url("URL inválida.").nullable());

/** Converte FormData em objeto; chaves em `arrays` usam getAll(). */
export function formObject(fd: FormData, arrays: string[] = []) {
  const o: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$ACTION")) continue;
    o[key] = arrays.includes(key) ? fd.getAll(key).map(String).filter(Boolean) : fd.get(key);
  }
  for (const k of arrays) o[k] ??= [];
  return o;
}

/** Valores de um enum do Prisma como tupla para z.enum(). */
export const enumVals = <T extends Record<string, string>>(e: T) => Object.values(e) as [T[keyof T], ...T[keyof T][]];

export const keysOf = (o: Record<string, string> | { value: string }[]) =>
  (Array.isArray(o) ? o.map((x) => x.value) : Object.keys(o)) as [string, ...string[]];

/** Valida CPF/CNPJ (dígitos verificadores). */
export function validCpfCnpj(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) {
    if (/^(\d)\1+$/.test(d)) return false;
    const calc = (len: number) => {
      let s = 0;
      for (let i = 0; i < len; i++) s += Number(d[i]) * (len + 1 - i);
      const r = (s * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
  }
  if (d.length === 14) {
    if (/^(\d)\1+$/.test(d)) return false;
    const calc = (len: number) => {
      const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const s = w.reduce((acc, wi, i) => acc + Number(d[i]) * wi, 0);
      const r = s % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
  }
  return false;
}

/** Retorno de erro de validação para um único campo. */
export const fieldError = (field: string, message: string): ActionState => ({
  ok: false,
  errors: { [field]: message },
  message: "Verifique os campos destacados.",
});

/** Após sucesso, redireciona pelo servidor (resposta única da action, sem corrida no router cliente). */
export function finish(res: ActionState, to: string): ActionState {
  if (res?.ok) redirect(to);
  return res;
}
