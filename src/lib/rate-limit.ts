// Limitador simples em memória (por instância). Suficiente para frear força bruta no login
// em uma pequena empresa; para múltiplas instâncias use Redis/Upstash (ver README).
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const cur = hits.get(key);
  if (!cur || cur.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  cur.count++;
  if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
  return { ok: cur.count <= limit, remaining: Math.max(0, limit - cur.count) };
}

/** Consulta sem incrementar (usado para bloquear antes de validar a senha). */
export function isLimited(key: string, limit: number) {
  const cur = hits.get(key);
  return !!cur && cur.resetAt > Date.now() && cur.count >= limit;
}

export function resetLimit(key: string) {
  hits.delete(key);
}
