# Módulo de Precificação e Propostas Comerciais

Substitui a planilha `Arborent_Precificacao_final_v2.xlsx` por um **Pricing Engine** parametrizável, versionado, auditável e integrado ao CRM. O relatório de migração está em [validacao-logica-legada.md](validacao-logica-legada.md).

## Fluxo

```
CRM → Cliente → Propriedade → Oportunidade → Precificar
    → Serviço (inventário / supressão / poda) → árvores cadastradas (opcional) → parâmetros operacionais
    → cálculo automático (navegador + servidor) → custos e margem → ajustes/desconto (com motivo)
    → aprovação interna por alçada → proposta (PDF) → envio ao cliente → aceite
    → oportunidade GANHA → contrato + ordens de serviço (programação)
```

| Tela | Rota |
|---|---|
| Orçamentos, indicadores do mês e aprovações pendentes | `/precificacao` |
| Novo orçamento (aceita `?cliente=`, `?propriedade=`, `?oportunidade=`) | `/precificacao/novo` |
| Orçamento: itens, totais, análise interna, desconto, fluxo | `/precificacao/[id]` (abas Resumo, Proposta, Histórico, Dados) |
| Simulador ligado ao orçamento, com seleção de árvores | `/precificacao/[id]/item` |
| Simulador avulso (não salva) | `/precificacao/simulador` |
| Cálculo salvo (snapshot imutável, verificação e memória) | `/precificacao/calculos/[id]` |
| Configurações › Precificação (parâmetros, versões, textos, serviços) | `/admin/precificacao` |
| Relatório "Validação da lógica legada" | `/admin/precificacao/validacao` |

Botões **Precificar** também aparecem na oportunidade (funil e edição), na propriedade e na aba **Orçamentos** do cliente. A busca global encontra orçamentos por número, título ou número de proposta.

## Estados do orçamento

`Rascunho → Em elaboração → Em aprovação interna → Aprovado internamente → Enviado ao cliente → Em negociação → Aceito | Recusado`, além de `Cancelado` e `Expirado` (validade vencida; verificado no acesso e no cron diário).

- Qualquer alteração de preço depois da aprovação (item, ajuste, desconto, reprecificação) volta o orçamento para **Em elaboração** e cancela aprovações pendentes (auditado).
- **Duplicar** cria um novo número; **Revisão** cria `NNNN-R2`, `-R3`… e cancela o anterior. Ambos recalculam os itens com os parâmetros vigentes (ajustes não são copiados).
- **Atualizar para parâmetros vX** recalcula explicitamente um orçamento aberto com a versão vigente (com motivo). Sem essa ação, **o orçamento nunca muda** quando os parâmetros mudam.
- Aceite: proposta ACEITA, oportunidade **GANHA** (valor = total negociado); cria-se contrato (valor negociado) e uma OS por item (serviço, árvores e data de programação).

## Pricing Engine

Código puro TypeScript em `src/lib/pricing/` (o mesmo código roda no navegador para a simulação instantânea e no servidor, que refaz o cálculo ao salvar; o valor do navegador nunca é gravado).

| Arquivo | Conteúdo |
|---|---|
| `types.ts` | Tipos de parâmetros, entradas e resultado |
| `decimal.ts` | Decimal (decimal.js, 34 dígitos) e política de arredondamento |
| `engine.ts` | Blocos comuns: dias, equipe, mão de obra, logística, modificadores, margem/imposto, memória de cálculo |
| `services/inventario.ts`, `supressao.ts`, `poda.ts` | Um módulo por serviço, reproduzindo cada aba da planilha |
| `registry.ts` | Registro de serviços (entradas zod, campos do formulário, valores padrão) |
| `defaults.ts` | Valores iniciais da planilha (usados só para criar a versão 1.0) |
| `policy.ts` | Ajustes de item, desconto, margem efetiva, alçadas |
| `params-schema.ts` | Validação dos parâmetros (imposto/margem < 100%, produtividade/fatores > 0…) e diff entre versões |
| `estimate-core.ts` | Snapshot imutável + SHA-256 canônico, gravação de cálculo, recálculo de totais |
| `store-core.ts` | Publicação de versões de parâmetros e instalação inicial |
| `proposal-pdf.ts` | PDF da proposta (sem custos, margens ou salários) |

### Fórmulas (motor v1 — LEGACY EXCEL)

- Dias = ⌈árvores ÷ produtividade⌉ (+ dias extras de modificadores: rede elétrica +1 na supressão/poda).
- Técnicos = max(⌈auxiliares ÷ 4⌉, mínimo de técnicos); pessoas = técnicos + auxiliares.
- Técnico = dias × técnico/dia × técnicos (inventário: sempre 1 técnico no v1). Auxiliares = dias × auxiliar/dia × auxiliares.
- Deslocamento = (km × custo/km + pedágio) × dias × pessoas. Alimentação/hospedagem = dias × pessoas × valor/dia.
- Rateio fixo = dias × (custo fixo mensal ÷ dias produtivos). Hora técnico = técnico/dia ÷ horas/dia.
- Inventário: + plaquetas (árvores × valor). Operacional = soma.
- Supressão: + combustível (litros × R$/L); caçamba ⌈n ÷ 20⌉ (fácil) ou ⌈n ÷ 10⌉ × valor; licença (tipo 1) = n ÷ divisor × hora técnico × horas (faixas 1–5, 6–9, ≥10); compensação = n × unidades × valor + fixo. Base = mão de obra + logística + combustível + compensação; × Π modificadores; operacional = caçamba + rateio + licença + base ajustada.
- Poda: caçamba ⌈n ÷ 100⌉ (só limpeza) ou ⌈n ÷ 50⌉; licença (<10 ÷5×4 h; ≥10 ÷10×8 h); base × fator do tipo (1,07/1,00/1,05) × Π modificadores.
- Modificadores **multiplicados** (não somados).
- Preço = operacional ÷ (1 − margem) ÷ (1 − imposto) — margem sobre o preço de venda, não markup. Na poda, a opção **"Metodologia de preço da poda"** permite o LEGADO (operacional ÷ (1 − imposto)) ou o PADRONIZADO.
- Preço por árvore = preço ÷ árvores.

