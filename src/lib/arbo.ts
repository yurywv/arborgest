// Regras técnicas de arboricultura (funções puras, usadas no cliente e no servidor).

/** DAP (cm) a partir do CAP (cm): DAP = CAP / π */
export function dapFromCap(cap: number): number {
  return round(cap / Math.PI, 1);
}

/** DAP equivalente para árvores multifuste: √(Σ dᵢ²) */
export function equivalentDap(daps: number[]): number | null {
  const valid = daps.filter((d) => d > 0);
  if (!valid.length) return null;
  return round(Math.sqrt(valid.reduce((s, d) => s + d * d, 0)), 1);
}

/** Área aproximada da copa (m²) como elipse: π · (NS/2) · (LO/2) */
export function crownArea(ns?: number | null, ew?: number | null): number | null {
  if (!ns || !ew) return null;
  return round(Math.PI * (ns / 2) * (ew / 2), 1);
}

export function round(n: number, digits = 1) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

// ── Matriz ISA TRAQ ──
const FAILURE = ["IMPROVAVEL", "POSSIVEL", "PROVAVEL", "IMINENTE"] as const;
const IMPACT = ["MUITO_BAIXA", "BAIXA", "MEDIA", "ALTA"] as const;
const CONSEQ = ["DESPREZIVEL", "MENOR", "SIGNIFICATIVA", "SEVERA"] as const;

// Matriz 1: probabilidade de falha × probabilidade de impacto → probabilidade combinada
// 0 = improvável, 1 = pouco provável, 2 = provável, 3 = muito provável
const MATRIX1: number[][] = [
  /* IMPROVAVEL */ [0, 0, 0, 0],
  /* POSSIVEL   */ [0, 0, 0, 1],
  /* PROVAVEL   */ [0, 0, 1, 2],
  /* IMINENTE   */ [0, 1, 2, 3],
];

// Matriz 2: probabilidade combinada × consequência → classificação de risco
const MATRIX2: ("BAIXO" | "MODERADO" | "ALTO" | "EXTREMO")[][] = [
  /* improvável     */ ["BAIXO", "BAIXO", "BAIXO", "BAIXO"],
  /* pouco provável */ ["BAIXO", "BAIXO", "MODERADO", "MODERADO"],
  /* provável       */ ["BAIXO", "MODERADO", "ALTO", "ALTO"],
  /* muito provável */ ["BAIXO", "MODERADO", "ALTO", "EXTREMO"],
];

export const COMBINED_LIKELIHOOD = ["Improvável", "Pouco provável", "Provável", "Muito provável"];

export function combinedLikelihood(failure: string, impact: string): number | null {
  const f = FAILURE.indexOf(failure as never);
  const i = IMPACT.indexOf(impact as never);
  if (f < 0 || i < 0) return null;
  return MATRIX1[f][i];
}

export function computeRisk(failure: string, impact: string, consequence: string) {
  const l = combinedLikelihood(failure, impact);
  const c = CONSEQ.indexOf(consequence as never);
  if (l === null || c < 0) return null;
  return MATRIX2[l][c];
}

export const RISK_ORDER = { BAIXO: 1, MODERADO: 2, ALTO: 3, EXTREMO: 4 } as const;
export const CONDITION_ORDER = { OTIMA: 1, BOA: 2, REGULAR: 3, RUIM: 4, CRITICA: 5 } as const;

// ── Links de navegação ──
export function navLinks(lat: number, lng: number, label = "Árvore") {
  const q = `${lat},${lng}`;
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${q}`,
    googleDirections: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
    apple: `https://maps.apple.com/?ll=${q}&q=${encodeURIComponent(label)}`,
    waze: `https://waze.com/ul?ll=${q}&navigate=yes`,
    osm: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=19/${lat}/${lng}`,
  };
}
