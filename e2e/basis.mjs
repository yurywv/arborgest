// E2E: inspeções e avaliações de risco como base técnica da oportunidade e do orçamento (várias por registro),
// plano de intervenções (urgência e alcance) e precificação a partir do plano.
// Uso: node e2e/basis.mjs [baseUrl]   — requer seed carregado e servidor em execução.
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const base = process.argv[2] ?? "http://localhost:3000";
const db = new PrismaClient();
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok }); console.log(`${ok ? "✓" : "✗"} ${name}${extra ? ` — ${extra}` : ""}`); };
const browser = await chromium.launch();
const errors = [];

async function login(email) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${email}: ${e.message}`));
  page.on("response", (r) => r.status() >= 500 && errors.push(`${email}: HTTP ${r.status()} ${r.url()}`));
  page.on("dialog", (d) => d.accept());
  await page.goto(`${base}/login`);
  await page.getByLabel(/^E-mail/).fill(email);
  await page.getByLabel(/^Senha/).fill("Arbor@2026");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard");
  return page;
}
const ready = async (p) => { await p.waitForLoadState("networkidle"); await p.waitForTimeout(300); };

try {
  // Uma avaliação de risco alto/extremo e outros registros do mesmo cliente
  const start = await db.riskAssessment.findFirst({ where: { riskRating: { in: ["EXTREMO", "ALTO"] }, tree: { status: "ATIVA" } }, orderBy: { assessedAt: "desc" }, include: { tree: { include: { property: true } } } });
  const clientId = start.tree.property.clientId;
  const others = await db.inspection.findMany({ where: { tree: { property: { clientId } }, generalCondition: { in: ["RUIM", "REGULAR", "CRITICA"] } }, include: { tree: true }, take: 2, orderBy: { inspectedAt: "desc" } });

  const com = await login("comercial@arborgest.demo");

  // 1. Avaliação de risco → nova oportunidade (já com a base técnica)
  await com.goto(`${base}/riscos/${start.id}`); await ready(com);
  await com.getByRole("link", { name: "Nova oportunidade" }).click();
  await com.waitForURL(/\/oportunidades\/nova\?.*risco=/); await ready(com);
  check("nova oportunidade a partir da avaliação de risco", await com.getByText(/Base técnica: avaliação de risco/).isVisible());
  await com.locator("#f-description").fill(`Mitigação de risco — ${start.tree.code} (E2E)`);
  await com.getByRole("button", { name: "Salvar", exact: true }).click();
  await com.waitForURL(/\/oportunidades\/c[a-z0-9]+$/); await ready(com);
  const oppUrl = com.url();
  const linked = com.getByTestId("basis-linked");
  check("oportunidade nasce com a avaliação vinculada", (await linked.locator("li").count()) === 1 && (await linked.getByText(start.tree.code).count()) === 1);
  const plan = com.getByTestId("basis-plan");
  const firstGroup = await plan.locator("li").first().textContent();
  check("plano: urgência e alcance pela classificação de risco", start.riskRating === "EXTREMO" ? /Urgência urgente.*Remoção \/ supressão/.test(firstGroup) : /Urgência alta.*Poda/.test(firstGroup), firstGroup.slice(0, 60));

  // 2. Vincular várias inspeções à mesma oportunidade
  await com.getByText("Vincular inspeções / avaliações de risco").click();
  const picker = com.getByTestId("basis-picker");
  check("seletor começa sem nada marcado", (await picker.locator("input:checked").count()) === 0);
  for (const i of others) await picker.locator("li", { hasText: i.tree.code }).filter({ hasText: "Inspeção" }).first().locator("input").check();
  await com.getByRole("button", { name: "Vincular selecionados" }).click();
  await com.getByText(/Vinculado: \d+ inspeção/).waitFor(); await ready(com);
  check("várias inspeções/avaliações na mesma oportunidade", (await linked.locator("li").count()) === 1 + others.length, `${1 + others.length} registros`);

  // 3. Orçamento a partir da oportunidade herda a base técnica
  await com.goto(`${base}/precificacao/novo?oportunidade=${oppUrl.split("/").pop()}`); await ready(com);
  await com.getByLabel(/^Título/).fill("E2E — base técnica");
  await com.getByRole("button", { name: "Salvar", exact: true }).click();
  await com.waitForURL(/\/precificacao\/c[a-z0-9]+$/); await ready(com);
  const estUrl = com.url();
  await com.goto(`${estUrl}?aba=base`); await ready(com);
  check("orçamento herda as inspeções/avaliações da oportunidade", (await com.getByTestId("basis-linked").locator("li").count()) === 1 + others.length);

  // 4. Precificar um grupo do plano: serviço, árvores e urgência já selecionados
  const g = com.getByTestId("basis-plan").locator("li").first();
  const groupText = await g.textContent();
  const nTrees = Number(groupText.match(/· (\d+) árvore/)[1]);
  const urg = { urgente: "URGENTE", alta: "ALTA", "média": "MEDIA", baixa: "BAIXA" }[groupText.match(/Urgência (\S+?)(Remoção|Poda|Tratamento)/)[1]];
  await g.getByRole("link", { name: "Precificar" }).click();
  await com.waitForURL(/\/item\?servico=/); await ready(com);
  const svc = await com.locator("#svc").inputValue();
  check("item abre com o serviço do plano", ["SUPRESSAO", "PODA", "FITOSSANIDADE"].includes(svc), svc);
  check("árvores do grupo já selecionadas", Number(await com.getByTestId("arvores-selecionadas").textContent()) === nTrees, `${nTrees}`);
  const shownUrg = await com.locator("#sim-urgency").inputValue();
  check("urgência do plano aplicada ao item", shownUrg === urg, `${urg} / tela: ${shownUrg} / ${com.url().split("?")[1]}`);
  check("demais campos continuam em branco", (await com.locator("#sim-distanceKm").inputValue()) === "");
  await com.locator("#sim-distanceKm").fill("30");
  await com.locator("#sim-toll").fill("0");
  await com.locator("#sim-auxiliaries").fill("2");
  if (svc !== "FITOSSANIDADE") {
    await com.getByRole("radio", { name: /^Média/ }).click();
    await com.locator("#sim-serviceType").selectOption({ index: 1 });
    await com.locator("#sim-fuelLiters").fill("10");
    await com.locator("#sim-supervision-nao").check();
  } else {
    await com.locator("#sim-days").fill("1"); await com.locator("#sim-technicians").fill("1");
  }
  await com.getByTestId("preco-final").waitFor();
  await com.getByRole("button", { name: "Adicionar à proposta" }).click();
  await com.waitForURL(estUrl); await ready(com);
  check("item precificado com as árvores do plano", await com.getByText(new RegExp(`${nTrees} árvores? selecionadas`)).first().isVisible());
  const item = await db.pricingEstimateItem.findFirst({ where: { estimateId: estUrl.split("/").pop() }, orderBy: { createdAt: "desc" } });
  check("urgência gravada nas entradas do item", item?.inputs?.urgency === urg);

  // 5. Desvincular e auditoria
  await com.goto(`${estUrl}?aba=base`); await ready(com);
  const before = await com.getByTestId("basis-linked").locator("li").count();
  await com.getByTestId("basis-linked").locator("li").last().getByRole("button", { name: "Desvincular" }).click();
  await com.waitForTimeout(1500); await com.reload(); await ready(com);
  check("desvincular registro", (await com.getByTestId("basis-linked").locator("li").count()) === before - 1);
  const logs = await db.pricingAuditLog.count({ where: { estimateId: estUrl.split("/").pop(), action: "BASE_TECNICA" } });
  check("vínculos registrados na auditoria da precificação", logs >= 2, `${logs} registros`);

  // 6. Parâmetro de acréscimo por urgência disponível
  const adm = await login("admin@arborgest.demo");
  await adm.goto(`${base}/admin/precificacao`); await ready(adm);
  check("parâmetro de acréscimo por urgência na administração", await adm.getByText("Acréscimo por urgência — urgente").isVisible());
} catch (e) {
  check("execução sem exceções", false, String(e).slice(0, 500));
}
check("sem erros JavaScript/HTTP 5xx", errors.length === 0, errors.slice(0, 5).join(" | "));
await db.$disconnect();
await browser.close();
const ok = results.filter((r) => r.ok).length;
console.log(`\n${ok}/${results.length} verificações OK`);
process.exit(ok === results.length ? 0 : 1);
