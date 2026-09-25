// E2E de Contratos: proposta em PDF emitida no contrato (itens, desconto, versões), envio, aceite,
// anexos (proposta assinada, contrato social, arquivo grande) e histórico do cliente.
// Uso: node e2e/contracts.mjs [baseUrl]   — requer seed carregado e servidor em execução.
import { chromium, devices } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok }); console.log(`${ok ? "✓" : "✗"} ${name}${extra ? ` — ${extra}` : ""}`); };
const brl = (s) => Number(String(s).replace(/[^\d,-]/g, "").replace(",", "."));
const browser = await chromium.launch();
const errors = [];
const pdfFile = (name, extraBytes = 0) => ({ name, mimeType: "application/pdf", buffer: Buffer.concat([Buffer.from("%PDF-1.4\n% E2E\n"), Buffer.alloc(extraBytes, 32), Buffer.from("\n%%EOF\n")]) });

async function login(email, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR", ...extra });
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
async function attach(p, scope, type, file) {
  await scope.locator("select[id^=doc-type]").selectOption({ label: type });
  await scope.locator("input[type=file]").setInputFiles(file);
  await scope.getByText("Documento(s) enviado(s).").waitFor({ timeout: 20000 });
  await ready(p);
}

try {
  const com = await login("comercial@arborgest.demo");
  await com.goto(`${base}/contratos`); await ready(com);
  await com.getByRole("link", { name: "CT-2026-0001" }).first().click();
  await com.waitForURL(/\/contratos\/[^/]+$/); await ready(com);
  const contractUrl = com.url();

  // 1. Nova proposta: tudo em branco
  await com.getByRole("link", { name: "Nova proposta" }).click();
  await com.waitForURL(/propostas\/nova/); await ready(com);
  const blank = (await com.locator("#f-title").inputValue()) === "" && (await com.locator("#f-object").inputValue()) === ""
    && (await com.getByLabel("Serviço 1", { exact: true }).inputValue()) === "" && (await com.getByLabel("Valor unitário do serviço 1").inputValue()) === "";
  check("nova proposta começa em branco (sem sugestões)", blank);
  await com.getByRole("button", { name: "Gerar proposta em PDF" }).click();
  await com.getByText("Verifique os campos destacados.").waitFor();
  check("campos obrigatórios validados", true);

  // 2. Preenche dois serviços + desconto
  await com.locator("#f-title").fill("Poda e inventário — E2E");
  await com.locator("#f-object").fill("Poda de condução e inventário das áreas comuns.");
  await com.getByLabel("Serviço 1", { exact: true }).fill("Poda de condução");
  await com.getByLabel("Quantidade do serviço 1").fill("10");
  await com.getByLabel("Unidade do serviço 1").fill("árvore");
  await com.getByLabel("Valor unitário do serviço 1").fill("350,50");
  await com.getByRole("button", { name: "Incluir serviço" }).click();
  await com.getByLabel("Serviço 2", { exact: true }).fill("Inventário");
  await com.getByLabel("Quantidade do serviço 2").fill("1");
  await com.getByLabel("Unidade do serviço 2").fill("serviço");
  await com.getByLabel("Valor unitário do serviço 2").fill("2000");
  await com.locator("input[name=discount]").fill("100");
  const shown = brl(await com.getByTestId("proposal-total").textContent());
  check("total calculado na tela", Math.abs(shown - 5405) < 0.01, `R$ ${shown}`);
  await com.locator("#f-paymentTerms").fill("30 dias após a execução.");
  await com.getByRole("button", { name: "Gerar proposta em PDF" }).click();
  await com.waitForURL(/propostas\/(?!nova)[^/?]+$/); await ready(com);
  const propUrl = com.url();
  const number = (await com.locator("h1").textContent()).replace("Proposta ", "").trim();
  check("proposta emitida", (await com.getByText("Emitida").first().isVisible()) && /^PROP-\d{4}-\d{5}$/.test(number), number);
  check("total gravado pelo servidor", (await com.getByText(/R\$\s?5\.405,00/).count()) > 0);

  // 3. PDF
  const pdf = await com.request.get(`${base}/api/propostas/${propUrl.split("/").pop()}/pdf`);
  const body = await pdf.body();
  check("PDF da proposta gerado", pdf.status() === 200 && pdf.headers()["content-type"] === "application/pdf" && body.subarray(0, 4).toString() === "%PDF", `${body.length} bytes`);

  // 4. Envio registrado
  const sendCard = com.locator("section", { hasText: "Enviar ao cliente" });
  await sendCard.getByLabel(/^Destinatário/).fill("cliente@example.com");
  await sendCard.getByRole("button", { name: "Registrar envio" }).click();
  await com.getByText("Envio registrado.").waitFor(); await ready(com);
  check("envio registrado", await com.getByText("Enviada").first().isVisible());

  // 5. Anexo sem tipo é recusado; proposta assinada anexada
  const docCard = com.locator("section", { hasText: "Documentos da proposta" });
  await docCard.getByRole("button", { name: "Anexar arquivo" }).click();
  check("anexo exige tipo (sem valor sugerido)", await docCard.getByText("Selecione o tipo do documento antes de anexar.").isVisible());
  await attach(com, docCard, "Proposta assinada", pdfFile("proposta-assinada.pdf"));
  check("proposta assinada anexada e vinculada", (await docCard.getByText("proposta-assinada.pdf").count()) > 0 && (await docCard.getByText(`Proposta assinada (${number})`).count()) > 0);

  // 6. Aceite exige nome
  const decide = com.locator("section", { hasText: "Resultado" });
  await decide.locator("select[name=status]").selectOption("ACEITA");
  await decide.getByRole("button", { name: "Registrar resultado" }).click();
  await com.getByText("Informe quem aceitou a proposta.").waitFor();
  await decide.getByLabel(/^Aceita por/).fill("Maria Síndica");
  await decide.getByRole("button", { name: "Registrar resultado" }).click();
  await com.getByText("Proposta marcada como aceita.").waitFor(); await ready(com);
  check("aceite registrado", (await com.getByText("Aceita").first().isVisible()) && (await com.getByText(/Maria Síndica/).count()) > 0);

  // 7. Nova versão copia o conteúdo escolhido
  await com.getByRole("link", { name: "Nova versão" }).click();
  await com.waitForURL(/nova\?de=/); await ready(com);
  const copied = (await com.getByLabel("Serviço 2", { exact: true }).inputValue()) === "Inventário" && (await com.locator("#f-title").inputValue()) === "Poda e inventário — E2E";
  check("nova versão traz o conteúdo da versão escolhida", copied);
  await com.getByLabel("Valor unitário do serviço 2").fill("2500");
  await com.getByRole("button", { name: "Gerar proposta em PDF" }).click();
  await com.waitForURL(/propostas\/(?!nova)[^/?]+$/); await ready(com);
  check("versão 2 emitida", (await com.getByText("versão 2").count()) > 0 && (await com.getByText(/R\$\s?5\.905,00/).count()) > 0);

  // 8. Contrato: propostas listadas; contrato social + arquivo grande (> 4 MB)
  await com.goto(contractUrl); await ready(com);
  const list = com.getByTestId("contract-proposals");
  check("contrato lista as propostas (v1 e v2)", (await list.locator("li").filter({ hasText: number }).count()) === 1 && (await list.getByText("· v2").count()) === 1);
  const docs = com.locator("section", { hasText: "Documentos anexos" });
  await attach(com, docs, "Contrato social / estatuto", pdfFile("contrato-social.pdf"));
  await attach(com, docs, "Contrato assinado", pdfFile("contrato-assinado-grande.pdf", 5 * 1024 * 1024));
  check("contrato social anexado no contrato", (await docs.getByText("contrato-social.pdf").count()) > 0);
  check("arquivo de 5 MB anexado", (await docs.getByText("contrato-assinado-grande.pdf").count()) > 0);

  // 9. Histórico do cliente
  await com.getByRole("link", { name: "Histórico do cliente" }).click();
  await ready(com);
  const hist = com.getByTestId("client-history").first();
  const text = await com.locator("main").textContent();
  check("histórico: emissão, envio e aceite da proposta", text.includes(`Proposta ${number} emitida`) && text.includes(`Proposta ${number} enviada`) && text.includes(`Proposta ${number} aceita`));
  check("histórico: documentos e contrato", text.includes("Proposta assinada: proposta-assinada.pdf") && text.includes("Contrato social / estatuto: contrato-social.pdf") && text.includes("Contrato CT-2026-0001"));
  check("histórico: propostas da precificação", /orçamento ORC-/.test(text) || text.includes("Orçamento "), "");
  void hist;
  await com.goto(com.url().replace("aba=historico", "aba=documentos")); await ready(com);
  check("aba Documentos do cliente inclui anexos do contrato", (await com.getByText("contrato-social.pdf").count()) > 0 && (await com.getByText("proposta-assinada.pdf").count()) > 0);

  // 10. Exclusão de contrato com proposta enviada é bloqueada
  const adm = await login("admin@arborgest.demo");
  await adm.goto(contractUrl); await ready(adm);
  await adm.getByRole("button", { name: "Excluir" }).first().click();
  await adm.getByText(/propostas enviadas ou aceitas/).waitFor();
  check("contrato com proposta enviada não pode ser excluído", true);

  // 11. Permissões: operacional não baixa PDF de proposta de contrato
  const op = await login("operacional@arborgest.demo");
  const denied = await op.request.get(`${base}/api/propostas/${propUrl.split("/").pop()}/pdf`);
  check("operacional sem acesso ao PDF", denied.status() === 403);

  // 12. Celular
  const mob = await login("comercial@arborgest.demo", { ...devices["iPhone 13"] });
  await mob.goto(`${contractUrl}/propostas/nova`); await ready(mob);
  const noScroll = await mob.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check("formulário de proposta no celular sem rolagem horizontal", noScroll);
  await mob.screenshot({ path: "e2e/screenshots/contract-proposal-mobile.png", fullPage: true });
  await com.goto(propUrl); await ready(com);
  await com.screenshot({ path: "e2e/screenshots/contract-proposal.png", fullPage: true });
} catch (e) {
  check("execução sem exceções", false, String(e).slice(0, 500));
}
check("sem erros JavaScript/HTTP 5xx", errors.length === 0, errors.slice(0, 5).join(" | "));
await browser.close();
const ok = results.filter((r) => r.ok).length;
console.log(`\n${ok}/${results.length} verificações OK`);
process.exit(ok === results.length ? 0 : 1);
