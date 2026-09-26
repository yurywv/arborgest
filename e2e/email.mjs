// E2E do envio de e-mails pela conta Gmail cadastrada no sistema (sem mailto / cliente de e-mail local).
// Requer o servidor com MAIL_CAPTURE_DIR apontando para a pasta passada aqui: nada é enviado ao Google;
// as mensagens são gravadas em .eml e conferidas pelo teste. Credenciais usadas: valores de teste gerados aqui.
// Uso: MAIL_CAPTURE_DIR=<pasta> npm start  →  node e2e/email.mjs <baseUrl> <pasta>
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const base = process.argv[2] ?? "http://localhost:3000";
const dir = process.argv[3];
if (!dir) throw new Error("Informe a pasta de captura (MAIL_CAPTURE_DIR do servidor).");
const db = new PrismaClient();
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok }); console.log(`${ok ? "✓" : "✗"} ${name}${extra ? ` — ${extra}` : ""}`); };
const browser = await chromium.launch();
const errors = [];
const dialogs = [];
const waitDialog = async (re) => { for (let i = 0; i < 100; i++) { if (dialogs.some((d) => re.test(d))) return; await new Promise((r) => setTimeout(r, 200)); } throw new Error(`alerta não exibido: ${re}`); };
const mails = () => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".eml")).sort().map((f) => fs.readFileSync(path.join(dir, f), "utf8")) : []);
const testAccount = `e2e.${crypto.randomBytes(3).toString("hex")}@example.com`;
const testAppPassword = Array.from(crypto.randomBytes(16), (b) => String.fromCharCode(97 + (b % 26))).join("");

