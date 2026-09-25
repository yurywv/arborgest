import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { EngineError } from "@/lib/pricing/engine";
import { isServiceCode } from "@/lib/pricing/registry";
import { getActiveVersion, getVersion, pricingAudit, serverCalculate } from "@/lib/pricing/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const body = z.object({ service: z.string(), inputs: z.record(z.string(), z.unknown()), parameterVersionId: z.string().max(40).optional() });

/**
 * POST /api/precificacao/calcular — cálculo no servidor (mesmo motor usado ao salvar).
 * Corpo: { service: "INVENTARIO" | "SUPRESSAO" | "PODA", inputs: {...}, parameterVersionId?: string }
 * Sem a permissão "pricing:costs" a resposta traz apenas quantidades e preços (sem custos/margem).
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!hasPermission(user.permissions, "pricing:read")) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isServiceCode(parsed.data.service)) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    const version = parsed.data.parameterVersionId ? await getVersion(parsed.data.parameterVersionId) : await getActiveVersion();
    const { inputs, result } = serverCalculate(version, parsed.data.service, parsed.data.inputs);
    await pricingAudit(db, user.id, "CALCULO_API", "PricingCalculation", null, {
      field: `${parsed.data.service} · parâmetros v${version.label}`, newValue: { entradas: inputs, preco: result.finalPriceRounded },
    });
    const full = hasPermission(user.permissions, "pricing:costs");
    return NextResponse.json({
      parameterVersion: version.label,
      inputs,
      result: full ? result : {
        service: result.service, days: result.days, technicians: result.technicians, auxiliaries: result.auxiliaries, persons: result.persons,
        finalPrice: result.finalPriceRounded, unitPrice: result.unitPriceRounded, warnings: result.warnings,
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Entradas inválidas.", issues: e.issues }, { status: 422 });
    if (e instanceof EngineError) return NextResponse.json({ error: e.message }, { status: 422 });
    if ((e as { code?: string }).code === "P2025") return NextResponse.json({ error: "Versão de parâmetros inexistente." }, { status: 404 });
    throw e;
  }
}
