import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/jwt";

const PUBLIC_PREFIXES = ["/login", "/esqueci-senha", "/redefinir-senha", "/api/health", "/api/cron/", "/offline.html", "/sw.js", "/manifest.webmanifest", "/icons/"];

/**
 * Primeira barreira: exige sessão válida (assinatura + expiração) em todas as rotas privadas.
 * A verificação completa (usuário ativo, versão da sessão, permissões) acontece no servidor
 * em cada página/ação via lib/auth/session.ts.
 */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|jpeg|webp|ico|txt)$).*)"],
};
