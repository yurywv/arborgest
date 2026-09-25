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

## Margem de lucro do orçamento

- Cada orçamento pode ter sua **margem de lucro (%)**, definida na criação ou no cartão *Margem de lucro* (permissão `pricing:negotiate`, motivo obrigatório, auditada). Em branco, vale a margem padrão dos parâmetros.
- Aplica-se a todos os itens sem margem ou preço próprios: preço = custo ÷ (1 − margem) ÷ (1 − imposto) — inclusive na poda legada, que passa a ter margem. Margem do item e preço definido manualmente prevalecem.
- **Margens negativas não são aceitas** (margem ≥ 0% e < 100%), e nenhum ajuste de item ou desconto pode deixar a margem efetiva de um item ajustado ou do orçamento negativa (tolerância de 0,01% para o arredondamento a centavos).
- O preço calculado pelo motor é preservado; a mudança fica em `PricingOverride` e na trilha de auditoria, e invalida aprovações já concedidas. Duplicação e revisão mantêm a margem do orçamento.
- O simulador do item mostra o preço que irá para a proposta com a margem do orçamento.

## Preenchimento, edição e registro

- **Nenhum conteúdo é sugerido**: os campos não têm textos de exemplo e o navegador não completa valores (exceto login/senha). O simulador começa sem serviço e com todos os campos em branco; o preço só é calculado quando os campos obrigatórios forem preenchidos, e "Haverá acompanhamento técnico?" exige resposta Sim/Não. A proposta é redigida pelo usuário (sem textos padrão). Campos opcionais em branco usam o valor padrão dos parâmetros, informado na dica do campo.
- **Todo orçamento é editável**, em qualquer status: incluir/alterar/excluir itens, ajustes, margem, desconto e comissão. Em orçamento aprovado/enviado, a alteração exige nova aprovação; em aceito, recusado, cancelado ou expirado, o orçamento é **reaberto** para "Em elaboração". Propostas emitidas e não enviadas ficam como substituídas; as enviadas/aceitas permanecem no histórico. Orçamentos sem proposta enviada/aceita, contrato ou OS podem ser excluídos.
- **Tudo é registrado** em `PricingAuditLog`: cada ação concluída (com valor anterior, novo e justificativa), as **tentativas recusadas** (validação, regra ou permissão, com o motivo), cálculos via API, geração de PDF e reaberturas. Consulta geral em *Administração › Parâmetros de preço › Auditoria* (filtros por ação, usuário e período) e, por orçamento, na aba *Histórico*.

## Comissão

- Cada orçamento pode ter uma **comissão (%)**, com comissionado (opcional) e motivo obrigatório (permissão `pricing:negotiate`, auditada e registrada em `PricingOverride`).
- Base de cálculo à escolha: **valor total da proposta** (preço negociado, como vendido ao cliente) ou **margem de lucro, excluídos os impostos** (receita − impostos − custo operacional; se negativa, a comissão é zero).
- É custo interno: **não altera o preço** nem aparece na proposta/PDF. A análise interna mostra comissão, resultado e margem após comissão.
- A **alçada de aprovação** e a trava de margem negativa usam a margem após a comissão. Percentual ≥ 0% e < 100%. Duplicação e revisão mantêm a comissão; alterá-la invalida aprovações já concedidas.

## Ajustes de set/2026 (versão de parâmetros 1.1)

Aplicados em produção pelo bootstrap como **nova versão de parâmetros** (a 1.0, idêntica à planilha, e os orçamentos já calculados não mudam):

| Serviço | Fácil | Média | Difícil | Muito difícil |
|---|---|---|---|---|
| Supressão (árvores/dia) | 8 — altura ≤ 3 m | 2 — altura > 3 m, local longe | 1 — altura > 3 m, local perto | 0,33 — altura > 3 m, local perto |
| Poda (árvores/dia) | 8 | 3 | 1 | 0,33 |

- **Valores regionais** (em todos os serviços): alimentação e hospedagem por pessoa/dia podem ser informadas no item; em branco valem os parâmetros. Um novo item reaproveita os valores regionais, a distância e o pedágio do último item do orçamento.
- **Caçamba** (poda e supressão): quantidade e preço unitário regionais podem ser informados; sem quantidade, vale a regra de árvores por caçamba.
- **Compensação ambiental** (supressão): mudas a plantar e valor por muda informáveis, com município e **citação da lei municipal**. O cadastro *Administração › Parâmetros de preço › Compensação municipal* guarda, por município, a lei, as mudas por árvore suprimida e o frete padrão; escolhê-lo no item preenche os campos. A proposta cita as mudas e a lei. Sem mudas informadas, vale árvores × mudas por árvore (planilha: 15 × R$ 15 + R$ 400).
- **Frete** (supressão): valor informado para a cidade, ou calculado = distância (km) × peso (t) × tarifa (R$/t·km), com frete mínimo; peso padrão = mudas × peso por muda (parâmetros). Fora dos fatores de dificuldade.
- **Acompanhamento técnico** (poda e supressão, ligado por padrão em novos itens): diária do profissional (parâmetro "diária do acompanhamento técnico") + alimentação + hospedagem (se houver) + transporte (distância × custo/km + pedágio), pelos dias da operação ou pelos dias informados. Fora dos fatores de dificuldade.
- Valores informados nunca podem ser negativos. Itens antigos (sem esses campos) continuam calculando exatamente como antes.

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
| `npm run test:unit` | Fórmulas, regras v2, validações, políticas comerciais, ajustes de set/2026 e **paridade com o Excel** (17 cenários, tolerância R$ 0,01) — 92 testes |
| `npm run pricing:parity` | Regera `src/lib/pricing/parity/excel-results.json` recalculando a planilha **no Microsoft Excel** (macOS) |
| `npx tsx scripts/pricing-parity/report.mts` | Regera o relatório `validacao-logica-legada.md` |
| `npm run test:smoke` | Todas as rotas (inclusive precificação) com cada perfil |
| `npm run test:e2e:pricing` | Fluxo completo no navegador (50 verificações), inclusive campos sem sugestão, edição de orçamento aceito, auditoria de tentativas recusadas, comissão, lei municipal, valores regionais, margem do orçamento, celular e permissões |

## Serviços do simulador = catálogo comercial (set/2026)
O simulador e os orçamentos oferecem os mesmos serviços do cadastro de oportunidades e das ordens de serviço
(catálogo único `SERVICE_LABELS`): Avaliação de risco, Consultoria, Inventário, Licenciamento ambiental, Manejo,
Manutenção periódica, Plantio, Poda, Remoção / supressão e Tratamento fitossanitário.

- **Inventário, Poda e Remoção / supressão** mantêm as fórmulas próprias (produtividade por árvore, paridade com a planilha).
- **Demais serviços — cálculo por diárias** (`services/general.ts`): dias de trabalho, técnicos e auxiliares são informados;
  mão de obra, deslocamento, alimentação, hospedagem (valores regionais opcionais) e rateio fixo seguem os parâmetros gerais;
  somam-se materiais/insumos e terceiros/taxas informados. Preço = custo ÷ (1 − margem) ÷ (1 − imposto).
  A quantidade usa a unidade do serviço (árvore, muda, visita, processo, serviço); só os serviços por árvore permitem vincular exemplares.
- O código interno da supressão continua `SUPRESSAO` (orçamentos antigos inalterados); o nome exibido passa a "Remoção / supressão".
- "Laudo técnico" foi incorporado a "Avaliação de risco" (migração atualiza oportunidades e OS existentes).
