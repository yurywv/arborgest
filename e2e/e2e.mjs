// Teste ponta a ponta com navegador real (Playwright/Chromium).
// Uso: node e2e/e2e.mjs [baseUrl] [pastaScreenshots]   — requer seed carregado.
import { chromium, devices } from "playwright";
import sharp from "sharp";
import fs from "node:fs";

const base = process.argv[2] ?? "http://localhost:3000";
const shots = process.argv[3] ?? "e2e/screenshots";
fs.mkdirSync(shots, { recursive: true });
const stamp = Date.now().toString().slice(-6);
let step = 0;
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok }); console.log(`${ok ? "✓" : "✗"} ${name}${extra ? ` — ${extra}` : ""}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR", permissions: ["geolocation"], geolocation: { latitude: -22.87091, longitude: -47.04874, accuracy: 5 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const snap = async (p, name) => p.screenshot({ path: `${shots}/${String(++step).padStart(2, "0")}-${name}.png`, fullPage: false });
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const lbl = (label, p = page) => p.getByLabel(new RegExp(`^${esc(label)}( \\*)?$`));
const fill = (label, value, p = page) => lbl(label, p).fill(value);
const select = (label, value, p = page) => lbl(label, p).selectOption({ label: value });
// Aguarda o conteúdo em streaming (Suspense/loading.tsx) ser revelado e hidratado.
const ready = async (p = page) => {
  await p.waitForFunction(() => !!document.querySelector("main h1, main h2"), null, { timeout: 30000 });
  await p.waitForTimeout(400);
};
const go = async (url, p = page) => { await p.goto(url); await ready(p); };
const save = async (p = page) => { await p.getByRole("button", { name: "Salvar", exact: true }).click(); };

try {
  // 1. Login
  await go(`${base}/login`);
  await snap(page, "login");
  await fill("E-mail", "admin@arborgest.demo");
  await fill("Senha", "senha-errada1");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByText("E-mail ou senha incorretos.").waitFor();
  check("login rejeita senha errada", true);
  await fill("Senha", "Arbor@2026");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard"); await ready();
  await page.locator(".leaflet-interactive").first().waitFor();
  check("login e dashboard com mapa", (await page.locator(".leaflet-interactive").count()) >= 25);
  await snap(page, "dashboard");

  // 2. Cliente (validação + criação)
  await go(`${base}/clientes/novo`);
  await fill("CPF/CNPJ", "11.111.111/1111-11");
  await save();
  await page.getByText("Razão social é obrigatório.").waitFor();
  await page.getByText("CPF/CNPJ inválido.").waitFor();
  check("validação de formulário (obrigatório + CNPJ)", true);
  await fill("Razão social / nome", `Condomínio Teste E2E ${stamp}`);
  await fill("CPF/CNPJ", "");
  await fill("Logradouro", "Rua das Acácias, 250");
  await fill("Cidade", "Campinas");
  await select("Estado", "SP");
  await save();
  await page.waitForURL(/\/clientes\/c[a-z0-9]+$/); await ready();
  const clientUrl = page.url();
  await go(`${clientUrl}/editar`);
  check("número do endereço separado do logradouro", (await lbl("Logradouro").inputValue()) === "Rua das Acácias" && (await lbl("Número").inputValue()) === "250");
  await go(clientUrl);
  check("cliente criado", (await page.getByRole("heading", { level: 1 }).textContent())?.includes("Teste E2E") ?? false);

  // 2b. Vários contatos classificados
  for (const [nome, tipo] of [["Ana Financeiro", "Administrativo"], ["Beto Compras", "Comercial"], ["Caio Zelador", "Técnico"]]) {
    await page.getByRole("link", { name: "Novo", exact: true }).first().click();
    await page.waitForURL(/\/contatos\/novo/); await ready();
    await fill("Nome", nome);
    await select("Classificação", tipo);
    await save();
    await page.waitForURL(clientUrl); await ready();
  }
  const contactBadges = await page.locator("li", { hasText: /Ana Financeiro|Beto Compras|Caio Zelador/ }).allTextContents();
  check("contatos múltiplos com classificação", contactBadges.length === 3 && ["Administrativo", "Comercial", "Técnico"].every((t) => contactBadges.join(" ").includes(t)));

  // 3. Propriedade + setor
  await page.goto(`${clientUrl.replace(/\/clientes\/(.*)$/, "/propriedades/nova?clientId=$1")}`);
  await fill("Nome da propriedade", `Residencial E2E ${stamp}`);
  await page.getByRole("button", { name: "Capturar minha localização" }).click();
  await page.getByText(/Localização capturada/).waitFor();
  await save();
  await page.waitForURL(/\/propriedades\/c[a-z0-9]+$/); await ready();
  const propId = page.url().split("/").pop();
  await go(`${base}/propriedades/${propId}?aba=setores`);
  await fill("Nome do setor/área", "Bloco E2E");
  await page.getByRole("button", { name: "Adicionar setor" }).click();
  await page.getByText("Setor criado.").waitFor();
  await page.reload(); await ready();
  check("propriedade e setor criados", await page.getByText("Bloco E2E").first().isVisible());

  // 4. Exemplar com GPS e biometria (CAP → DAP)
  await go(`${base}/arvores/novo?propertyId=${propId}`);
  await select("Setor / área", "Bloco E2E");
  await page.getByRole("button", { name: "Capturar minha localização" }).click();
  await page.getByText(/Localização capturada/).waitFor();
  const lat = await page.locator('input[name="latitude"]').inputValue();
  check("captura de GPS preenche coordenadas", lat.startsWith("-22.87"), `lat ${lat}`);
  await lbl("Espécie").fill("chrysotrichus");
  await page.getByRole("option", { name: "Ipê-amarelo-cascudo — Handroanthus chrysotrichus" }).click();
  await page.getByLabel("CAP — circunferência").fill("125,7");
  const dap = await page.getByLabel("DAP — diâmetro").inputValue();
  check("DAP calculado a partir do CAP", dap === "40", `DAP ${dap}`);
  await page.getByLabel("Altura total").fill("9,5");
  await page.getByLabel("Diâmetro da copa N-S").fill("6");
  await page.getByLabel("Diâmetro da copa L-O").fill("5");
  await page.getByLabel("Rede elétrica").check();
  await snap(page, "arvore-form");
  await save();
  await page.waitForURL(/\/arvores\/ARB-\d{6}$/); await ready();
  const code = page.url().split("/").pop();
  check(`exemplar criado com código permanente ${code}`, /^ARB-\d{6}$/.test(code));
  const body = await page.locator("main").textContent();
  check("ficha exibe DAP/altura", body.includes("40 cm") && body.includes("9,5 m"));
  await snap(page, "arvore-ficha");

  // 5. Upload de foto
  await go(`${base}/arvores/${code}?aba=fotos`);
  const jpg = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#4a7c3a" } }).jpeg().toBuffer();
  await page.locator('input[type=file][multiple]').setInputFiles({ name: "arvore.jpg", mimeType: "image/jpeg", buffer: jpg });
  await page.getByText("1 foto(s) enviada(s).").waitFor();
  const imgOk = await page.waitForFunction(() => { const i = document.querySelector("main ul img"); return !!i && i.complete && i.naturalWidth > 0; }, null, { timeout: 15000 }).then(() => true, () => false);
  check("upload de foto e exibição", imgOk);
  const bad = await page.request.post(`${base}/api/uploads`, { multipart: { kind: "photo", treeId: "x", file: { name: "fake.jpg", mimeType: "image/jpeg", buffer: Buffer.from("<script>alert(1)</script>") } } });
  check("upload rejeita arquivo falso", bad.status() === 422);

  // 6. Inspeção com achados + intervenção recomendada
  await go(`${base}/inspecoes/nova?arvore=${code}`);
  await select("Condição geral", "Regular");
  await page.getByLabel("Cavidades").check();
  await page.getByRole("checkbox", { name: "Galhos secos" }).check();
  await page.getByLabel("Cupins").check();
  await fill("Recomendação", "Poda de limpeza e reavaliação.");
  await page.getByLabel("Registrar intervenção recomendada a partir desta inspeção").check();
  await select("Tipo de intervenção", "Poda de limpeza");
  await save();
  await page.waitForURL(/\/inspecoes\/c[a-z0-9]+\?nova=1/); await ready();
  check("inspeção registrada", await page.getByText("Inspeção registrada").isVisible());
  await go(`${base}/arvores/${code}?aba=tronco`);
  check("aba Tronco mostra achado da inspeção", (await page.locator("main li.bg-amber-50").allTextContents()).some((t) => t.includes("Cavidades")));

  // 7. Avaliação de risco (matriz ISA TRAQ)
  await go(`${base}/riscos/nova?arvore=${code}`);
  await page.getByLabel("Pessoas").check();
  await select("Frequência (ocupação) do alvo", "Frequente");
  await select("Parte com possibilidade de falha", "Galho");
  await select("Probabilidade de falha", "Provável");
  await select("Probabilidade de impacto", "Alta");
  await select("Consequência", "Significativa");
  const rating = await page.locator("main form span.rounded-full.text-white").textContent();
  check("matriz de risco calcula classificação", rating === "Alto", rating);
  await save();
  await page.waitForURL(/\/riscos\/c[a-z0-9]+$/); await ready();

  // 8. Ordem de serviço + conclusão
  await go(`${base}/ordens-servico/nova?arvore=${code}`);
  await select("Serviço", "Poda");
  await select("Gerar intervenção para cada árvore (opcional)", "Poda de limpeza");
  await save();
  await page.waitForURL(/\/ordens-servico\/c[a-z0-9]+$/); await ready();
  const osNumber = await page.getByRole("heading", { level: 1 }).first().textContent();
  check(`OS criada ${osNumber}`, /^OS-\d{4}-\d{4}$/.test(osNumber ?? ""));
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Concluir" }).click();
  await page.getByText("Concluída").first().waitFor();
  check("OS concluída propaga status", true);

  // 9. Ficha: cache atualizado, histórico, QR
  await go(`${base}/arvores/${code}`);
  const header = await page.locator("main").textContent();
  check("ficha mostra condição e risco atuais", header.includes("Regular") && header.includes("Risco alto"));
  await go(`${base}/arvores/${code}?aba=historico`);
  check("histórico agrupado por ano", (await page.locator("main h3").first().textContent()) === String(new Date().getFullYear()));
  await go(`${base}/arvores/${code}/qrcode`);
  check("QR Code gerado", (await page.locator("main svg").count()) >= 2);
  await snap(page, "qrcode");

  // 10. Mapa com filtros
  const markers = async (url) => {
    await go(url);
    await page.locator("path.leaflet-interactive").first().waitFor();
    await page.waitForTimeout(500);
    return page.locator("path.leaflet-interactive").count();
  };
  const n = await markers(`${base}/mapa?risco=ALTO`);
  const total = await markers(`${base}/mapa`);
  check("filtro de risco no mapa reduz marcadores", n > 0 && n < total, `${n} de ${total}`);
  await page.locator("path.leaflet-interactive").nth(3).click({ force: true });
  await page.getByText("Ver ficha completa").waitFor();
  check("popup do mapa com link para ficha", true);
  await snap(page, "mapa");

  // 11. Busca global por código
  await page.goto(`${base}/busca?q=${code.replace("ARB-", "")}`).catch(() => {});
  await go(`${base}/busca?q=${code}`);
  check("busca por código abre a ficha", page.url().endsWith(`/arvores/${code}`));

  // 12. Relatórios
  const pdf = await page.request.get(`${base}/api/relatorios/fotografico?format=pdf&propriedade=${propId}`);
  check("PDF fotográfico gerado", pdf.ok() && (await pdf.body()).subarray(0, 4).toString() === "%PDF");

  // 13. Mobile
  const mctx = await browser.newContext({ ...devices["iPhone 13"], locale: "pt-BR", storageState: await ctx.storageState() });
  const m = await mctx.newPage();
  await go(`${base}/dashboard`, m);
  await m.getByRole("link", { name: "Escanear" }).first().waitFor();
  await snap(m, "mobile-dashboard");
  await go(`${base}/arvores/${code}`, m);
  await snap(m, "mobile-ficha");
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check("mobile sem rolagem horizontal na ficha", !overflow);
  await m.getByRole("button", { name: "Menu" }).click();
  await m.getByRole("link", { name: "Relatórios" }).waitFor();
  check("menu mobile abre", true);
  await snap(m, "mobile-menu");
  await go(`${base}/arvores/novo`, m);
  await snap(m, "mobile-form");
  await mctx.close();

  // 14. Logout + recuperação de senha
  await go(`${base}/perfil`);
  await page.locator("header").getByRole("button").last().click();
  await page.getByRole("button", { name: "Sair" }).click();
  await page.waitForURL("**/login"); await ready();
  check("logout", true);
  await go(`${base}/esqueci-senha`);
  await fill("E-mail", "consulta@arborgest.demo");
  await page.getByRole("button", { name: "Enviar link" }).click();
  await page.getByText("Se o e-mail estiver cadastrado").waitFor();
  check("solicitação de recuperação de senha", true);
  // Sem SMTP, o link é registrado no log do servidor (informe o caminho em SERVER_LOG).
  if (process.env.SERVER_LOG) {
    await page.waitForTimeout(500);
    const link = [...fs.readFileSync(process.env.SERVER_LOG, "utf8").matchAll(/https?:\/\/\S+\/redefinir-senha\?token=[\w-]+/g)].pop()?.[0];
    await page.goto(link.replace(/^https?:\/\/[^/]+/, base));
    await fill("Nova senha", "Arbor@2026");
    await fill("Confirme a senha", "Arbor@2026");
    await page.getByRole("button", { name: "Redefinir senha" }).click();
    await page.waitForURL("**/login?redefinida=1");
    check("redefinição de senha pelo link", await page.getByText("Senha redefinida").isVisible());
  }

  // 15. Perfil Consulta: sem botões de escrita e bloqueio de rota
  await go(`${base}/login`);
  await fill("E-mail", "consulta@arborgest.demo");
  await fill("Senha", "Arbor@2026");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard"); await ready();
  await go(`${base}/arvores/${code}`);
  check("perfil Consulta não vê ações de escrita", (await page.getByRole("link", { name: "Editar" }).count()) === 0);
  await page.goto(`${base}/arvores/novo`);
  await page.waitForURL("**/sem-permissao");
  check("perfil Consulta bloqueado em /arvores/novo", await page.getByText("Acesso não permitido").isVisible());
} catch (e) {
  check("execução sem exceções", false, String(e).split("\n").slice(0, 4).join(" / "));
  await snap(page, "falha").catch(() => {});
}
check("sem erros JavaScript nas páginas", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} verificações OK`);
process.exit(failed ? 1 : 0);
