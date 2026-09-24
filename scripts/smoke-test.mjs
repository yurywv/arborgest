// Teste de fumaça: acessa todas as rotas com cada perfil e verifica status/permissões.
// Uso: node scripts/smoke-test.mjs [baseUrl]   (requer servidor rodando e seed carregado)
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import fs from "node:fs";

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^(\w+)="?(.*?)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const base = process.argv[2] ?? "http://localhost:3000";
const db = new PrismaClient();
const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
const token = (u) => new SignJWT({ sv: u.sessionVersion }).setProtectedHeader({ alg: "HS256" }).setSubject(u.id).setIssuedAt().setExpirationTime("1h").sign(secret);

const tree = await db.tree.findFirst({ where: { inspections: { some: {} } }, orderBy: { code: "asc" } });
const [client, property, sector, contract, insp, risk, interv, wo, species, team, role, user, contact, opp] = await Promise.all([
  db.client.findFirst(), db.property.findFirst(), db.sector.findFirst(), db.contract.findFirst(), db.inspection.findFirst(),
  db.riskAssessment.findFirst(), db.intervention.findFirst(), db.workOrder.findFirst(), db.species.findFirst(), db.team.findFirst(),
  db.role.findFirst(), db.user.findFirst(), db.contact.findFirst(), db.opportunity.findFirst(),
]);
const est = await db.pricingEstimate.findFirst({ where: { proposals: { some: {} } }, include: { items: { take: 1 }, proposals: { take: 1 } } });
const calc = await db.pricingCalculation.findFirst();
const draft = await db.pricingEstimate.findFirst({ where: { status: { in: ["RASCUNHO", "EM_ELABORACAO", "EM_APROVACAO_INTERNA"] } }, include: { items: { take: 1 } } });

const pages = [
  "/dashboard", "/clientes", "/clientes/novo", `/clientes/${client.id}`, `/clientes/${client.id}?aba=propriedades`, `/clientes/${client.id}?aba=documentos`, `/clientes/${client.id}/editar`,
  "/contatos", "/contatos/novo", `/contatos/${contact.id}/editar`, "/oportunidades", "/oportunidades/nova", `/oportunidades/${opp.id}/editar`,
  "/contratos", "/contratos/novo", `/contratos/${contract.id}`, `/contratos/${contract.id}/editar`,
  "/propriedades", "/propriedades/nova", `/propriedades/${property.id}`, `/propriedades/${property.id}?aba=setores`, `/propriedades/${property.id}?aba=arvores`, `/propriedades/${property.id}/editar`, `/propriedades/${property.id}/setores/${sector.id}`,
  "/arvores", "/arvores?inspecao=vencida", "/arvores?pendente=sim&risco=ALTO", "/arvores/novo", "/arvores/etiquetas", `/arvores/${tree.code}`,
  ...["localizacao", "botanica", "biometria", "raizes", "tronco", "copa", "fitossanidade", "riscos", "inspecoes", "intervencoes", "fotos", "documentos", "historico"].map((a) => `/arvores/${tree.code}?aba=${a}`),
  `/arvores/${tree.id}`, `/arvores/${tree.code}/editar`, `/arvores/${tree.code}/medicao`, `/arvores/${tree.code}/localizacao`, `/arvores/${tree.code}/qrcode`,
  "/mapa", `/mapa?focus=${tree.code}`, "/escanear", "/especies", "/especies/nova", `/especies/${species.id}`,
  "/inspecoes", "/inspecoes/nova", `/inspecoes/nova?arvore=${tree.code}`, `/inspecoes/${insp.id}`, `/inspecoes/${insp.id}/editar`,
  "/riscos", "/riscos/nova", `/riscos/${risk.id}`, `/riscos/${risk.id}/editar`,
  "/intervencoes", "/intervencoes?pendentes=1", "/intervencoes/nova", `/intervencoes/${interv.id}`, `/intervencoes/${interv.id}/editar`,
  "/ordens-servico", "/ordens-servico/nova", `/ordens-servico/nova?arvore=${tree.code}`, `/ordens-servico/${wo.id}`, `/ordens-servico/${wo.id}/editar`,
  "/agenda", "/relatorios", ...["por-cliente", "por-propriedade", "por-especie", "fitossanidade", "risco", "inspecoes-vencidas", "intervencoes", "ordens-servico", "fotografico"].map((t) => `/relatorios?tipo=${t}`),
  `/relatorios?tipo=historico&arvore=${tree.code}`, "/busca?q=ipe", `/busca?q=${tree.code}`, "/notificacoes", "/perfil",
  "/admin/usuarios", "/admin/usuarios/novo", `/admin/usuarios/${user.id}`, "/admin/equipes", "/admin/equipes/nova", `/admin/equipes/${team.id}`,
  "/admin/perfis", "/admin/perfis/novo", `/admin/perfis/${role.id}`, "/admin/configuracoes",
  "/precificacao", "/precificacao?pendentes=1", "/precificacao/novo", `/precificacao/novo?oportunidade=${opp.id}`, `/precificacao/novo?propriedade=${property.id}`,
  "/precificacao/simulador", `/precificacao/${est.id}`, ...["proposta", "historico", "dados"].map((a) => `/precificacao/${est.id}?aba=${a}`),
  `/precificacao/${draft.id}/item`, `/precificacao/${draft.id}/item?item=${draft.items[0].id}`, `/precificacao/${draft.id}?aba=dados`, `/precificacao/calculos/${calc.id}`,
  `/clientes/${est.clientId}?aba=orcamentos`, "/admin/precificacao", ...["versoes", "compensacao", "textos", "servicos"].map((a) => `/admin/precificacao?aba=${a}`),
  "/admin/precificacao/validacao", `/api/propostas/${est.proposals[0].id}/pdf`, "/busca?q=2026-0000",
  "/api/health", `/api/qrcode/${tree.code}`, `/api/qrcode/${tree.code}?format=png`,
  ...["inventario", "fotografico", "risco"].flatMap((t) => ["csv", "xlsx", "pdf"].map((f) => `/api/relatorios/${t}?format=${f}`)),
];

