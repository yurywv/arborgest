// E2E: catálogo único de serviços (oportunidade = simulador), serviços por diárias na precificação,
// log de ações da oportunidade (manual e automático), origem da OS (proposta / avulso),
// etiqueta QR no cadastro do exemplar e identificação pública/privada da propriedade.
// Uso: node e2e/crm-ops.mjs [baseUrl]   — requer seed carregado e servidor em execução.
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok }); console.log(`${ok ? "✓" : "✗"} ${name}${extra ? ` — ${extra}` : ""}`); };
const brl = (s) => Number(String(s).replace(/[^\d,-]/g, "").replace(",", "."));
const browser = await chromium.launch();
const errors = [];

async function login(email) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR", permissions: ["geolocation"], geolocation: { latitude: -22.87091, longitude: -47.04874, accuracy: 5 } });
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
const optionLabels = (loc) => loc.locator("option").evaluateAll((os) => os.map((o) => o.textContent.trim()).filter((t) => t && !/^Selecione/.test(t)));

try {
  const com = await login("comercial@arborgest.demo");

  // 1. Mesmo catálogo de serviços na oportunidade e no simulador
  await com.goto(`${base}/oportunidades/nova`); await ready(com);
  const oppServices = await optionLabels(com.locator("select[name=service]"));
  await com.goto(`${base}/precificacao/simulador`); await ready(com);
  const simServices = await optionLabels(com.locator("#svc"));
  const expected = ["Avaliação de risco", "Consultoria", "Inventário", "Licenciamento ambiental", "Manejo", "Manutenção periódica", "Plantio", "Poda", "Remoção / supressão", "Tratamento fitossanitário"];
  check("simulador lista os mesmos serviços da oportunidade", JSON.stringify(simServices) === JSON.stringify(oppServices), simServices.join(" | "));
  check("lista na ordem do catálogo (10 serviços)", JSON.stringify(simServices) === JSON.stringify(expected));

  // 2. Serviço por diárias (consultoria): campos em branco, preço = servidor
  await com.locator("#svc").selectOption("CONSULTORIA");
  check("consultoria começa em branco", (await com.locator("#sim-trees").inputValue()) === "" && (await com.locator("#sim-days").inputValue()) === "");
  await com.locator("#sim-trees").fill("1");
  await com.locator("#sim-days").fill("2");
  await com.locator("#sim-technicians").fill("1");
  await com.locator("#sim-auxiliaries").fill("0");
  await com.locator("#sim-distanceKm").fill("30");
  await com.locator("#sim-toll").fill("0");
  await com.locator("#sim-thirdParty").fill("450");
  await com.getByTestId("preco-final").waitFor();
  const shown = brl(await com.getByTestId("preco-final").textContent());
  const api = await com.request.post(`${base}/api/precificacao/calcular`, { data: { service: "CONSULTORIA", inputs: { trees: 1, days: 2, technicians: 1, auxiliaries: 0, distanceKm: 30, toll: 0, lodging: false, thirdParty: 450 } } });
  const apiJson = await api.json();
  const server = Number(apiJson.result?.finalPriceRounded);
  check("consultoria: simulador = servidor", shown > 0 && Math.abs(shown - server) < 0.005, `R$ ${shown} × R$ ${server}`);
  check("terceiros/taxas entram no custo", apiJson.result?.costs?.terceiros === "450");
  check("preço por serviço (unidade do serviço)", await com.getByText(/por serviço/).first().isVisible());

  // 3. Plantio em orçamento: quantidade em mudas
  await com.goto(`${base}/precificacao`); await ready(com);
  await com.locator("table tbody tr", { hasText: "Rascunho" }).getByRole("link").first().click();
  await ready(com);
  const draftUrl = com.url().split("?")[0];
  await com.goto(`${draftUrl}/item`); await ready(com);
  await com.locator("#svc").selectOption("PLANTIO");
  check("plantio sem seleção de árvores cadastradas", (await com.getByRole("button", { name: /Selecionar árvores cadastradas/ }).count()) === 0);
  for (const [k, v] of [["trees", "50"], ["days", "3"], ["technicians", "1"], ["auxiliaries", "3"], ["distanceKm", "25"], ["toll", "0"], ["materials", "1750"]]) await com.locator(`#sim-${k}`).fill(v);
  await com.getByRole("button", { name: "Adicionar à proposta" }).click();
  await com.waitForURL(draftUrl); await ready(com);
  check("item de plantio salvo em mudas", await com.getByText("50 mudas").first().isVisible());

  // 4. Log de ações da oportunidade
  await com.goto(`${base}/oportunidades`); await ready(com);
  await com.getByRole("link", { name: "Ampliação do contrato para o CD Sumaré" }).click();
  await com.waitForURL(/\/oportunidades\/c[a-z0-9]+$/); await ready(com);
  const oppUrl = com.url();
  const log = com.getByTestId("opportunity-activities");
  check("log traz as ações registradas", (await log.locator("li").count()) >= 4 && (await log.getByText("Visita presencial").count()) === 1);
  await com.getByRole("button", { name: "Registrar ação" }).click();
  await com.getByText("Verifique os campos destacados.").waitFor();
  check("ação exige tipo, data e descrição (nada pré-preenchido)", (await com.locator("#f-type").inputValue()) === "" && (await com.locator("#f-occurredAt").inputValue()) === "");
  await com.locator("#f-type").selectOption({ label: "Homologação" });
  await com.locator("#f-occurredAt").fill("2026-09-24T10:30");
  await com.locator("#f-contactId").selectOption({ label: "Luciana Ferraz" });
  await com.locator("#f-description").fill("Cadastro da Arborent homologado no portal de fornecedores do cliente.");
  await com.getByRole("button", { name: "Registrar ação" }).click();
  await com.getByText("Ação registrada.").waitFor(); await ready(com);
  check("ação registrada com contato e autor", (await log.getByText(/portal de fornecedores/).count()) === 1 && (await log.getByText(/com Luciana Ferraz · registrado por Carla Comercial/).count()) >= 1);
  const before = await log.locator("li").count();
  await log.locator("li", { hasText: "portal de fornecedores" }).getByRole("button", { name: "Excluir" }).click();
  await ready(com);
  check("autor pode excluir o próprio registro", (await log.locator("li").count()) === before - 1);

  // 5. Envio de proposta pela precificação gera registro automático
  await com.goto(`${base}/precificacao`); await ready(com);
  await com.locator("table tbody tr", { hasText: "Em negociação" }).getByRole("link").first().click();
  await ready(com);
  const estUrl = com.url().split("?")[0];
  await com.goto(`${estUrl}?aba=proposta`); await ready(com);
  await com.getByText("Enviar ao cliente", { exact: true }).first().click();
  await com.getByLabel(/^Destinatário/).first().fill("compras@valeverde.demo");
  await com.getByRole("button", { name: "Registrar envio" }).first().click();
  await com.getByText("Envio registrado.").waitFor();
  await com.goto(oppUrl); await ready(com);
  check("envio da proposta registrado automaticamente no log", (await log.locator("li", { hasText: "Envio da proposta" }).filter({ hasText: "automático" }).count()) >= 1);

  // 6. OS associada a proposta
  const op = await login("gestor@arborgest.demo");
  await op.goto(`${base}/ordens-servico/nova`); await ready(op);
  await op.locator("#f-clientId").selectOption({ label: "Vale Verde Indústria Ltda." }).catch(async () => {
    const opts = await op.locator("#f-clientId option").allTextContents();
    await op.locator("#f-clientId").selectOption({ label: opts.find((o) => /Vale Verde/.test(o)) });
  });
  await op.locator("#origin-PROPOSTA").check();
  const propOpts = await op.locator("#f-proposalId option").allTextContents();
  check("propostas do cliente disponíveis para a OS", propOpts.some((o) => /^PROP-\d{4}-\d{5}/.test(o)), `${propOpts.length - 1} proposta(s)`);
  await op.locator("#f-service").selectOption({ label: "Remoção / supressão" });
  await op.getByRole("button", { name: "Salvar", exact: true }).click();
  await op.getByText("Verifique os campos destacados.").waitFor();
  check("OS por proposta exige escolher a proposta", await op.getByText("Selecione a proposta.").isVisible());
  const chosen = propOpts.find((o) => /^PROP-/.test(o));
  await op.locator("#f-proposalId").selectOption({ label: chosen });
  await op.getByRole("button", { name: "Salvar", exact: true }).click();
  await op.waitForURL(/\/ordens-servico\/c[a-z0-9]+$/); await ready(op);
  check("OS vinculada à proposta", await op.getByRole("link", { name: chosen.split(" ")[0] }).first().isVisible(), chosen.split(" — ")[0]);

  // 7. Etiqueta QR no cadastro do exemplar
  const tec = await login("tecnico@arborgest.demo");
  const prop = await tec.request.get(`${base}/propriedades`);
  void prop;
  await tec.goto(`${base}/propriedades`); await ready(tec);
  await tec.getByRole("link", { name: "Praça Central" }).first().click(); await ready(tec);
  const propId = tec.url().split("/").pop().split("?")[0];
  check("propriedade pública identificada", await tec.getByText("Propriedade pública").isVisible());
  await tec.goto(`${base}/arvores/novo?propertyId=${propId}`); await ready(tec);
  await tec.getByRole("button", { name: "Capturar minha localização" }).click();
  await tec.getByText(/Localização capturada/).waitFor();
  check("opção de etiqueta QR desmarcada por padrão", !(await tec.getByLabel("Gerar a etiqueta QR Code ao salvar").isChecked()));
  await tec.getByLabel("Gerar a etiqueta QR Code ao salvar").check();
  await tec.getByRole("button", { name: "Salvar", exact: true }).click();
  await tec.waitForURL(/\/arvores\/ARB-\d{6}\/qrcode\?nova=1$/); await ready(tec);
  const code = tec.url().match(/ARB-\d{6}/)[0];
  check("etiqueta QR gerada ao cadastrar", await tec.getByText(/Etiqueta QR Code gerada com o ID individual/).isVisible(), code);
  const png = await tec.request.get(`${base}/api/qrcode/${code}?format=png`);
  check("QR Code em PNG disponível", png.status() === 200 && (await png.body()).subarray(1, 4).toString() === "PNG");
  await tec.getByRole("link", { name: "1 cópia" }).click(); await ready(tec);
  check("folha com 1 etiqueta", (await tec.locator(".break-inside-avoid").count()) === 1);
  await tec.screenshot({ path: "e2e/screenshots/tree-qr-label.png", fullPage: true });

  // 8. Filtro público/privado
  await tec.goto(`${base}/propriedades?identificacao=PUBLICA`); await ready(tec);
  const rows = await tec.locator("table tbody tr").allTextContents();
  check("filtro de propriedades públicas", rows.length > 0 && rows.every((r) => r.includes("Pública")), `${rows.length} propriedade(s)`);
} catch (e) {
  check("execução sem exceções", false, String(e).slice(0, 500));
}
check("sem erros JavaScript/HTTP 5xx", errors.length === 0, errors.slice(0, 5).join(" | "));
await browser.close();
const ok = results.filter((r) => r.ok).length;
console.log(`\n${ok}/${results.length} verificações OK`);
process.exit(ok === results.length ? 0 : 1);
