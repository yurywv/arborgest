/* Seed de demonstração — nomes e dados fictícios.
 * Executar: npm run db:seed   (idempotente: limpa os dados de negócio antes de inserir)
 */
import { PrismaClient, type Condition, type Priority, type RiskLevel, type TreeStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { DEFAULT_ROLES } from "../src/lib/auth/permissions";
import { computeRisk, crownArea, dapFromCap } from "../src/lib/arbo";
import { refreshTreeCache } from "../src/lib/tree-cache";
import { putObject } from "../src/lib/storage";
import { speciesCatalogData } from "./data/species-catalog";
import { applyPricingParamMigrations, ensurePricingSetup } from "../src/lib/pricing/store-core";
import { persistCalculation, recomputeEstimate } from "../src/lib/pricing/estimate-core";
import { calculate, SERVICES } from "../src/lib/pricing/registry";
import { dec, money } from "../src/lib/pricing/decimal";
import { PROPOSAL_TEXT_DEFAULTS } from "../src/lib/pricing/proposal-texts";
import type { PricingParams, ServiceCode } from "../src/lib/pricing/types";
import type { PricingEstimateStatus, ProposalStatus } from "@prisma/client";

const db = new PrismaClient();

// RNG determinístico (mulberry32) para dados reproduzíveis
let seed = 20260922;
function rnd() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const between = (a: number, b: number, d = 1) => Math.round((a + rnd() * (b - a)) * 10 ** d) / 10 ** d;
const pickN = <T,>(a: readonly T[], n: number) => [...a].sort(() => rnd() - 0.5).slice(0, n);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000);

// Espécies usadas nas árvores de demonstração (todas presentes no catálogo de referência)
const DEMO_SPECIES = [
  "Tipuana tipu", "Handroanthus chrysotrichus", "Handroanthus impetiginosus", "Cenostigma pluviosum", "Paubrasilia echinata",
  "Ficus benjamina", "Licania tomentosa", "Delonix regia", "Syzygium cumini", "Leucaena leucocephala", "Schinus terebinthifolia",
  "Jacaranda mimosifolia", "Mangifera indica", "Ceiba speciosa", "Peltophorum dubium", "Lagerstroemia indica",
  "Syagrus romanzoffiana", "Eucalyptus grandis", "Pinus elliottii", "Tabebuia roseoalba",
];

async function placeholderPhoto(label: string, sub: string, hue: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},45%,82%)"/><stop offset="1" stop-color="hsl(${hue},35%,62%)"/></linearGradient></defs>
    <rect width="1200" height="900" fill="url(#g)"/>
    <rect y="700" width="1200" height="200" fill="hsl(95,30%,40%)"/>
    <rect x="570" y="430" width="60" height="300" rx="16" fill="#6b4a2f"/>
    <circle cx="600" cy="350" r="190" fill="hsl(130,40%,32%)"/>
    <circle cx="470" cy="420" r="120" fill="hsl(130,38%,38%)"/>
    <circle cx="730" cy="420" r="120" fill="hsl(130,38%,36%)"/>
    <text x="40" y="80" font-family="Helvetica, Arial" font-size="54" font-weight="700" fill="#1c1917">${label}</text>
    <text x="40" y="140" font-family="Helvetica, Arial" font-size="36" fill="#292524">${sub}</text>
    <text x="40" y="860" font-family="Helvetica, Arial" font-size="28" fill="#f5f5f4">Foto ilustrativa (dados de demonstração)</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 78 }).toBuffer();
}