let failures = 0;
async function hit(path, cookie) {
  const res = await fetch(base + path, { headers: cookie ? { cookie: `arbor_session=${cookie}` } : {}, redirect: "manual" });
  const body = res.headers.get("content-type")?.includes("text/html") ? await res.text() : "";
  const loc = res.headers.get("location") ?? "";
  const err = /Application error|Unhandled Runtime Error|Internal Server Error/.test(body);
  // Com streaming (loading.tsx) o Next envia redirect embutido no HTML em vez de 307.
  const embedded = body.match(/NEXT_REDIRECT;(?:replace|push);([^;]+);/)?.[1] ?? "";
  return { status: res.status, loc: loc || embedded, err, redirected: res.status === 307 || !!embedded };
}

// 1) Administrador: todas as rotas devem responder 200 sem erro
const admin = await db.user.findUnique({ where: { email: "admin@arborgest.demo" } });
const at = await token(admin);
for (const p of pages) {
  const r = await hit(p, at);
  const expectRedirect = p.startsWith("/busca?q=ARB-");
  const ok = expectRedirect ? r.loc.includes(`/arvores/${tree.code}`) : r.status === 200 && !r.err && !r.redirected;
  if (!ok) { failures++; console.log(`✗ ADMIN ${p} → ${r.status} ${r.loc}${r.err ? " [erro na página]" : ""}`); }
}
console.log(`ADMIN: ${pages.length} rotas verificadas`);

// Exportações: assinatura binária dos arquivos
for (const [fmt, sig] of [["pdf", "%PDF"], ["xlsx", "PK"], ["csv", "\uFEFF"]]) {
  const res = await fetch(`${base}/api/relatorios/inventario?format=${fmt}`, { headers: { cookie: `arbor_session=${at}` } });
  const buf = Buffer.from(await res.arrayBuffer());
  const head = fmt === "csv" ? buf.toString("utf8").slice(0, 1) : buf.subarray(0, sig.length).toString();
  if (head !== (fmt === "csv" ? "\uFEFF" : sig) || buf.length < 200) { failures++; console.log(`✗ exportação ${fmt} inválida (${buf.length} bytes)`); }
}
console.log("EXPORTAÇÕES: PDF/XLSX/CSV verificados");

