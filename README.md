# ArborGest — Gestão Arbórea Georreferenciada

CRM verticalizado para arboricultura: clientes, propriedades, **exemplares arbóreos com prontuário individual**, inspeções, avaliação de risco (ISA TRAQ), intervenções, ordens de serviço, mapa, QR Code, fotos, documentos, dashboard e relatórios (PDF/Excel/CSV). Interface em português do Brasil, mobile-first e instalável como PWA.

- [1. Arquitetura](#1-arquitetura)
- [2. Estrutura de pastas](#2-estrutura-de-pastas)
- [3. Modelo de dados](#3-modelo-de-dados)
- [4. Perfis e permissões](#4-perfis-e-permissões)
- [5. Instalação local](#5-instalação-local)
- [6. Deploy na Vercel](#6-deploy-na-vercel)
- [7. Deploy no Railway](#7-deploy-no-railway)
- [8. Armazenamento de arquivos (S3 / R2 / Supabase)](#8-armazenamento-de-arquivos)
- [9. Alertas e notificações](#9-alertas-e-notificações)
- [10. PWA, uso em campo e modo offline](#10-pwa-uso-em-campo-e-modo-offline)
- [11. Segurança](#11-segurança)
- [12. Testes e validação](#12-testes-e-validação)
- [13. Decisões técnicas e limitações conhecidas](#13-decisões-técnicas-e-limitações-conhecidas)

---

## 1. Arquitetura

| Camada | Tecnologia | Motivo |
|---|---|---|
| Aplicação | **Next.js 15 (App Router) + React 19 + TypeScript** | Um único projeto com frontend e backend (Server Components + Server Actions + Route Handlers). Deploy nativo na Vercel e simples no Railway. |
| Estilo | **Tailwind CSS 4** | Interface consistente, responsiva e leve, sem biblioteca de componentes pesada. |
| Banco | **PostgreSQL + Prisma 6** | Modelo relacional normalizado, migrations versionadas, tipos gerados. |
| Autenticação | **Sessão própria com JWT assinado (jose) em cookie httpOnly + bcrypt** | Ver [decisões](#13-decisões-técnicas-e-limitações-conhecidas). Equivalente ao Auth.js Credentials, com recuperação de senha, invalidação de sessão e RBAC sob controle total. |
| Mapas | **Leaflet + OpenStreetMap** (react-leaflet) | Gratuito, sem chave de API. Coordenadas WGS84 / EPSG:4326. |
| Arquivos | Driver **local**, **Vercel Blob** (privado) ou **S3 compatível** (AWS S3, Cloudflare R2, Supabase Storage, MinIO) | Fotos são normalizadas no servidor com `sharp` (rotação EXIF, redimensionamento, remoção de metadados). |
| QR Code | `qrcode` (servidor) + `html5-qrcode` (leitura pela câmera) | QR aponta para `/arvores/ARB-000001`. |
| Relatórios | `jspdf` + `jspdf-autotable` (PDF), `exceljs` (XLSX), CSV UTF-8 | Gerados no servidor, com os mesmos filtros da tela. |
| Gráficos | `recharts` | Dashboard. |
| Validação | `zod` | Validação de todos os formulários no servidor. |

```
Navegador / celular (PWA)
   │  HTML + RSC  ─────────────── Server Components (leitura, filtros por URL)
   │  Server Actions ─────────── validação zod → permissão → Prisma → auditoria
   │  fetch /api/uploads ─────── sharp → storage (local | S3/R2/Supabase)
   │  /api/files/* ───────────── arquivos privados (exige login)
   │  /api/relatorios/[tipo] ─── PDF / XLSX / CSV
   │  /api/qrcode/[código] ───── PNG / SVG
   ▼
middleware.ts (exige sessão válida)  →  lib/auth/session.ts (usuário ativo + versão da sessão + permissões)
   ▼
PostgreSQL (Prisma)
```

**Regras de domínio centrais**

- Cada árvore tem **código permanente** `ARB-000001`, gerado por contador atômico (`Counter`, `INSERT … ON CONFLICT`). Códigos **nunca são reutilizados** — nem após exclusão. Árvores com histórico não podem ser excluídas: usa-se o status (Removida, Morta, Substituída…).
- A tabela `Tree` guarda dados relativamente permanentes. **Histórico fica em tabelas próprias**: `TreeMeasurement` (biometria), `Inspection` + `InspectionFinding` (raízes, tronco, copa, fitossanidade), `RiskAssessment`, `Intervention`, `WorkOrder`, `Photo`, `Document`. Nada é sobrescrito.
- Campos `current*`, `lastInspectionAt`, `nextInspectionAt` em `Tree` são **cache desnormalizado** do estado mais recente (recalculado por `lib/tree-cache.ts`) para filtros rápidos no mapa e dashboard.
- **DAP = CAP / π** (automático). Multifuste: DAP equivalente = √(Σ dᵢ²). Área de copa = π · (N-S/2) · (L-O/2).
- **Risco (ISA TRAQ)**: probabilidade de falha × probabilidade de impacto → probabilidade combinada; × consequência → Baixo/Moderado/Alto/Extremo (`lib/arbo.ts`). O avaliador pode ajustar manualmente.
- Próxima inspeção padrão = intervalo configurado (12 meses) reduzido para condição Ruim (½) e Crítica (¼).

## 2. Estrutura de pastas

```
arborgest/
├─ prisma/
│  ├─ schema.prisma            # modelo relacional completo (comentado)
│  ├─ migrations/              # migrations versionadas
│  ├─ seed.ts                  # dados de demonstração (apaga dados! bloqueado em produção)
│  ├─ bootstrap.ts             # produção: perfis padrão + catálogo de espécies + primeiro administrador
│  └─ data/species-catalog.ts  # catálogo de referência (586 espécies arbóreas, nativas e exóticas)
├─ public/                     # ícones PWA, service worker (sw.js), offline.html
├─ scripts/
│  ├─ smoke-test.mjs           # 111 rotas × perfis × permissões × exportações
│  └─ generate-icons.mjs
├─ e2e/e2e.mjs                 # teste ponta a ponta com navegador real (Playwright)
├─ src/
│  ├─ middleware.ts            # exige sessão em todas as rotas privadas
│  ├─ app/
│  │  ├─ (auth)/               # login, esqueci-senha, redefinir-senha + actions
│  │  ├─ (app)/                # área autenticada (layout com menu, topo, navegação mobile)
│  │  │  ├─ dashboard/
│  │  │  ├─ clientes/ contatos/ oportunidades/ contratos/           # CRM
│  │  │  ├─ propriedades/ (setores)  arvores/  especies/  mapa/  escanear/
│  │  │  ├─ inspecoes/  riscos/  intervencoes/  ordens-servico/  agenda/
│  │  │  ├─ relatorios/  busca/  notificacoes/  perfil/
│  │  │  └─ admin/ (usuarios, equipes, perfis, configuracoes)
│  │  │     Cada módulo: page.tsx (lista), novo|nova/, [id]/, [id]/editar/, actions.ts, *-form.tsx
│  │  ├─ api/  uploads · files/[...key] · qrcode/[code] · relatorios/[tipo] · cron/notificacoes · health
│  │  └─ manifest.ts           # manifesto PWA
│  ├─ components/
│  │  ├─ ui.tsx  form.tsx  filters.tsx  tree-filters.tsx  tree-picker.tsx …
│  │  ├─ map/                  # TreeMap, LocationPicker, LocationInput (GPS)
│  │  ├─ files/                # upload de fotos (compressão no aparelho) e documentos
│  │  ├─ charts/  shell/       # gráficos; menu lateral, topo, navegação inferior
│  └─ lib/
│     ├─ auth/ (jwt, session, permissions)   actions.ts (zod + erros)   catalogs.ts (rótulos pt-BR)
│     ├─ arbo.ts (DAP, copa, matriz de risco, links GPS)   counters.ts (códigos permanentes)
│     ├─ storage.ts  uploads.ts  tree-cache.ts  tree-filters.ts  reports.ts  report-export.ts
│     └─ notifications.ts  settings.ts  audit.ts  mail.ts  rate-limit.ts  qr.ts
├─ vercel.json  railway.json  .env.example
```

## 3. Modelo de dados

```
Role 1─* User *─* Team
Client 1─* Contact | Opportunity | Contract | Property | WorkOrder | Document
Property 1─* Sector | Tree | Contract | WorkOrder | Document
Sector 1─* Tree
Species 1─* Tree
Tree 1─* TreeMeasurement | Inspection | RiskAssessment | Intervention | Photo | Document
Tree *─* WorkOrder            (OS vinculada a uma ou várias árvores)
Inspection 1─* InspectionFinding (categoria RAIZES|TRONCO|COPA|FITOSSANIDADE + código do catálogo)
WorkOrder 1─* Intervention | Photo | Document
Intervention 1─* Photo (antes/depois)
Notification, AuditLog, Setting, Counter, PasswordResetToken
```

Entidades exigidas → tabelas: User, Role, Client, Contact, Opportunity, Contract, Property, Sector, Tree, TreeMeasurement, Inspection (+InspectionFinding), RiskAssessment, Intervention, WorkOrder, Photo, Document, Species — além de Team, Notification, AuditLog, Setting, Counter e PasswordResetToken.

Listas controladas (tipos de local, pavimento, achados, alvos, tipos de intervenção etc.) ficam em `src/lib/catalogs.ts` como **códigos estáveis** + rótulos em pt-BR: adicionar um item não exige migration.

## 4. Perfis e permissões

Permissões por módulo (`ler`, `criar/editar`, `excluir`, `exportar`, `gerenciar`) editáveis em **Administração › Perfis**. Padrões:

| Perfil | Resumo |
|---|---|
| Administrador | Tudo, incluindo usuários, perfis e configurações |
| Gestor | Todo o técnico e comercial; consulta usuários |
| Técnico | Exemplares, espécies, inspeções, riscos, intervenções, OS, fotos; CRM somente leitura |
| Comercial | Clientes, contatos, oportunidades, contratos, propriedades; gestão arbórea leitura |
| Operacional | OS, intervenções e fotos; sem oportunidades/contratos |
| Consulta | Somente leitura (sem exportação) |

A verificação ocorre em três camadas: `middleware.ts` (sessão válida), páginas (`requirePermission`) e **toda server action/rota de API** (`assertPermission`). Botões sem permissão não são exibidos.

## 5. Instalação local

Pré-requisitos: **Node.js 20+** e **PostgreSQL 14+**.

```bash
git clone <repositório> arborgest && cd arborgest
npm install
cp .env.example .env          # ajuste DATABASE_URL/DIRECT_URL e gere AUTH_SECRET
npx prisma migrate deploy     # cria as tabelas
npm run db:seed               # dados de demonstração (opcional)
npm run dev                   # http://localhost:3000
```

Gerar segredo: `openssl rand -base64 32`.

**Usuários de demonstração** (senha `Arbor@2026`): `admin@`, `gestor@`, `tecnico@`, `comercial@`, `operacional@`, `consulta@` — todos em `@arborgest.demo`.

Para um ambiente real sem dados fictícios use `npm run db:bootstrap` com `ADMIN_EMAIL` e `ADMIN_PASSWORD` definidos.

**Catálogo de espécies.** O `bootstrap` (executado a cada deploy na Vercel) carrega `prisma/data/species-catalog.ts`: 586 espécies arbóreas, sendo 276 nativas do Brasil (Mata Atlântica, Cerrado, Amazônia, Caatinga, Pampa e Pantanal) e 310 exóticas usadas em arborização urbana, paisagismo, fruticultura e silvicultura no mundo. Cada espécie traz família, origem, distribuição natural, indicação de invasora no Brasil e sinônimos. Só são inseridas as espécies que ainda não existem, comparando pelo nome científico. Edições feitas no sistema não são sobrescritas. Para incluir espécies, acrescente linhas ao arquivo e faça um novo deploy, ou cadastre em *Espécies › Nova espécie*.

**Contatos.** Cada cliente pode ter vários contatos, classificados como *Geral*, *Administrativo*, *Comercial* ou *Técnico*. Um deles pode ser marcado como principal.

> GPS e câmera no celular exigem **HTTPS** (ou `localhost`). Para testar no celular em rede local, use um túnel HTTPS (ex.: `cloudflared tunnel --url http://localhost:3000`) ou o deploy de homologação.

## 6. Deploy na Vercel

Caminho mais simples (tudo pelo painel da Vercel, sem copiar credenciais de banco/arquivos):

1. Importe o repositório do GitHub em *Add New › Project*. O `vercel.json` já define **Build Command `npm run vercel-build`**, que gera o Prisma Client, aplica as migrations, executa o `bootstrap` (perfis padrão + administrador) e compila.
2. Em *Storage*, crie e conecte ao projeto:
   - **Neon (Postgres)** — injeta `DATABASE_URL` (com pooling) e `DATABASE_URL_UNPOOLED` (usada automaticamente como `DIRECT_URL` nas migrations).
   - **Blob** com acesso **Private** — injeta `BLOB_READ_WRITE_TOKEN`; o app passa a usar o driver `vercel-blob` automaticamente.
3. Em *Settings › Environment Variables* defina:
   - `AUTH_SECRET` — gere com `openssl rand -base64 32`;
   - `ADMIN_EMAIL` e `ADMIN_PASSWORD` (8+ caracteres com letras e números) — o primeiro administrador é criado no build; depois de entrar, a senha pode ser trocada em *Meu perfil* e essas variáveis podem ser removidas;
   - opcionais: `CRON_SECRET` (alertas diários via `vercel.json`), `APP_URL` (domínio próprio; sem ela usa o domínio da requisição), `SMTP_*` (e-mail de recuperação de senha).
4. Faça *Redeploy* após definir as variáveis.

Alternativas: qualquer Postgres (defina `DATABASE_URL` e `DIRECT_URL`) e armazenamento S3/R2/Supabase (`STORAGE_DRIVER=s3`, [seção 8](#8-armazenamento-de-arquivos)).

Limites: corpo de requisição ~4,5 MB por upload (fotos são comprimidas no aparelho para ~0,5–1 MB) e tempo máximo de função conforme o plano (o relatório fotográfico em PDF declara `maxDuration = 60`). O plano Hobby permite 1 execução de cron por dia.

## 7. Deploy no Railway

1. Crie um projeto no Railway e adicione **PostgreSQL**.
2. Adicione o serviço a partir do repositório (o `railway.json` já define build, start e healthcheck `/api/health`).
3. Variáveis do serviço:
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}` e `DIRECT_URL=${{Postgres.DATABASE_URL}}`
   - `AUTH_SECRET`, `APP_URL` (domínio gerado pelo Railway), `CRON_SECRET`
   - Arquivos: **opção A** `STORAGE_DRIVER=s3` + `S3_*` (recomendado); **opção B** `STORAGE_DRIVER=local` + um **Volume** montado em `/app/uploads` e `LOCAL_UPLOAD_DIR=/app/uploads`.
4. O start (`npm run start:railway`) aplica as migrations e inicia o servidor na porta `$PORT`.
5. Crie o administrador: no shell do serviço (`railway run`) execute `ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run db:bootstrap`.
6. **Cron** (opcional): crie um *Cron Job* no Railway que execute
   `curl -H "Authorization: Bearer $CRON_SECRET" https://SEU-DOMINIO/api/cron/notificacoes`.
   Sem cron, os alertas são gerados automaticamente ao abrir a central de notificações (no máx. a cada 6 h).

## 8. Armazenamento de arquivos

Arquivos são **privados**: o acesso passa por `/api/files/...`, que exige login e permissão `files:read`; no driver S3 o servidor redireciona para uma URL assinada válida por 5 minutos.

| Provedor | Variáveis |
|---|---|
| Cloudflare R2 | `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`, `S3_REGION=auto`, `S3_BUCKET`, chaves do token R2 |
| Supabase Storage | `S3_ENDPOINT=https://<projeto>.supabase.co/storage/v1/s3`, `S3_REGION=<região do projeto>`, `S3_FORCE_PATH_STYLE=true`, chaves S3 do Supabase |
| AWS S3 | `S3_REGION=sa-east-1`, `S3_BUCKET`, chaves IAM (deixe `S3_ENDPOINT` vazio) |

Mantenha o bucket **privado** (sem acesso público).

## 9. Alertas e notificações

`lib/notifications.ts` gera alertas por usuário conforme o perfil: **inspeção vencida**, **inspeções nos próximos N dias**, **intervenções prioritárias pendentes**, **OS atrasadas** e **contratos próximos do vencimento** (prazos em *Configurações*). A deduplicação por `dedupeKey` evita repetição. A estrutura está pronta para novos canais (e-mail/WhatsApp/push): basta consumir as notificações criadas.

## 10. PWA, uso em campo e modo offline

- Instalável (manifesto + ícones + service worker); atalho para **Escanear QR**, **Mapa** e **Novo exemplar**.
- Navegação inferior com botão central de **escanear QR** (uso com uma mão), botões ≥ 44 px, barra de ações fixa nos formulários, teclado numérico em campos de medida.
- **Capturar minha localização**: latitude, longitude, precisão, altitude e data/hora via GPS do aparelho, com ajuste fino tocando no mapa e links para Google Maps, Apple Maps e Waze.
- **Câmera**: botão “Câmera” abre a câmera traseira; fotos são comprimidas no aparelho antes do envio.
- **Etiquetas QR** individuais ou em lote (filtros da lista) para impressão.

**Offline (preparado para evolução):** o service worker já faz cache dos assets estáticos e mostra `offline.html` sem conexão; dados autenticados não são cacheados (evita vazamento entre usuários no mesmo aparelho). Próximo passo sugerido: fila em IndexedDB para inspeções/medições/fotos criadas offline + endpoint de sincronização idempotente (IDs gerados no cliente), reaproveitando as mesmas validações zod das server actions.

## 11. Segurança

- Senhas com bcrypt (custo 12); política mínima (8+ caracteres, letras e números).
- Sessão em cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção; `sessionVersion` invalida sessões ao trocar senha, desativar usuário ou mudar perfil.
- Limite de tentativas de login (8 falhas / 15 min por IP+e-mail) e na recuperação de senha; resposta idêntica para e-mails existentes ou não.
- Tokens de redefinição aleatórios (32 bytes), armazenados apenas como hash SHA-256, válidos por 1 h e de uso único.
- Autorização verificada no servidor em todas as ações e APIs; validação zod em todos os formulários; remoção de caracteres de controle; consultas parametrizadas (Prisma).
- Uploads: verificação de tipo real (assinatura binária), limite de tamanho, reprocessamento das imagens com `sharp` (remove EXIF/GPS embutido e conteúdo malicioso), chaves aleatórias, proteção contra *path traversal*, arquivos servidos com `nosniff` e CSP restritiva.
- Cabeçalhos: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (câmera/GPS só na própria origem).
- CSV com neutralização de fórmulas (CSV injection).
- Log de auditoria (login, falhas, criação/edição/exclusão, uploads, exportações) em *Configurações*.

## 12. Testes e validação

```bash
npm run typecheck                                   # TypeScript
npm run build                                       # build de produção
npm run start                                       # em outro terminal
npm run test:smoke -- http://localhost:3000         # 111 rotas + permissões dos 6 perfis + exportações
npx playwright install chromium                     # uma vez
SERVER_LOG=caminho/do/log npm run test:e2e -- http://localhost:3000 e2e/screenshots
```

O E2E (Chromium real, desktop e iPhone) cobre: login/erro de senha, validação de formulário e CNPJ, cliente, propriedade, setor, exemplar com **GPS** e **DAP automático**, **upload de foto** (e rejeição de arquivo falso), inspeção com achados + intervenção recomendada, **matriz de risco**, OS e conclusão, histórico, **QR Code**, **filtros do mapa** e popup, busca por código, PDF fotográfico, **layout mobile** (sem rolagem horizontal, menu), logout, **recuperação e redefinição de senha** e **bloqueio por perfil**.

## 13. Decisões técnicas e limitações conhecidas

- **Autenticação própria em vez do Auth.js**: o Auth.js v5 ainda é beta e o provedor *Credentials* não cobre recuperação de senha, invalidação de sessões nem RBAC; a solução própria (jose + bcrypt, ~150 linhas em `lib/auth`) é simples de auditar, roda no Edge (middleware) e não tem dependências de sessão no banco. Login social pode ser adicionado depois com Auth.js sem mudar o modelo.
- **Sem `loading.tsx` no grupo autenticado**: no Next.js 15.5 em produção, um `loading.tsx` no grupo `(app)` fazia a navegação pós-*server action* (redirect) não concluir. As páginas são rápidas (consultas diretas), então optou-se por removê-lo.
- **Limitador de tentativas em memória**: adequado para uma instância. Com várias instâncias, trocar por Redis/Upstash em `lib/rate-limit.ts`.
- **Tiles do OpenStreetMap**: uso moderado é permitido pela política do OSM; para alto volume, use um provedor de tiles (MapTiler, Stadia) trocando a URL em `components/map/*`.
- **Mapa com muitos pontos**: marcadores circulares leves suportam milhares de árvores; para dezenas de milhares, adicionar *clustering* (leaflet.markercluster) e carregamento por área visível.
- **Fuso horário**: datas exibidas e interpretadas em `America/Sao_Paulo`.
