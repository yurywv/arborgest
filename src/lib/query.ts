// Helpers para searchParams de listagens.
export type SP = Record<string, string | string[] | undefined>;

export function spGet(sp: SP, key: string): string | undefined {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim().slice(0, 100) : undefined;
}

export function spFlat(sp: SP): Record<string, string | undefined> {
  return Object.fromEntries(Object.keys(sp).map((k) => [k, spGet(sp, k)]));
}

export function pageOf(sp: SP, pageSize = 20) {
  const page = Math.max(1, Number(spGet(sp, "page") ?? 1) || 1);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });
