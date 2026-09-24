import { NextResponse } from "next/server";
import { generateNotifications } from "@/lib/notifications";
import { expireEstimates } from "@/lib/pricing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Chamado pelo Vercel Cron (vercel.json) ou por um cron externo com Authorization: Bearer CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const r = await generateNotifications();
  const expiredEstimates = await expireEstimates();
  return NextResponse.json({ ok: true, ...r, expiredEstimates });
}
