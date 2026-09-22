const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

type DateLike = Date | string | null | undefined;

export const fmtDate = (d: DateLike) => (d ? dateFmt.format(new Date(d)) : "—");
export const fmtDateTime = (d: DateLike) => (d ? dateTimeFmt.format(new Date(d)) : "—");
export const fmtMoney = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : brl.format(Number(v)));
export const fmtNum = (v: number | null | undefined, unit = "") =>
  v === null || v === undefined ? "—" : `${num.format(v)}${unit ? ` ${unit}` : ""}`;

/** Converte Decimal do Prisma (ou qualquer valor) em number | null. */
export const toNum = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** yyyy-mm-dd para inputs type=date (fuso de São Paulo). */
export function toInputDate(d: DateLike): string {
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(d));
  return parts;
}

export function formatDocument(doc?: string | null) {
  if (!doc) return "—";
  const d = doc.replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc;
}

export function daysFromNow(d: DateLike) {
  if (!d) return null;
  return Math.round((new Date(d).getTime() - Date.now()) / 86_400_000);
}

export function whatsappLink(phone?: string | null) {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.length <= 11) d = `55${d}`;
  return `https://wa.me/${d}`;
}
