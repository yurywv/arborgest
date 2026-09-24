// E2E do módulo de Precificação: CRM → propriedade → oportunidade → orçamento → itens (com árvores) →
// ajustes/desconto → aprovação por alçada → proposta/PDF → envio → aceite → contrato/OS; permissões e versões.
// Uso: node e2e/pricing.mjs [baseUrl]   — requer seed carregado e servidor em execução.
import { chromium, devices } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok }); console.log(`${ok ? "✓" : "✗"} ${name}${extra ? ` — ${extra}` : ""}`); };
const brl = (s) => Number(String(s).replace(/[^\d,-]/g, "").replace(",", "."));
const browser = await chromium.launch();
const errors = [];

async function login(email, viewport = { width: 1366, height: 900 }, extra = {}) {
  const ctx = await browser.newContext({ viewport, locale: "pt-BR", ...extra });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${email}: ${e.message}`));
  page.on("response", (r) => r.status() >= 500 && errors.push(`${email}: HTTP ${r.status()} ${r.url()}`));
  page.on("dialog", (d) => d.accept(d.type() === "prompt" ? "Validação automatizada do fluxo de precificação" : undefined));
  await page.goto(`${base}/login`);
  await page.getByLabel(/^E-mail/).fill(email);
  await page.getByLabel(/^Senha/).fill("Arbor@2026");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard");
  return page;
}
const ready = async (p) => { await p.waitForLoadState("networkidle"); await p.waitForTimeout(300); };
const priceOnScreen = async (p) => brl(await p.getByTestId("preco-final").textContent());
const totalOnScreen = async (p) => brl(await p.getByTestId("total-proposta").textContent());

try {
  const com = await login("comercial@arborgest.demo");

  // 1. Oportunidade → Precificar → novo orçamento (cliente vem da oportunidade; escolhe a propriedade)
  await com.goto(`${base}/oportunidades`); await ready(com);
  const card = com.locator("li", { hasText: "Visita técnica — área verde 3" });
  await card.getByRole("link", { name: "Precificar" }).click();
  await com.waitForURL(/\/precificacao\/novo\?oportunidade=/); await ready(com);
  check("orçamento nasce da oportunidade com cliente preenchido", (await com.locator("#f-clientId option:checked").textContent())?.includes("Vale Verde") ?? false);
  await com.locator("#f-propertyId").selectOption({ label: "Planta Hortolândia" });
  await com.getByLabel(/^Título/).fill("E2E — manejo área verde");
  await com.getByRole("button", { name: "Salvar", exact: true }).click();
  await com.waitForURL(/\/precificacao\/c[a-z0-9]+$/); await ready(com);
  const estUrl = com.url();
  check("orçamento criado (rascunho)", (await com.getByText("Rascunho").first().isVisible()));

  // 2. Item de inventário: simulação em tempo real = cálculo do servidor
  await com.getByRole("link", { name: "Adicionar serviço" }).first().click();
  await com.waitForURL(/\/item/); await ready(com);
  await com.locator("#sim-trees").fill("200");
  await com.locator("#sim-distanceKm").fill("40");
  await com.locator("#sim-auxiliaries").fill("2");
  const clientPrice = await priceOnScreen(com);
  const api = await com.request.post(`${base}/api/precificacao/calcular`, { data: { service: "INVENTARIO", inputs: { trees: 200, distanceKm: 40, difficulty: 2, auxiliaries: 2, lodging: false, toll: 0 } } });
  const serverPrice = Number((await api.json()).result.finalPriceRounded);
  check("simulador (navegador) = cálculo do servidor", Math.abs(clientPrice - serverPrice) < 0.005, `R$ ${clientPrice} × R$ ${serverPrice}`);
  await com.getByRole("button", { name: "Ver memória de cálculo" }).click();
  check("memória de cálculo exibida", await com.getByText("Rateio custo fixo").isVisible());
  await com.getByRole("button", { name: "Adicionar à proposta" }).click();
  await com.waitForURL(estUrl); await ready(com);
  check("item salvo com o valor do servidor", Math.abs((await totalOnScreen(com)) - serverPrice) < 0.005);

  // 3. Poda com seleção direta de árvores da propriedade
  await com.getByRole("link", { name: "Adicionar serviço" }).first().click();
  await com.waitForURL(/\/item/); await ready(com);
  await com.locator("#svc").selectOption("PODA");
  await com.getByRole("button", { name: /Selecionar árvores cadastradas/ }).click();
  await com.getByRole("button", { name: "Selecionar exibidas" }).click();
  const selected = Number(await com.getByTestId("arvores-selecionadas").textContent());
  check("seleção de árvores define a quantidade", selected > 0, `${selected} árvores`);
  await com.getByRole("button", { name: "Adicionar à proposta" }).click();
  await com.waitForURL(estUrl); await ready(com);
  check("poda salva com a quantidade de árvores selecionadas", await com.getByText(`${selected} árvore(s) selecionadas`).isVisible());

  // 4. Ajuste de margem (com motivo) e desconto
  const before = await totalOnScreen(com);
  await com.getByRole("button", { name: "Ajustar" }).first().click();
  await com.getByLabel(/^Margem \(%\)/).fill("40");
  await com.getByRole("dialog").getByLabel(/^Motivo/).fill("Serviço com prazo reduzido solicitado pelo cliente.");
  await com.getByRole("button", { name: "Aplicar ajuste" }).click();
  await com.waitForTimeout(1500); await com.reload(); await ready(com);
  const afterAdjust = await totalOnScreen(com);
  check("ajuste de margem aumenta o preço e preserva o calculado", afterAdjust > before && (await com.getByText("Margem ajustada").isVisible()));
  await com.locator("#discountType").selectOption("PERCENT");
  await com.locator("#f-discountValue").fill("5");
  await com.locator("form", { hasText: "Aplicar desconto" }).getByLabel(/^Motivo/).fill("Negociação comercial — cliente recorrente.");
  await com.getByRole("button", { name: "Aplicar desconto" }).click();
  await com.waitForTimeout(1500); await com.reload(); await ready(com);
  const afterDiscount = await totalOnScreen(com);
  check("desconto de 5% aplicado ao total", Math.abs(afterDiscount - afterAdjust * 0.95) < 0.02, `${afterAdjust} → ${afterDiscount}`);

  // 4b. Margem de lucro do orçamento: negativa é rejeitada; positiva é aplicada; desconto que zeraria a margem é bloqueado
  const marginForm = com.locator("form", { hasText: "Aplicar margem" });
  await marginForm.getByLabel(/^Margem de lucro/).fill("-5");
  await marginForm.getByLabel(/^Motivo/).fill("Teste de margem negativa.");
  await com.getByRole("button", { name: "Aplicar margem" }).click();
  await com.getByText("Margem de lucro não pode ser negativa.").first().waitFor();
  check("margem de lucro negativa é rejeitada", true);
  await marginForm.getByLabel(/^Margem de lucro/).fill("30");
  await marginForm.getByLabel(/^Motivo/).fill("Margem acordada com a diretoria para este cliente.");
  await com.getByRole("button", { name: "Aplicar margem" }).click();
  await com.getByText(/Margem de lucro de 30% aplicada/).waitFor();
  await com.reload(); await ready(com);
  const afterMargin = await totalOnScreen(com);
  check("margem de lucro do orçamento aplicada aos itens", afterMargin !== afterDiscount && (await com.getByText("Margem do orçamento 30%").isVisible()), `${afterDiscount} → ${afterMargin}`);
  await com.locator("#discountType").selectOption("PERCENT");
  await com.locator("#f-discountValue").fill("90");
  await com.locator("form", { hasText: "Aplicar desconto" }).getByLabel(/^Motivo/).fill("Tentativa de desconto excessivo.");
  await com.locator("form", { hasText: "Aplicar desconto" }).getByText(/Confirmo desconto/).click();
  await com.getByRole("button", { name: "Aplicar desconto" }).click();
  await com.getByText(/margem negativa/).first().waitFor();
  await com.reload(); await ready(com);
  check("desconto que geraria margem negativa é bloqueado", (await totalOnScreen(com)) === afterMargin);

  // 5. Aprovação por alçada (poda legada ⇒ margem baixa ⇒ diretoria)
  await com.getByRole("button", { name: "Solicitar aprovação" }).click();
  await com.waitForTimeout(1500); await com.reload(); await ready(com);
  check("solicitação de aprovação criada", await com.getByText("Em aprovação interna").first().isVisible());
  const level = (await com.locator("text=Alçada exigida:").textContent()) ?? "";
  const gest = await login("gestor@arborgest.demo");
  await gest.goto(estUrl); await ready(gest);
  const gestorCanApprove = (await gest.getByRole("button", { name: "Aprovar", exact: true }).count()) > 0;
  check("alçada respeitada (gestor aprova gerencial, não diretoria)", level.includes("Diretoria") ? !gestorCanApprove : level.includes("Gerencial") ? gestorCanApprove : true, level);
  const adm = await login("admin@arborgest.demo");
  await adm.goto(estUrl); await ready(adm);
  await adm.getByRole("button", { name: "Aprovar", exact: true }).click();
  await adm.waitForTimeout(1500); await adm.reload(); await ready(adm);
  check("aprovação concedida por quem tem alçada", await adm.getByText("Aprovado internamente").first().isVisible());

  // 6. Proposta, PDF (sem dados internos) e envio
  await com.goto(`${estUrl}?aba=proposta`); await ready(com);
  await com.getByRole("button", { name: "Gerar proposta" }).click();
  await com.waitForURL(/aba=proposta/); await ready(com);
  const pdfHref = await com.getByRole("link", { name: "PDF da proposta" }).first().getAttribute("href");
  const pdf = await com.request.get(`${base}${pdfHref}`);
  const body = (await pdf.body()).toString("latin1");
  check("PDF da proposta gerado", pdf.headers()["content-type"] === "application/pdf" && body.startsWith("%PDF") && body.includes("TOTAL DA PROPOSTA"));
  check("PDF não expõe custos/margem", !/custo operacional|margem|rateio|sal[aá]rio/i.test(body));
  await com.getByRole("button", { name: "Registrar envio" }).click();
  await com.waitForTimeout(1500); await com.goto(estUrl); await ready(com);
  check("proposta enviada ao cliente", await com.getByText("Enviado ao cliente").first().isVisible());

  // 7. Aceite → oportunidade ganha → contrato e OS
  await com.getByRole("button", { name: "Cliente aceitou" }).click();
  await com.waitForTimeout(1500); await com.reload(); await ready(com);
  check("orçamento aceito", await com.getByText("Aceito").first().isVisible());
  const oppHref = await com.locator("a[href^='/oportunidades/']").first().getAttribute("href");
  await com.goto(`${base}${oppHref}`); await ready(com);
  check("oportunidade marcada como ganha", (await com.locator("#f-stage").inputValue()) === "GANHA");
  await adm.goto(estUrl); await ready(adm);
  await adm.getByRole("button", { name: "Criar contrato" }).click();
  await adm.waitForURL(/\/contratos\/c/); await ready(adm);
  check("contrato criado a partir do orçamento", await adm.getByText("Orçamento de origem").isVisible());
  await adm.goto(estUrl); await ready(adm);
  await adm.getByRole("button", { name: "Criar ordens de serviço" }).click();
  await adm.waitForTimeout(2000); await adm.reload(); await ready(adm);
  check("OS criadas para os itens", (await adm.locator("a[href^='/ordens-servico/']").count()) >= 2);

  // 8. Histórico / auditoria
  await adm.goto(`${estUrl}?aba=historico`); await ready(adm);
  const audit = await adm.locator("main").textContent();
  check("auditoria registra criação, margem, desconto, aprovação e envio",
    ["Criação", "Alteração de margem", "Desconto", "Aprovação", "Envio ao cliente", "Contrato criado"].every((t) => audit.includes(t)));

  // 9. Versionamento: nova versão não altera orçamento antigo
  await adm.goto(`${base}/precificacao`); await ready(adm);
  const oldRow = adm.locator("tr", { hasText: "2026-00002" });
  const oldTotal = brl(await oldRow.locator("td").nth(5).textContent());
  await adm.goto(`${base}/admin/precificacao`); await ready(adm);
  await adm.getByLabel("Custo técnico/dia").fill("450");
  await adm.getByPlaceholder(/Descrição\/motivo/).fill("Reajuste do custo técnico (teste E2E)");
  await adm.getByRole("button", { name: "Publicar nova versão" }).click();
  await adm.getByText(/Versão 1\.1 publicada/).waitFor();
  await adm.goto(`${base}/precificacao`); await ready(adm);
  const oldTotalAfter = brl(await adm.locator("tr", { hasText: "2026-00002" }).locator("td").nth(5).textContent());
  check("nova versão de parâmetros não altera orçamento existente", oldTotal === oldTotalAfter, `R$ ${oldTotal}`);
  await adm.locator("tr", { hasText: "2026-00002" }).getByRole("link").first().click(); await ready(adm);
  check("orçamento antigo oferece atualização explícita para v1.1", await adm.getByRole("button", { name: /Atualizar para parâmetros v1\.1/ }).isVisible());

  // 10. Permissões
  const con = await login("consulta@arborgest.demo");
  await con.goto(`${base}/precificacao/novo`); await ready(con);
  check("consulta não cria orçamento", con.url().includes("sem-permissao"));
  await con.goto(estUrl); await ready(con);
  check("consulta não vê custos internos nem ações", !(await con.getByText("Análise interna").isVisible()) && !(await con.getByRole("link", { name: "Adicionar serviço" }).count()));
  const tec = await login("tecnico@arborgest.demo");
  await tec.goto(`${base}/precificacao/simulador`); await ready(tec);
  check("técnico simula sem ver custos/margem", (await tec.getByTestId("preco-final").isVisible()) && !(await tec.getByText("Custo operacional").count()));
  const op = await login("operacional@arborgest.demo");
  await op.goto(`${base}/precificacao`); await ready(op);
  check("operacional sem acesso à precificação", op.url().includes("sem-permissao"));
  const bad = await adm.request.post(`${base}/api/precificacao/calcular`, { data: { service: "PODA", inputs: { trees: -3 } } });
  check("API rejeita entradas inválidas", bad.status() === 422);
  const anon = await (await browser.newContext()).request.post(`${base}/api/precificacao/calcular`, { data: {} });
  check("API exige autenticação", anon.status() === 401);

  // 11. Celular
  const mob = await login("comercial@arborgest.demo", undefined, { ...devices["iPhone 13"] });
  await mob.goto(`${base}/precificacao/simulador`); await ready(mob);
  await mob.locator("#sim-trees").fill("350");
  const noScroll = await mob.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check("simulador no celular sem rolagem horizontal e recalculando", noScroll && (await priceOnScreen(mob)) > 0);
  await mob.screenshot({ path: "e2e/screenshots/pricing-mobile.png", fullPage: true });
} catch (e) {
  check("execução sem exceções", false, String(e).slice(0, 500));
}
check("sem erros JavaScript/HTTP 5xx", errors.length === 0, errors.slice(0, 5).join(" | "));
await browser.close();
const ok = results.filter((r) => r.ok).length;
console.log(`\n${ok}/${results.length} verificações OK`);
process.exit(ok === results.length ? 0 : 1);
