import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getObject, signedUrl } from "@/lib/storage";

export const runtime = "nodejs";

/** Entrega arquivos privados somente para usuários autenticados com permissão de leitura. */
export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!hasPermission(user.permissions, "files:read")) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const key = (await params).key.map(decodeURIComponent).join("/");
  const photo = await db.photo.findUnique({ where: { storageKey: key } });
  const doc = photo ? null : await db.document.findUnique({ where: { storageKey: key } });
  const meta = photo ? { mime: photo.mimeType, name: `${photo.id}.jpg` } : doc ? { mime: doc.mimeType, name: doc.fileName } : null;
  if (!meta) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });

  const remote = await signedUrl(key, meta.name);
  if (remote) return NextResponse.redirect(remote, 302);

  const buf = await getObject(key);
  if (!buf) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
  const inline = meta.mime.startsWith("image/") || meta.mime === "application/pdf";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": meta.mime,
      "Content-Length": String(buf.length),
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