async function main() {
  // Proteção: o seed APAGA todos os dados. Em produção exige confirmação explícita.
  if (process.env.NODE_ENV === "production" && process.env.SEED_CONFIRM_RESET !== "sim") {
    throw new Error("Seed de demonstração bloqueado em produção. Use `npm run db:bootstrap` ou defina SEED_CONFIRM_RESET=sim.");
  }
  console.log("→ limpando dados…");
  await db.$transaction([
    db.pricingAuditLog.deleteMany(), db.compensationRule.deleteMany(), db.pricingEstimate.deleteMany(), db.pricingParameterVersion.deleteMany(), db.pricingService.deleteMany(),
    db.notification.deleteMany(), db.auditLog.deleteMany(), db.photo.deleteMany(), db.document.deleteMany(),
    db.inspectionFinding.deleteMany(), db.inspection.deleteMany(), db.riskAssessment.deleteMany(),
    db.intervention.deleteMany(), db.workOrder.deleteMany(), db.treeMeasurement.deleteMany(), db.tree.deleteMany(),
    db.sector.deleteMany(), db.contract.deleteMany(), db.property.deleteMany(), db.opportunity.deleteMany(),
    db.contact.deleteMany(), db.client.deleteMany(), db.species.deleteMany(), db.passwordResetToken.deleteMany(),
    db.team.deleteMany(), db.user.deleteMany(), db.role.deleteMany(), db.counter.deleteMany(), db.setting.deleteMany(),
  ]);

  console.log("→ perfis e usuários…");
  const roles: Record<string, string> = {};
  for (const r of DEFAULT_ROLES) {
    const role = await db.role.create({ data: { ...r, isSystem: true } });
    roles[r.key] = role.id;
  }
  const hash = await bcrypt.hash("Arbor@2026", 12);
  const mkUser = (name: string, email: string, role: string, jobTitle: string, phone: string) =>
    db.user.create({ data: { name, email, roleId: roles[role], jobTitle, phone, passwordHash: hash } });
  const admin = await mkUser("Ana Administradora", "admin@arborgest.demo", "ADMIN", "Diretora", "(19) 99100-0001");
  const gestor = await mkUser("Gustavo Gestor", "gestor@arborgest.demo", "GESTOR", "Gerente técnico", "(19) 99100-0002");
  const tecnico = await mkUser("Tainá Técnica", "tecnico@arborgest.demo", "TECNICO", "Eng. florestal", "(19) 99100-0003");
  const tecnico2 = await mkUser("Rafael Ramos", "rafael@arborgest.demo", "TECNICO", "Técnico em arboricultura", "(19) 99100-0006");
  const comercial = await mkUser("Carla Comercial", "comercial@arborgest.demo", "COMERCIAL", "Executiva de contas", "(19) 99100-0004");
  const operacional = await mkUser("Otávio Operacional", "operacional@arborgest.demo", "OPERACIONAL", "Líder de equipe", "(19) 99100-0005");
  await mkUser("Cecília Consulta", "consulta@arborgest.demo", "CONSULTA", "Auditora", "(19) 99100-0007");
  const techs = [tecnico, tecnico2, gestor];

  const teamA = await db.team.create({
    data: { name: "Equipe Poda Alfa", description: "Poda e remoção com plataforma", members: { connect: [{ id: operacional.id }, { id: tecnico2.id }] } },
  });
  const teamB = await db.team.create({
    data: { name: "Equipe Manejo Beta", description: "Fitossanidade, solo e plantio", members: { connect: [{ id: tecnico.id }] } },
  });

  await db.setting.createMany({
    data: [
      { key: "company_name", value: "Verde Vivo Arboricultura" },
      { key: "company_phone", value: "(19) 3200-0000" },
      { key: "company_email", value: "contato@verdevivo.demo" },
    ],
  });

  console.log("→ espécies…");
  await db.species.createMany({ data: speciesCatalogData() });
  const species = await db.species.findMany({ where: { scientificName: { in: DEMO_SPECIES } }, orderBy: { scientificName: "asc" } });
  if (species.length !== DEMO_SPECIES.length) throw new Error("Espécies de demonstração ausentes do catálogo.");

  console.log("→ clientes, contatos, oportunidades…");
  const c1 = await db.client.create({
    data: {
      legalName: "Condomínio Residencial Jardim das Paineiras", tradeName: "Jardim das Paineiras", document: "11222333000181",
      clientType: "CONDOMINIO", segment: "CONDOMINIO_RESIDENCIAL", phone: "(19) 3251-1000", email: "sindico@paineiras.demo",
      address: "Rua das Paineiras, 1200", district: "Parque Taquaral", city: "Campinas", state: "SP", zipCode: "13087-000",
      status: "ATIVO", notes: "Contrato anual de manejo. Assembleia em março.",
      contacts: {
        create: [
          { name: "Marcos Lima", type: "GERAL", jobTitle: "Síndico", mobile: "(19) 98111-2233", whatsapp: "(19) 98111-2233", email: "marcos@paineiras.demo", isPrimary: true },
          { name: "Juliana Prado", type: "ADMINISTRATIVO", jobTitle: "Administradora", phone: "(19) 3251-1001", email: "adm@paineiras.demo" },
          { name: "Sérgio Paiva", type: "TECNICO", jobTitle: "Zelador", mobile: "(19) 98111-4455", whatsapp: "(19) 98111-4455" },
        ],
      },
    },
  });
  const c2 = await db.client.create({
    data: {
      legalName: "Metalúrgica Vale Verde Ltda.", tradeName: "Vale Verde Metais", document: "45723174000110", clientType: "PJ",
      segment: "INDUSTRIA", phone: "(19) 3809-4400", email: "facilities@valeverde.demo", website: "https://valeverde.demo",
      address: "Rod. SP-101, km 8", district: "Distrito Industrial", city: "Hortolândia", state: "SP", zipCode: "13186-000",
      status: "ATIVO",
      contacts: {
        create: [
          { name: "Patrícia Souza", type: "GERAL", jobTitle: "Coordenadora de facilities", mobile: "(19) 99222-3344", whatsapp: "(19) 99222-3344", email: "patricia@valeverde.demo", isPrimary: true },
          { name: "Eduardo Nunes", type: "TECNICO", jobTitle: "Técnico de segurança", mobile: "(19) 99333-4455", email: "eduardo@valeverde.demo" },
          { name: "Luciana Ferraz", type: "COMERCIAL", jobTitle: "Compradora", phone: "(19) 3809-4410", email: "compras@valeverde.demo" },
          { name: "Fábio Moreira", type: "ADMINISTRATIVO", jobTitle: "Contas a pagar", phone: "(19) 3809-4420", email: "financeiro@valeverde.demo" },
        ],
      },
    },
  });
  const c3 = await db.client.create({
    data: {
      legalName: "Prefeitura Municipal de Vila Serena", tradeName: "PM Vila Serena", document: "46523015000135", clientType: "ORGAO_PUBLICO",
      segment: "PREFEITURA", phone: "(19) 3700-1000", email: "meioambiente@vilaserena.demo",
      address: "Praça da Matriz, s/n", district: "Centro", city: "Vila Serena", state: "SP", zipCode: "13100-000",
      status: "ATIVO", notes: "Contratação via ata de registro de preços.",
      contacts: { create: [{ name: "Helena Duarte", type: "ADMINISTRATIVO", jobTitle: "Secretária de Meio Ambiente", phone: "(19) 3700-1020", email: "helena@vilaserena.demo", isPrimary: true }] },
    },
  });
  const c4 = await db.client.create({
    data: {
      legalName: "Colégio Horizonte Educacional S/A", tradeName: "Colégio Horizonte", clientType: "PJ", segment: "EDUCACAO",
      phone: "(19) 3322-7788", email: "manutencao@horizonte.demo", city: "Valinhos", state: "SP", status: "PROSPECT",
      contacts: { create: [{ name: "Roberto Alves", type: "TECNICO", jobTitle: "Gerente de manutenção", mobile: "(19) 98877-6655", isPrimary: true }] },
    },
  });

  await db.opportunity.createMany({
    data: [
      { clientId: c4.id, description: "Inventário arbóreo e laudo de risco do campus", service: "INVENTARIO", estimatedValue: 18500, stage: "PROPOSTA", probability: 50, ownerId: comercial.id, expectedDate: daysAhead(20), source: "INDICACAO" },
      { clientId: c2.id, description: "Ampliação do contrato para o CD Sumaré", service: "MANEJO", estimatedValue: 42000, stage: "NEGOCIACAO", probability: 75, ownerId: comercial.id, expectedDate: daysAhead(35), source: "CLIENTE_ATUAL" },
      { clientId: c3.id, description: "Plantio compensatório — Parque Linear", service: "PLANTIO", estimatedValue: 27000, stage: "QUALIFICACAO", probability: 20, ownerId: gestor.id, expectedDate: daysAhead(60), source: "LICITACAO" },
      { clientId: c1.id, description: "Tomografia das paineiras do bloco A", service: "LAUDO", estimatedValue: 6800, stage: "GANHA", probability: 100, ownerId: comercial.id, expectedDate: daysAgo(15), source: "CLIENTE_ATUAL" },
      { clientId: c4.id, description: "Poda de elevação na quadra", service: "PODA", estimatedValue: 4200, stage: "LEAD", probability: 10, ownerId: comercial.id, source: "SITE" },
      { clientId: c3.id, description: "Remoção emergencial pós-tempestade", service: "REMOCAO", estimatedValue: 9500, stage: "PERDIDA", probability: 0, ownerId: gestor.id, expectedDate: daysAgo(40), source: "PROSPECCAO" },
      { clientId: c2.id, description: "Visita técnica — área verde 3", service: "CONSULTORIA", estimatedValue: 3500, stage: "VISITA", probability: 35, ownerId: comercial.id, expectedDate: daysAhead(10), source: "CLIENTE_ATUAL" },
    ],
  });

  console.log("→ propriedades e setores…");
  const propDefs = [
    { client: c1, name: "Condomínio Jardim das Paineiras", type: "CONDOMINIO", lat: -22.8712, lng: -47.0485, city: "Campinas", district: "Parque Taquaral", address: "Rua das Paineiras", number: "1200", manager: "Sr. Antônio (zelador)", area: 42000,
      sectors: [["Bloco A", -22.8707, -47.0490], ["Estacionamento Norte", -22.8702, -47.0478], ["Área de lazer", -22.8718, -47.0482]] },
    { client: c2, name: "Planta Hortolândia", type: "INDUSTRIA", lat: -22.8580, lng: -47.2200, city: "Hortolândia", district: "Distrito Industrial", address: "Rod. SP-101, km 8", number: "s/n", manager: "Patrícia Souza", area: 98000,
      sectors: [["Estacionamento Norte", -22.8574, -47.2206], ["Área Verde 1", -22.8588, -47.2192], ["Portaria", -22.8578, -47.2212]] },
    { client: c2, name: "Centro de Distribuição Sumaré", type: "INDUSTRIA", lat: -22.8210, lng: -47.2670, city: "Sumaré", district: "Jardim Industrial", address: "Av. das Indústrias", number: "450", manager: "Eduardo Nunes", area: 36000,
      sectors: [["Pátio de manobras", -22.8206, -47.2676], ["Área Verde 2", -22.8215, -47.2663]] },
    { client: c3, name: "Praça Central de Vila Serena", type: "PRACA", lat: -22.9056, lng: -47.0608, city: "Vila Serena", district: "Centro", address: "Praça da Matriz", number: "s/n", manager: "Zeladoria municipal", area: 8500,
      sectors: [["Praça Central", -22.9056, -47.0608]] },
    { client: c3, name: "Parque Linear do Ribeirão", type: "PARQUE", lat: -22.9150, lng: -47.0450, city: "Vila Serena", district: "Vale do Ribeirão", address: "Av. Beira-Rio", number: "s/n", manager: "Administração do parque", area: 120000,
      sectors: [["Área Verde 1", -22.9147, -47.0456]] },
  ];
  const props = [];
  for (const p of propDefs) {
    const prop = await db.property.create({
      data: {
        clientId: p.client.id, name: p.name, propertyType: p.type, latitude: p.lat, longitude: p.lng, city: p.city, state: "SP",
        district: p.district, address: p.address, number: p.number, localManager: p.manager, totalArea: p.area,
        sectors: { create: p.sectors.map(([name, lat, lng]) => ({ name: name as string, latitude: lat as number, longitude: lng as number, approxArea: between(800, 6000, 0) })) },
      },
      include: { sectors: true },
    });
    props.push(prop);
  }

  await db.contract.createMany({
    data: [
      { number: "CT-2026-0001", clientId: c1.id, propertyId: props[0].id, startDate: daysAgo(200), endDate: daysAhead(165), value: 38400, periodicity: "MENSAL", object: "Manejo arbóreo preventivo, inspeções semestrais e podas.", ownerId: comercial.id, status: "ATIVO" },
      { number: "CT-2026-0002", clientId: c2.id, propertyId: props[1].id, startDate: daysAgo(320), endDate: daysAhead(45), value: 96000, periodicity: "ANUAL", object: "Gestão de ativos arbóreos da planta industrial, com avaliação de risco anual.", ownerId: comercial.id, status: "ATIVO" },
      { number: "CT-2026-0003", clientId: c3.id, propertyId: props[3].id, startDate: daysAgo(90), endDate: daysAhead(275), value: 54000, periodicity: "TRIMESTRAL", object: "Inventário e manejo da arborização da Praça Central e Parque Linear.", ownerId: gestor.id, status: "ATIVO" },
    ],
  });
  await db.counter.create({ data: { key: `contract:${new Date().getFullYear()}`, value: 3 } });

  console.log("→ exemplares, medições, inspeções, riscos…");
  const distribution = [8, 7, 5, 5, 5];
  const conds: Condition[] = ["OTIMA", "BOA", "BOA", "BOA", "REGULAR", "REGULAR", "RUIM", "CRITICA"];
  const siteByProp = ["CONDOMINIO", "ESTACIONAMENTO", "INDUSTRIA", "PRACA", "PARQUE"];
  const conflictPool = ["REDE_ELETRICA", "ILUMINACAO_PUBLICA", "MURO", "TELHADO", "VIA_PUBLICA", "ESTACIONAMENTO", "PASSEIO", "EDIFICACAO", "TUBULACAO", "PLAYGROUND"];
  const findingsPool = {
    RAIZES: ["RAIZES_APARENTES", "LEVANTAMENTO_CALCADA", "COMPACTACAO", "RAIZES_CORTADAS", "EXPOSICAO_RADICULAR"],
    TRONCO: ["INCLINACAO", "CAVIDADES", "CODOMINANCIA", "CASCA_INCLUSA", "LESOES", "FISSURAS", "OCOS"],
    COPA: ["GALHOS_SECOS", "ASSIMETRIA", "SOBRE_VIAS", "REDE_ELETRICA", "PODA_INADEQUADA", "PESO_LATERAL"],
    FITOSSANIDADE: ["CUPINS", "BROCAS", "PARASITAS", "FUNGOS", "CLOROSE"],
  } as const;
  const trees: { id: string; code: string; propertyId: string; clientId: string; cond: Condition; risk?: RiskLevel }[] = [];
  let treeNo = 0;

  for (let pi = 0; pi < props.length; pi++) {
    const prop = props[pi];
    for (let k = 0; k < distribution[pi]; k++) {
      treeNo++;
      const code = `ARB-${String(treeNo).padStart(6, "0")}`;
      const sector = prop.sectors[k % prop.sectors.length];
      const sp = pick(species);
      const status: TreeStatus = treeNo === 7 ? "REMOVIDA" : treeNo === 19 ? "MORTA" : treeNo === 26 ? "NAO_LOCALIZADA" : "ATIVA";
      const cond = status === "MORTA" ? "CRITICA" : pick(conds);
      const lat = (sector.latitude ?? prop.latitude!) + between(-0.0005, 0.0005, 6);
      const lng = (sector.longitude ?? prop.longitude!) + between(-0.0005, 0.0005, 6);
      const tree = await db.tree.create({
        data: {
          code, status, propertyId: prop.id, sectorId: sector.id, responsibleId: pick(techs).id, speciesId: sp.id,
          identificationConfidence: pick(["ALTA", "ALTA", "MEDIA"]),
          latitude: lat, longitude: lng, gpsAccuracy: between(3, 12, 1), altitude: between(580, 700, 0), gpsCapturedAt: daysAgo(400 - treeNo),
          coordSource: "GPS_DISPOSITIVO", address: `${prop.address}, ${prop.number} — ${prop.city}/SP`,
          physicalRef: pick(["Junto ao meio-fio", "Próxima ao portão principal", "Canteiro lateral", "Ao lado do poste", "Centro do gramado"]),
          siteType: siteByProp[pi], pavementType: pick(["NENHUM", "CONCRETO", "INTERTRAVADO", "ASFALTO"]),
          permeableArea: between(1, 12), sidewalkWidth: pi === 3 ? between(2, 4) : null, bedWidth: between(0.8, 2.5), bedLength: between(1, 3),
          soilCompaction: pick(["BAIXA", "MEDIA", "ALTA"]), drainage: pick(["BOA", "REGULAR"]), sunExposure: pick(["PLENO_SOL", "PLENO_SOL", "MEIA_SOMBRA"]),
          conflicts: pickN(conflictPool, Math.floor(rnd() * 3)),
          createdAt: daysAgo(420 - treeNo),
        },
      });
      trees.push({ id: tree.id, code, propertyId: prop.id, clientId: prop.clientId, cond });

      // Biometria: 1ª medição (~1 ano atrás) e atual
      const cap = between(45, 260);
      const h = between(4, 18);
      for (const [when, growth] of [[380, 0], [30, 1]] as const) {
        const capN = +(cap * (1 + growth * 0.04)).toFixed(1);
        const ns = between(3, 14);
        const ew = +(ns * between(0.7, 1.2, 2)).toFixed(1);
        await db.treeMeasurement.create({
          data: {
            treeId: tree.id, measuredAt: daysAgo(when), measuredById: pick(techs).id, cap: capN, dap: dapFromCap(capN),
            measurementHeight: 1.3, stemCount: 1, totalHeight: +(h * (1 + growth * 0.05)).toFixed(1), stemHeight: between(1.5, 3.5),
            crownBaseHeight: between(2, 4.5), crownDiameterNS: ns, crownDiameterEW: ew, crownArea: crownArea(ns, ew),
          },
        });
      }

      // Inspeções: histórica + recente
      const n = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const isLast = i === n - 1;
        const when = isLast ? Math.floor(between(20, 400, 0)) : Math.floor(between(420, 800, 0));
        const c: Condition = isLast ? cond : pick(["BOA", "REGULAR", "OTIMA"] as Condition[]);
        const nextIn = c === "CRITICA" || c === "RUIM" ? 90 : c === "REGULAR" ? 180 : 365;
        const priority: Priority = c === "CRITICA" ? "URGENTE" : c === "RUIM" ? "ALTA" : c === "REGULAR" ? "MEDIA" : "BAIXA";
        const findings = (["RAIZES", "TRONCO", "COPA", "FITOSSANIDADE"] as const).flatMap((cat) =>
          pickN(findingsPool[cat], c === "OTIMA" ? 0 : c === "BOA" ? Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 2)).map((code) => ({ category: cat, code })),
        );
        await db.inspection.create({
          data: {
            treeId: tree.id, inspectedAt: daysAgo(when), inspectorId: pick(techs).id, reason: i === 0 ? "INVENTARIO" : pick(["ROTINA", "ROTINA", "SOLICITACAO_CLIENTE", "POS_TEMPESTADE"]),
            generalCondition: c, rootCondition: pick(["BOA", "REGULAR", c] as Condition[]), trunkCondition: c, crownCondition: pick(["BOA", c] as Condition[]),
            phytoCondition: pick(["BOA", "REGULAR"] as Condition[]),
            deadBranchesPercent: findings.some((f) => f.code === "GALHOS_SECOS") ? between(5, 35, 0) : null,
            trunkLeanDegrees: findings.some((f) => f.code === "INCLINACAO") ? between(8, 25, 0) : null,
            problems: findings.length ? `Observados: ${findings.map((f) => f.code.toLowerCase().replaceAll("_", " ")).join(", ")}.` : "Sem problemas relevantes.",
            recommendation: c === "CRITICA" ? "Isolar a área e avaliar remoção." : c === "RUIM" ? "Poda de redução e reavaliação em 90 dias." : c === "REGULAR" ? "Poda de limpeza e monitoramento." : "Manter monitoramento de rotina.",
            priority, nextInspectionAt: new Date(daysAgo(when).getTime() + nextIn * 86_400_000),
            findings: { create: findings },
          },
        });
      }

      // Avaliação de risco para metade das árvores
      if (treeNo % 2 === 0 || cond === "CRITICA" || cond === "RUIM") {
        const failure = cond === "CRITICA" ? "IMINENTE" : cond === "RUIM" ? "PROVAVEL" : cond === "REGULAR" ? "POSSIVEL" : "IMPROVAVEL";
        const impact = pick(["BAIXA", "MEDIA", "ALTA"]);
        const consequence = pick(["MENOR", "SIGNIFICATIVA", "SEVERA"]);
        const rating = computeRisk(failure, impact, consequence)!;
        trees[trees.length - 1].risk = rating;
        await db.riskAssessment.create({
          data: {
            treeId: tree.id, assessedAt: daysAgo(between(10, 200, 0)), assessorId: pick(techs).id,
            targets: pickN(["PESSOAS", "VEICULOS", "PREDIOS", "ESTACIONAMENTO", "RUA", "REDE_ELETRICA"], 1 + Math.floor(rnd() * 2)),
            targetOccupancy: pick(["OCASIONAL", "FREQUENTE", "CONSTANTE"]), partAtRisk: pick(["GALHO", "RAMO_PRINCIPAL", "TRONCO", "ARVORE_INTEIRA", "GALHO_SECO"]),
            failureLikelihood: failure, impactLikelihood: impact, consequence, riskRating: rating,
            recommendedAction: rating === "EXTREMO" || rating === "ALTO" ? "Intervenção prioritária: poda de redução ou remoção; isolar alvo." : "Monitorar; poda de limpeza no próximo ciclo.",
            residualRisk: rating === "EXTREMO" ? "MODERADO" : "BAIXO",
          },
        });
      }
    }
  }
  await db.counter.create({ data: { key: "tree", value: treeNo } });

  console.log("→ ordens de serviço e intervenções…");
  const year = new Date().getFullYear();
  const woDefs = [
    { idx: [0, 1, 2], service: "PODA", status: "CONCLUIDA", sched: -60, exec: -58, prio: "MEDIA", cost: 3200 },
    { idx: [8, 9, 10], service: "AVALIACAO_RISCO", status: "EM_EXECUCAO", sched: -2, prio: "ALTA", cost: 5400 },
    { idx: [15, 16], service: "REMOCAO", status: "PROGRAMADA", sched: 6, prio: "URGENTE", cost: 7800 },
    { idx: [20, 21, 22, 23], service: "MANEJO", status: "ABERTA", sched: 14, prio: "MEDIA", cost: 2600 },
    { idx: [4, 5], service: "FITOSSANIDADE", status: "PROGRAMADA", sched: -5, prio: "ALTA", cost: 1900 },
    { idx: [27], service: "PODA", status: "CANCELADA", sched: -20, prio: "BAIXA", cost: 800 },
  ] as const;
  const workOrders = [];
  for (let i = 0; i < woDefs.length; i++) {
    const d = woDefs[i];
    const ts = d.idx.map((j) => trees[j]);
    const wo = await db.workOrder.create({
      data: {
        number: `OS-${year}-${String(i + 1).padStart(4, "0")}`, clientId: ts[0].clientId, propertyId: ts[0].propertyId,
        trees: { connect: ts.map((t) => ({ id: t.id })) }, service: d.service, description: `Serviço de ${d.service.toLowerCase().replaceAll("_", " ")} nos exemplares ${ts.map((t) => t.code).join(", ")}.`,
        priority: d.prio, scheduledAt: daysAhead(d.sched), executedAt: "exec" in d ? daysAhead(d.exec) : null,
        teamId: i % 2 ? teamB.id : teamA.id, responsibleId: i % 2 ? tecnico.id : operacional.id, status: d.status, cost: d.cost,
      },
    });
    workOrders.push({ wo, trees: ts, def: d });
  }
  await db.counter.create({ data: { key: `workorder:${year}`, value: woDefs.length } });

  const typeFor = (cond: Condition) =>
    cond === "CRITICA" ? "REMOCAO" : cond === "RUIM" ? "PODA_REDUCAO" : cond === "REGULAR" ? pick(["PODA_LIMPEZA", "TRATAMENTO_FITOSSANITARIO", "DESCOMPACTACAO"]) : pick(["PODA_ELEVACAO", "ADUBACAO", "IRRIGACAO", "PODA_FORMACAO"]);
  for (const { wo, trees: ts, def } of workOrders) {
    for (const t of ts) {
      const status = def.status === "CONCLUIDA" ? "CONCLUIDA" : def.status === "CANCELADA" ? "CANCELADA" : def.status === "EM_EXECUCAO" ? "EM_EXECUCAO" : "PROGRAMADA";
      await db.intervention.create({
        data: {
          treeId: t.id, workOrderId: wo.id, type: def.service === "REMOCAO" ? "REMOCAO" : def.service === "AVALIACAO_RISCO" ? "RESISTOGRAFIA" : typeFor(t.cond),
          description: "Vinculada à OS " + wo.number, recommendedAt: daysAgo(90), priority: def.prio, scheduledAt: wo.scheduledAt,
          executedAt: wo.executedAt, responsibleId: wo.responsibleId, teamId: wo.teamId, status,
          estimatedCost: between(300, 2500, 0), actualCost: status === "CONCLUIDA" ? between(300, 2500, 0) : null,
        },
      });
    }
  }
  // Intervenções recomendadas ainda sem OS
  for (const t of trees.filter((t) => t.cond === "RUIM" || t.cond === "CRITICA" || t.cond === "REGULAR").slice(0, 12)) {
    await db.intervention.create({
      data: {
        treeId: t.id, type: typeFor(t.cond), description: "Recomendada na última inspeção.", recommendedAt: daysAgo(between(5, 60, 0)),
        priority: t.cond === "CRITICA" ? "URGENTE" : t.cond === "RUIM" ? "ALTA" : "MEDIA", status: "RECOMENDADA", estimatedCost: between(250, 3000, 0),
      },
    });
  }

  console.log("→ fotos ilustrativas…");
  for (let i = 0; i < trees.length; i += 2) {
    const t = trees[i];
    const tree = await db.tree.findUniqueOrThrow({ where: { id: t.id }, include: { species: true } });
    const buf = await placeholderPhoto(t.code, tree.species?.popularName ?? "", 90 + (i * 13) % 80);
    const key = `photos/seed/${t.code.toLowerCase()}-geral.jpg`;
    await putObject(key, buf, "image/jpeg");
    await db.photo.create({
      data: { storageKey: key, mimeType: "image/jpeg", size: buf.length, width: 1200, height: 900, type: "GERAL", description: "Vista geral do exemplar", treeId: t.id, uploadedById: tecnico.id, takenAt: daysAgo(30) },
    });
  }

  console.log("→ atualizando cache das árvores…");
  for (const t of trees) await refreshTreeCache(t.id, db);

  console.log("→ precificação, orçamentos e propostas…");
  await ensurePricingSetup(db);
  await applyPricingParamMigrations(db);
  const version = await db.pricingParameterVersion.findFirstOrThrow({ where: { active: true } });
  const pricing = version.snapshot as unknown as PricingParams;
  let estSeq = 0, propSeq = 0;
  const findOpp = (description: string) => db.opportunity.findFirstOrThrow({ where: { description } });
  const treesOf = async (propertyId: string, n: number, where: object = {}) =>
    (await db.tree.findMany({ where: { propertyId, status: "ATIVA", ...where }, orderBy: { code: "asc" }, take: n, select: { id: true } })).map((t) => t.id);

  async function seedEstimate(o: {
    clientId: string; propertyId?: string; contactId?: string; opportunityId?: string; title: string; status: PricingEstimateStatus; ago: number;
    owner: { id: string; name: string }; techId: string;
    items: { service: ServiceCode; inputs: Record<string, unknown>; description: string; treeIds?: string[] }[];
    discount?: { type: "PERCENT" | "AMOUNT"; value: string; reason: string };
    approvedBy?: { id: string }; proposal?: ProposalStatus;
  }) {
    const number = `${year}-${String(++estSeq).padStart(5, "0")}`;
    const date = daysAgo(o.ago);
    await db.$transaction(async (tx) => {
      const e = await tx.pricingEstimate.create({
        data: {
          number, title: o.title, clientId: o.clientId, propertyId: o.propertyId, contactId: o.contactId, opportunityId: o.opportunityId,
          date, validUntil: new Date(date.getTime() + 30 * 86_400_000), status: "EM_ELABORACAO", parameterVersionId: version.id,
          commercialOwnerId: o.owner.id, technicalOwnerId: o.techId, createdById: o.owner.id, createdAt: date, taxRate: pricing.general.imposto,
          commercialNotes: "Valores válidos para execução em horário comercial.",
        },
      });
      await tx.pricingAuditLog.create({ data: { userId: o.owner.id, action: "CRIACAO", entity: "PricingEstimate", entityId: e.id, estimateId: e.id, newValue: JSON.stringify({ number, versao: version.label }), createdAt: date } });
      for (const [idx, it] of o.items.entries()) {
        const treeIds = it.treeIds ?? [];
        const raw = treeIds.length ? { ...it.inputs, trees: treeIds.length } : { ...it.inputs, trees: (it.inputs.trees as number) || 2 };
        const { inputs, result } = calculate(it.service, raw, pricing);
        const item = await tx.pricingEstimateItem.create({
          data: {
            estimateId: e.id, order: idx, serviceCode: it.service, description: it.description, quantity: inputs.trees,
            inputs: inputs as never, operationalCost: money(dec(result.operationalCost)).toString(), calculatedPrice: result.finalPriceRounded,
            unitPrice: result.unitPriceRounded, negotiatedPrice: result.finalPriceRounded, effectiveMargin: dec(result.effectiveMargin).toDecimalPlaces(6).toString(),
            trees: { connect: treeIds.map((id) => ({ id })) },
          },
        });
        const calc = await persistCalculation(tx, { version, params: pricing, service: it.service, inputs, result, user: o.owner, treeIds, estimateId: e.id, itemId: item.id });
        await tx.pricingEstimateItem.update({ where: { id: item.id }, data: { currentCalculationId: calc.id } });
        await tx.pricingAuditLog.create({ data: { userId: o.owner.id, action: "ITEM_CRIADO", entity: "PricingEstimateItem", entityId: item.id, estimateId: e.id, field: "calculatedPrice", newValue: result.finalPriceRounded, createdAt: date } });
      }
      if (o.discount) await tx.pricingEstimate.update({ where: { id: e.id }, data: { discountType: o.discount.type, discountValue: o.discount.value, discountReason: o.discount.reason } });
      const t = await recomputeEstimate(tx, e.id);
      if (o.discount) {
        await tx.pricingOverride.create({
          data: {
            estimateId: e.id, type: o.discount.type === "PERCENT" ? "DESCONTO_PERCENTUAL" : "DESCONTO_VALOR", newValue: o.discount.value, reason: o.discount.reason, userId: o.owner.id,
            calculatedPrice: t.itemsTotal, negotiatedPrice: t.negotiatedTotal, difference: dec(t.negotiatedTotal.toString()).minus(dec(t.itemsTotal.toString())).toString(), createdAt: date,
          },
        });
      }
      const level = t.requiredApproval!;
      if (o.approvedBy || o.status === "EM_APROVACAO_INTERNA") {
        await tx.proposalApproval.create({
          data: {
            estimateId: e.id, level, status: o.approvedBy ? "APROVADO" : "PENDENTE", marginAtRequest: t.effectiveMargin ?? 0, totalAtRequest: t.negotiatedTotal,
            requestedById: o.owner.id, requestedAt: date, ...(o.approvedBy && { decidedById: o.approvedBy.id, decidedAt: date, comment: "Aprovado (dados de demonstração)" }),
          },
        });
      }
      const accepted = o.status === "ACEITO";
      await tx.pricingEstimate.update({
        where: { id: e.id },
        data: {
          status: o.status, ...(o.approvedBy && { approvedLevel: level, approvedAt: date }),
          ...(["ENVIADO_CLIENTE", "EM_NEGOCIACAO", "ACEITO"].includes(o.status) && { sentAt: daysAgo(o.ago - 2) }),
          ...(accepted && { acceptedAt: daysAgo(Math.max(o.ago - 6, 0)) }),
        },
      });
      if (o.proposal) {
        const items = await tx.pricingEstimateItem.findMany({ where: { estimateId: e.id }, orderBy: { order: "asc" } });
        await tx.commercialProposal.create({
          data: {
            number: `PROP-${year}-${String(++propSeq).padStart(5, "0")}`, estimateId: e.id, status: o.proposal, date: daysAgo(o.ago - 1),
            validUntil: new Date(date.getTime() + 30 * 86_400_000), clientId: o.clientId, contactId: o.contactId, propertyId: o.propertyId,
            title: `Proposta — ${o.title}`, object: `Prestação de serviços de ${items.map((i) => `${SERVICES[i.serviceCode as ServiceCode].name.toLowerCase()} (${i.quantity} árvores)`).join(", ")}.`,
            scope: items.map((i) => `• ${SERVICES[i.serviceCode as ServiceCode].name}: ${i.quantity} exemplar(es) — ${i.description}.`).join("\n"),
            deadline: PROPOSAL_TEXT_DEFAULTS.proposal_deadline, paymentTerms: PROPOSAL_TEXT_DEFAULTS.proposal_payment_terms, conditions: PROPOSAL_TEXT_DEFAULTS.proposal_conditions,
            assumptions: PROPOSAL_TEXT_DEFAULTS.proposal_assumptions, exclusions: PROPOSAL_TEXT_DEFAULTS.proposal_exclusions, responsibilities: PROPOSAL_TEXT_DEFAULTS.proposal_responsibilities,
            subtotal: t.itemsTotal, discountAmount: t.discountAmount, total: t.negotiatedTotal, createdById: o.owner.id,
            ...(o.proposal !== "EMITIDA" && { sentAt: daysAgo(o.ago - 2) }), ...(o.proposal === "ACEITA" && { acceptedAt: daysAgo(Math.max(o.ago - 6, 0)) }),
            items: {
              create: items.map((i, idx) => ({
                order: idx, serviceCode: i.serviceCode, title: SERVICES[i.serviceCode as ServiceCode].name, description: i.description, quantity: i.quantity, unit: "árvore",
                unitPrice: money(dec(i.negotiatedPrice.toString()).div(i.quantity)).toString(), total: i.negotiatedPrice, estimateItemId: i.id,
              })),
            },
          },
        });
      }
      if (o.opportunityId && accepted) await tx.opportunity.update({ where: { id: o.opportunityId }, data: { stage: "GANHA", probability: 100, estimatedValue: t.negotiatedTotal } });
    });
  }

  const c1Contact = await db.contact.findFirst({ where: { clientId: c1.id, isPrimary: true } });
  const c2Contact = await db.contact.findFirst({ where: { clientId: c2.id, isPrimary: true } });
  const oppC1 = await db.opportunity.create({ data: { clientId: c1.id, description: "Manejo 2026 — inventário, poda e supressão", service: "MANEJO", stage: "NEGOCIACAO", probability: 60, ownerId: comercial.id, source: "CLIENTE_ATUAL" } });
  await seedEstimate({
    clientId: c1.id, propertyId: props[0].id, contactId: c1Contact?.id, opportunityId: oppC1.id, title: "Manejo 2026 — áreas comuns", status: "ACEITO", ago: 20,
    owner: comercial, techId: tecnico.id, approvedBy: admin, proposal: "ACEITA",
    discount: { type: "PERCENT", value: "0.05", reason: "Cliente com contrato ativo — desconto de fidelidade." },
    items: [
      { service: "INVENTARIO", description: "Inventário georreferenciado com plaqueta e QR Code", inputs: { trees: 380, distanceKm: 40, difficulty: 2, auxiliaries: 2, lodging: false, toll: 0 } },
      { service: "PODA", description: "Poda de limpeza e raleamento dos exemplares selecionados", treeIds: await treesOf(props[0].id, 6),
        inputs: { trees: 0, distanceKm: 40, difficulty: 2, auxiliaries: 3, lodging: false, toll: 0, serviceType: 1, license: false, cacamba: true, fuelLiters: 15, modifiers: ["ALTURA"] } },
      { service: "SUPRESSAO", description: "Supressão com licenciamento de exemplares condenados", treeIds: await treesOf(props[0].id, 2, { currentRisk: { in: ["ALTO", "EXTREMO"] } }),
        inputs: { trees: 0, distanceKm: 40, difficulty: 2, auxiliaries: 4, lodging: false, toll: 0, serviceType: 1, compensation: true, cacamba: true, fuelLiters: 20, modifiers: ["REDE_ELETRICA"] } },
    ],
  });
  await seedEstimate({
    clientId: c2.id, propertyId: props[1].id, contactId: c2Contact?.id, opportunityId: (await findOpp("Ampliação do contrato para o CD Sumaré")).id,
    title: "Supressão e inventário — Planta Hortolândia", status: "EM_NEGOCIACAO", ago: 8, owner: comercial, techId: tecnico2.id, approvedBy: gestor, proposal: "ENVIADA",
    items: [
      { service: "SUPRESSAO", description: "Supressão de 7 exemplares no estacionamento, com compensação", inputs: { trees: 7, distanceKm: 60, difficulty: 2, auxiliaries: 3, lodging: false, toll: 12.4, serviceType: 1, compensation: true, cacamba: true, fuelLiters: 25, modifiers: ["ACESSO_DIFICIL", "CONCRETO"] } },
      { service: "INVENTARIO", description: "Inventário das áreas verdes 1 e 2", inputs: { trees: 150, distanceKm: 60, difficulty: 1, auxiliaries: 1, lodging: false, toll: 12.4 } },
    ],
  });
  await seedEstimate({
    clientId: c4.id, opportunityId: (await findOpp("Inventário arbóreo e laudo de risco do campus")).id, title: "Inventário do campus", status: "EM_APROVACAO_INTERNA", ago: 3,
    owner: comercial, techId: tecnico.id, discount: { type: "PERCENT", value: "0.12", reason: "Concorrência com proposta de menor valor." },
    items: [{ service: "INVENTARIO", description: "Inventário completo do campus com QR Code", inputs: { trees: 420, distanceKm: 30, difficulty: 2, auxiliaries: 2, lodging: false, toll: 0 } }],
  });
  await seedEstimate({
    clientId: c3.id, propertyId: props[3].id, title: "Poda de limpeza — Praça Central", status: "RASCUNHO", ago: 1, owner: gestor, techId: tecnico.id,
    items: [{ service: "PODA", description: "Poda de limpeza", inputs: { trees: 12, distanceKm: 25, difficulty: 1, auxiliaries: 2, lodging: false, toll: 0, serviceType: 2, license: true, cacamba: true, fuelLiters: 8, modifiers: [] } }],
  });
  await db.counter.createMany({ data: [{ key: `estimate:${year}`, value: estSeq }, { key: `proposal:${year}`, value: propSeq }] });

  await db.auditLog.create({ data: { userId: admin.id, action: "SEED", entity: "System", summary: "Dados de demonstração carregados" } });
  console.log(`✓ seed concluído: ${trees.length} árvores, ${props.length} propriedades, ${props.reduce((s, p) => s + p.sectors.length, 0)} setores.`);
  console.log("  Login: admin@arborgest.demo / Arbor@2026 (demais perfis: gestor@, tecnico@, comercial@, operacional@, consulta@)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
