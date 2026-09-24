/* Informações do cálculo que devem constar na proposta ao cliente (sem valores internos). */
import type { CalcResult } from "./types";

export function proposalExtras(r: CalcResult | null | undefined, inputs?: Record<string, unknown>): string[] {
  if (!r) return [];
  const d = r.details ?? {};
  const out: string[] = [];
  if (r.service === "SUPRESSAO" && inputs?.compensation && Number(d.seedlings) > 0) {
    const where = d.compensationCity ? ` em ${d.compensationCity}` : "";
    out.push(`Compensação ambiental: plantio de ${Number(d.seedlings).toLocaleString("pt-BR")} muda(s)${where}${d.compensationLaw ? `, conforme ${d.compensationLaw}` : ""}.`);
  }
  if (inputs?.supervision && Number(d.supervisionDays) > 0) out.push("Inclui acompanhamento técnico durante a execução.");
  if (inputs?.cacamba && Number(d.cacambaQty) > 0) out.push(`Destinação de resíduos: ${d.cacambaQty} caçamba(s).`);
  return out;
}