// 2) Sem sessão: páginas redirecionam ao login, APIs devolvem 401
for (const p of ["/dashboard", "/arvores", "/api/uploads", `/api/qrcode/${tree.code}`, "/api/relatorios/inventario"]) {
  const r = await hit(p);
  const ok = p.startsWith("/api/") ? r.status === 401 : r.status === 307 && r.loc.includes("/login");
  if (!ok) { failures++; console.log(`✗ ANÔNIMO ${p} → ${r.status} ${r.loc}`); }
}
console.log("ANÔNIMO: bloqueios verificados");

// 3) Permissões por perfil
const expectations = {
  "consulta@arborgest.demo": { allow: ["/dashboard", "/arvores", `/arvores/${tree.code}`, "/mapa", "/relatorios"], deny: ["/arvores/novo", "/clientes/novo", "/admin/usuarios", "/admin/perfis", "/inspecoes/nova", "/admin/configuracoes", "/precificacao/novo", "/admin/precificacao"], apiDeny: ["/api/relatorios/inventario?format=csv"] },
  "tecnico@arborgest.demo": { allow: ["/arvores/novo", "/inspecoes/nova", "/riscos/nova", "/intervencoes/nova", "/precificacao/novo", "/precificacao/simulador"], deny: ["/clientes/novo", "/contratos/novo", "/admin/usuarios", "/admin/perfis", "/admin/precificacao"] },
  "comercial@arborgest.demo": { allow: ["/clientes/novo", "/oportunidades/nova", "/contratos/novo", "/precificacao", "/precificacao/novo"], deny: ["/inspecoes/nova", "/arvores/novo", "/admin/perfis", "/admin/precificacao"] },
  "operacional@arborgest.demo": { allow: ["/ordens-servico/nova", "/intervencoes/nova"], deny: ["/oportunidades", "/contratos", "/arvores/novo", "/admin/usuarios", "/precificacao"], apiDeny: [`/api/propostas/${est.proposals[0].id}/pdf`] },
  "gestor@arborgest.demo": { allow: ["/admin/usuarios", "/arvores/novo", "/contratos/novo", "/precificacao/novo"], deny: ["/admin/perfis", "/admin/configuracoes", "/admin/usuarios/novo", "/admin/precificacao"] },
};
for (const [email, e] of Object.entries(expectations)) {
  const u = await db.user.findUnique({ where: { email } });
  const t = await token(u);
  for (const p of e.allow) { const r = await hit(p, t); if (r.status !== 200 || r.err || r.redirected) { failures++; console.log(`✗ ${email} deveria acessar ${p} → ${r.status} ${r.loc}`); } }
  for (const p of e.deny) { const r = await hit(p, t); if (!(r.redirected && r.loc.includes("/sem-permissao"))) { failures++; console.log(`✗ ${email} NÃO deveria acessar ${p} → ${r.status} ${r.loc}`); } }
  for (const p of e.apiDeny ?? []) { const r = await hit(p, t); if (r.status !== 403) { failures++; console.log(`✗ ${email} API ${p} → ${r.status}`); } }
}
console.log("PERFIS: permissões verificadas");

// 4) Sessão inválida após desativação (sessionVersion)
const stale = await new SignJWT({ sv: admin.sessionVersion - 1 }).setProtectedHeader({ alg: "HS256" }).setSubject(admin.id).setExpirationTime("1h").sign(secret);
const rs = await hit("/dashboard", stale);
if (!(rs.redirected && rs.loc.includes("/login"))) { failures++; console.log(`✗ sessão com versão antiga não foi rejeitada → ${rs.status}`); }

await db.$disconnect();
console.log(failures ? `\n${failures} FALHA(S)` : "\n✓ Todos os testes de fumaça passaram");
process.exit(failures ? 1 : 0);