**Motor v2 — Arborent padronizado** (ativável só com validação administrativa registrada): poda padronizada, mínimo 1 técnico, todos os modificadores no produto, compensação fora dos fatores, inventário cobra os técnicos da equipe. Simulador e relatório mostram **preço legado × revisado**.

### Precisão

Decimal em todos os cálculos; ⌈⌉ apenas em dias, técnicos e caçambas; preço final e unitário arredondados a centavos no fim. Banco: `Decimal(14,2)` para dinheiro, `Decimal(10,6)` para fatores/margens, snapshot JSON com precisão total.

## Versionamento e imutabilidade

- `PricingParameterVersion` (1.0, 1.1…; 2.x = motor v2) guarda o **snapshot completo** dos parâmetros + tabelas normalizadas (`PricingParameter`, `PricingProductivityRule`, `PricingModifier`, `PricingServiceType`, `PricingLicenseTier`). Toda publicação cria uma versão nova, com descrição obrigatória e diff auditado; nenhuma versão é alterada.
- Cada orçamento guarda `parameterVersionId`; cada cálculo salvo (`PricingCalculation`) guarda `snapshot` JSON (entradas, árvores, parâmetros, regras, fatores, resultado, usuário, data, versão, build do motor) e `snapshotHash` (SHA-256 canônico), além dos componentes (`PricingCalculationComponent`). A tela do cálculo **reconstrói** o resultado a partir do snapshot e confere a integridade.
- O preço calculado original nunca é apagado: ajustes vão em `PricingOverride` (preço calculado, negociado, diferença, desconto %, motivo, usuário, data/hora).
- `PricingAuditLog`: criação, alterações, mudança de preço, margem, desconto, parâmetros, aprovação, cancelamento, envio, contrato/OS — com valor anterior, novo e justificativa.

## Alçadas e permissões

Margem efetiva = (receita − impostos − custo) ÷ (receita − impostos). Limites configuráveis: ≥ 35% comercial; 25–35% gerencial; < 25% diretoria. O fluxo de aprovação pode ser desligado nos parâmetros.

| Permissão | Administrador | Gestor | Comercial | Técnico | Consulta |
|---|:-:|:-:|:-:|:-:|:-:|
| `pricing:read` ver orçamentos/propostas | ✓ | ✓ | ✓ | ✓ | ✓ |
| `pricing:write` criar/editar orçamento e proposta | ✓ | ✓ | ✓ | ✓ | |
| `pricing:negotiate` desconto, margem, custo adicional, preço final; aprova alçada comercial | ✓ | ✓ | ✓ | | |
| `pricing:approve` aprova alçada gerencial | ✓ | ✓ | | | |
| `pricing:direct` aprova alçada diretoria | ✓ | | | | |
| `pricing:costs` ver custos, margens e memória completa | ✓ | ✓ | ✓ | | |
| `pricing:params` parâmetros, versões e validação | ✓ | | | | |

As permissões são editáveis em *Administração › Perfis*. No deploy, o `bootstrap` acrescenta essas permissões aos perfis de sistema existentes **uma única vez**.

## API

- `POST /api/precificacao/calcular` — `{ service, inputs, parameterVersionId? }` → cálculo no servidor (sem `pricing:costs` retorna só quantidades e preços). 401 sem sessão, 422 para entradas inválidas.
- `GET /api/propostas/[id]/pdf` — PDF da proposta (registra auditoria).
- Mutações por server actions em `src/app/(app)/precificacao/actions.ts`, `…/proposta/actions.ts` e `src/app/(app)/admin/precificacao/actions.ts`, sempre com verificação de permissão e recálculo no servidor.

## Adicionar um serviço

1. Criar `src/lib/pricing/services/<servico>.ts` usando `commonBlock`, `modifiersBlock` e `priceBlock`.
2. Registrar em `registry.ts` (código, nome, entradas zod, campos, padrões, serviço da OS) e incluir o código em `ServiceCode`.
3. Incluir os parâmetros do serviço em `defaults.ts`/`params-schema.ts` e na tela de parâmetros.
4. Criar testes em `src/lib/pricing/__tests__`.

Orçamentos, propostas, PDF, auditoria, indicadores e integração com CRM/OS são genéricos.

## Testes

| Comando | O que verifica |
|---|---|
| `npm run test:unit` | Fórmulas, regras v2, validações, políticas comerciais e **paridade com o Excel** (17 cenários, tolerância R$ 0,01) |
| `npm run pricing:parity` | Regera `src/lib/pricing/parity/excel-results.json` recalculando a planilha **no Microsoft Excel** (macOS) |
| `npx tsx scripts/pricing-parity/report.mts` | Regera o relatório `validacao-logica-legada.md` |
| `npm run test:smoke` | Todas as rotas (inclusive precificação) com cada perfil |
| `npm run test:e2e:pricing` | Fluxo completo no navegador (30 verificações), inclusive celular e permissões |