async function login(email) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${email}: ${e.message}`));
  page.on("response", (r) => r.status() >= 500 && errors.push(`${email}: HTTP ${r.status()} ${r.url()}`));
  page.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });
  await page.goto(`${base}/login`);
  await page.getByLabel(/^E-mail/).fill(email);
  await page.getByLabel(/^Senha/).fill("Arbor@2026");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard");
  return page;
}
const ready = async (p) => { await p.waitForLoadState("networkidle"); await p.waitForTimeout(300); };

try {
  fs.rmSync(dir, { recursive: true, force: true });
  await db.setting.deleteMany({ where: { key: { startsWith: "mail_" } } });

  // 1. Sem conta: nada é enviado e a tela avisa
  const adm = await login("admin@arborgest.demo");
  await adm.goto(`${base}/admin/configuracoes`); await ready(adm);
  check("sem conta cadastrada: aviso na configuração", (await adm.getByTestId("gmail-status").textContent()).includes("Nenhuma conta cadastrada"));
  check("sem configuração de SMTP/Outlook na tela", !/smtp_host|office365|outlook/i.test(await adm.locator("main").textContent()));
  await adm.getByRole("button", { name: "Enviar e-mail de teste" }).click();
  await adm.getByText("Cadastre a conta Gmail").waitFor();
  check("teste bloqueado sem conta", true);

  // 2. Cadastro da conta Gmail (validações; senha nunca exibida de volta)
  const form = adm.locator("form", { has: adm.getByRole("button", { name: "Salvar conta Gmail" }) });
  check("campos da conta começam vazios", (await form.locator("#f-gmailUser").inputValue()) === "" && (await form.locator("#f-appPassword").inputValue()) === "");
  await form.locator("#f-gmailUser").fill(testAccount);
  await form.locator("#f-senderName").fill("Arborent Comercial");
  await form.locator("#f-appPassword").fill("curta");
  await form.getByRole("button", { name: "Salvar conta Gmail" }).click();
  await adm.getByText("A senha de app do Google tem 16 letras.").waitFor();
  check("senha de app validada (16 letras)", true);
  await form.locator("#f-appPassword").fill(testAppPassword.replace(/(.{4})/g, "$1 ").trim()); // formato exibido pelo Google
  await form.getByRole("button", { name: "Salvar conta Gmail" }).click();
  await adm.getByText(/Conta Gmail salva/).waitFor(); await ready(adm);
  check("conta ativa exibida", (await adm.getByTestId("gmail-status").textContent()).includes(testAccount));
  check("senha não volta para a tela", (await form.locator("#f-appPassword").inputValue()) === "" && !(await adm.content()).includes(testAppPassword));
  const stored = await db.setting.findUnique({ where: { key: "mail_gmail_password" } });
  check("senha gravada cifrada no banco", !!stored && stored.value.startsWith("v1.") && !stored.value.includes(testAppPassword));
  await form.locator("#f-senderName").fill("Arborent — Comercial");
  await form.getByRole("button", { name: "Salvar conta Gmail" }).click();
  await adm.getByText(/Conta Gmail salva/).waitFor();
  check("alterar o nome sem redigitar a senha mantém a senha", (await db.setting.findUnique({ where: { key: "mail_gmail_password" } })).value === stored.value);
  await adm.getByRole("button", { name: "Enviar e-mail de teste" }).click();
  await waitDialog(/E-mail de teste enviado/);
  let m = mails();
  check("e-mail de teste sai pela conta cadastrada", m.length === 1 && m[0].includes(`<${testAccount}>`) && /From: .*Arborent/.test(m[0]));

  // 3. Cliente: e-mail pelo sistema (sem mailto)
  const com = await login("comercial@arborgest.demo");
  await com.goto(`${base}/clientes`); await ready(com);
  await com.getByRole("link", { name: /Vale Verde/ }).first().click(); await ready(com);
  const clientUrl = com.url().split("?")[0];
  check("sem links mailto (não abre Outlook)", (await com.locator('a[href^="mailto:"]').count()) === 0);
  await com.getByRole("link", { name: "E-mail" }).first().click();
  await com.waitForURL(/\/emails\/novo\?contato=/); await ready(com);
  const to = await com.locator("#f-to").inputValue();
  check("destinatário = contato clicado; assunto e mensagem em branco", /@/.test(to) && (await com.locator("#f-subject").inputValue()) === "" && (await com.locator("#f-body").inputValue()) === "", to);
  check("remetente informado (Gmail)", await com.getByText(`Enviado por Arborent — Comercial <${testAccount}> (Gmail).`).isVisible());
  await com.getByRole("button", { name: "Enviar e-mail" }).click();
  await com.getByText("Verifique os campos destacados.").waitFor();
  check("assunto e mensagem obrigatórios", true);
  await com.locator("#f-subject").fill("Proposta de ampliação — CD Sumaré");
  await com.locator("#f-body").fill("Prezada Patrícia,\n\nSegue a proposta conforme conversamos.\n\nAtenciosamente,\nCarla");
  const propBox = com.locator("input[name=proposalIds]").first();
  const hasProposal = (await propBox.count()) > 0;
  if (hasProposal) await propBox.check();
  await com.getByRole("button", { name: "Enviar e-mail" }).click();
  await com.waitForURL(/aba=historico/); await ready(com);
  m = mails();
  const last = m[m.length - 1];
  check("mensagem enviada pela conta Gmail", m.length === 2 && last.includes(`<${testAccount}>`) && last.includes("Proposta de amplia"));
  check("PDF da proposta anexado", !hasProposal || /filename="?PROP-\d{4}-\d{5}\.pdf/.test(last));
  const hist = await com.locator("main").textContent();
  check("e-mail registrado no histórico do cliente", hist.includes("E-mail: Proposta de ampliação — CD Sumaré") && hist.includes("Enviado") && hist.includes("por Carla Comercial"));
  check("sent e-mail gravado com remetente e status", (await db.sentEmail.count({ where: { status: "ENVIADO", fromAddress: testAccount } })) === 1);

  // 4. Recuperação de senha usa a mesma conta
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`${base}/esqueci-senha`).catch(() => {});
  if (await anon.getByLabel(/^E-mail/).count()) {
    await anon.getByLabel(/^E-mail/).fill("consulta@arborgest.demo");
    await anon.getByRole("button").filter({ hasText: /Enviar|Receber/ }).first().click();
    await anon.getByText(/Se o e-mail estiver cadastrado/).waitFor();
    await anon.waitForTimeout(800);
    m = mails();
    check("recuperação de senha sai pela conta Gmail", m.length === 3 && m[2].includes(`<${testAccount}>`) && m[2].includes("Redefini"));
  }

  // 5. Sem conta, o envio é bloqueado
  await adm.goto(`${base}/admin/configuracoes`); await ready(adm);
  await adm.getByRole("button", { name: "Remover conta" }).click();
  await waitDialog(/Conta removida/);
  await com.goto(`${clientUrl.replace("/clientes/", "/emails/novo?cliente=")}`); await ready(com);
  check("sem conta: aviso e sem botão de envio", (await com.getByText("Nenhuma conta Gmail cadastrada para envio.").isVisible()) && (await com.getByRole("button", { name: "Enviar e-mail" }).count()) === 0);
} catch (e) {
  check("execução sem exceções", false, String(e).slice(0, 500));
}
check("sem erros JavaScript/HTTP 5xx", errors.length === 0, errors.slice(0, 5).join(" | "));
await db.$disconnect();
await browser.close();
const ok = results.filter((r) => r.ok).length;
console.log(`\n${ok}/${results.length} verificações OK`);
process.exit(ok === results.length ? 0 : 1);
