# Validação da lógica legada de precificação

Relatório técnico da migração da planilha **Arborent_Precificacao_final_v2.xlsx** para o *Pricing Engine v1 — LEGACY EXCEL*.
Gerado por `npx tsx scripts/pricing-parity/report.mts`. A mesma análise está no sistema em *Administração › Parâmetros de preço › Validação da lógica legada*.

## 1. Base da validação

- Planilha: `Arborent_Precificacao_final_v2.xlsx` — SHA-256 `137e10afb806ebb62ee13a1e7087202a9512cde2618c9a06ebf0c99fec2f0563`
- Resultados de referência calculados pelo próprio Microsoft Excel 16.113.2 em 2026-09-24T12:55:15.372Z (`npm run pricing:parity`, que preenche os inputs via AppleScript, recalcula e lê as células).
- Tolerância financeira: R$ 0,01 por componente; dias, pessoas e fatores exatos.
- **Resultado: 17/17 cenários idênticos ao Excel** (teste automatizado `src/lib/pricing/__tests__/parity.test.ts`).

## 2. Paridade por cenário

| Cenário | Descrição | Valores conferidos | Preço Excel | Preço sistema | Maior diferença | OK |
|---|---|---:|---:|---:|---:|:-:|
| INV-1 | Inventário média, sem hospedagem, com pedágio | 13 | R$ 31.369,92 | R$ 31.369,92 | < R$ 0,000001 | ✅ |
| INV-2 | Inventário fácil com hospedagem | 13 | R$ 19.355,23 | R$ 19.355,23 | < R$ 0,000001 | ✅ |
| INV-3 | Inventário difícil sem auxiliares (0 pessoas) | 13 | R$ 5.341,40 | R$ 5.341,40 | < R$ 0,000001 | ✅ |
| INV-4 | Inventário grande com hospedagem e 5 auxiliares | 13 | R$ 221.348,31 | R$ 221.348,31 | < R$ 0,000001 | ✅ |
| SUP-1 | Supressão fácil, licenciamento (≥10), sem caçamba | 19 | R$ 6.309,42 | R$ 6.309,42 | < R$ 0,000001 | ✅ |
| SUP-2 | Supressão média, licença 6–9, compensação, caçamba, hospedagem | 19 | R$ 25.891,67 | R$ 25.891,67 | < R$ 0,000001 | ✅ |
| SUP-3 | Supressão difícil, apenas supressão, caçamba | 19 | R$ 39.840,97 | R$ 39.840,97 | < R$ 0,000001 | ✅ |
| SUP-4 | Supressão com todos os modificadores (inclui rede elétrica +1 dia) | 19 | R$ 144.001,95 | R$ 144.001,95 | < R$ 0,000001 | ✅ |
| SUP-5 | Supressão fácil, licença 1–5, acesso difícil + úmido + concreto | 19 | R$ 2.637,26 | R$ 2.637,26 | < R$ 0,000001 | ✅ |
| SUP-6 | Supressão sem auxiliares (0 técnicos) | 19 | R$ 776,15 | R$ 776,15 | < R$ 0,000001 | ✅ |
| SUP-7 | Supressão fácil com caçamba (÷20) e compensação, sem licença | 19 | R$ 23.281,45 | R$ 23.281,45 | < R$ 0,000001 | ✅ |
| POD-1 | Poda apenas limpeza, caçamba (÷100) | 19 | R$ 10.446,07 | R$ 10.446,07 | < R$ 0,000001 | ✅ |
| POD-2 | Poda apenas raleamento, licença ≥10, caçamba, hospedagem | 19 | R$ 16.343,82 | R$ 16.343,82 | < R$ 0,000001 | ✅ |
| POD-3 | Poda limpeza + raleamento, licença, sem caçamba | 19 | R$ 29.691,12 | R$ 29.691,12 | < R$ 0,000001 | ✅ |
| POD-4 | Poda difícil com todos os modificadores | 19 | R$ 254.171,20 | R$ 254.171,20 | < R$ 0,000001 | ✅ |
| POD-5 | Poda limpeza, licença <10, acesso difícil + úmido | 19 | R$ 3.222,28 | R$ 3.222,28 | < R$ 0,000001 | ✅ |
| POD-6 | Poda raleamento sem auxiliares (0 técnicos) | 19 | R$ 498,76 | R$ 498,76 | < R$ 0,000001 | ✅ |

## 3. Divergências e regras da planilha

Nenhuma destas regras foi alterada silenciosamente: o motor v1 as reproduz e cada uma tem parâmetro/opção registrada na versão de parâmetros.

### 1. Divergência na aplicação da margem da Poda

- **Evidência:** PODA_V0!B36 = B34/(1−margem) (preço antes do imposto), mas PODA_V0!B37 = B34/(1−imposto) — usa o custo operacional (B34) e não B36. Em INVENTARIO_V0!B23 e SUPRESSAO_V0!B37 o preço final é B22/B36 ÷ (1−imposto).
- **Impacto:** A margem de 35% não é aplicada na poda: margem efetiva ≈ 0%. Cenário POD-3 (48 árvores): legado R$ 29.691,12 × padronizado R$ 45.678,65 (53,85% a mais).
- **Tratamento no sistema:** Regra configurável "Metodologia de preço da poda": A) LEGADO DA PLANILHA (padrão da versão 1.0, para paridade) ou B) METODOLOGIA PADRONIZADA. A escolha é gravada em cada versão de parâmetros; a tela avisa quando o legado está ativo e o orçamento exige alçada de diretoria (margem < 25%).
- **Recomendação:** Adotar B) após validação comercial. O motor v2 usa sempre a metodologia padronizada.

### 2. Possibilidade de zero técnicos quando auxiliares = 0

- **Evidência:** SUPRESSAO_V0!B17 e PODA_V0!B17 = dias × técnico/dia × ROUNDUP(auxiliares/4). Com B5 = 0, ROUNDUP(0/4) = 0.
- **Impacto:** Cenário SUP-6 (5 árvores, 0 auxiliares): custo técnico R$ 0,00 e preço R$ 776,15. Com mínimo de 1 técnico: R$ 1.588,59.
- **Tratamento no sistema:** Parâmetro "Quantidade mínima de técnicos por serviço" (0 = reproduz a planilha; ≥ 1 = regra revisada), gravado na versão. Com 0, o simulador exige confirmação explícita quando a equipe resulta em 0 técnicos.
- **Recomendação:** Definir mínimo = 1 (motor v2 impõe no mínimo 1).

### 3. Possibilidade de número total de pessoas = 0

- **Evidência:** Nº de pessoas = B5 + ROUNDUP(B5/4) nas três abas (INVENTARIO_V0!B9, SUPRESSAO_V0!B15, PODA_V0!B15). No inventário, porém, o custo técnico (B12) cobra sempre 1 técnico, que não é contado como pessoa.
- **Impacto:** Cenário INV-3 (100 árvores, 0 auxiliares, 40 km): 0 pessoas — deslocamento R$ 0,00 e alimentação R$ 0,00, embora o técnico seja cobrado (R$ 1.200,00). Mesmo com auxiliares, o técnico do inventário só entra como pessoa pela fórmula ⌈aux/4⌉.
- **Tratamento no sistema:** Reproduzido no motor v1; aviso com confirmação obrigatória quando pessoas = 0. O mínimo de técnicos (item 2) também corrige a contagem de pessoas.
- **Recomendação:** Motor v2: pessoas = técnicos (mínimo 1) + auxiliares, e o inventário cobra os técnicos da equipe.

### 4. Uso da proximidade de rede elétrica para adicionar um dia

- **Evidência:** SUPRESSAO_V0!B14 e PODA_V0!B14 = ROUNDUP(árvores/produtividade) + IF(rede elétrica = 1; 1; 0). O fator do modificador é 1,00.
- **Impacto:** Cenário SUP-1 (12 árvores): 2 dia(s) → 3 com rede elétrica; preço R$ 6.309,42 → R$ 8.997,41. O dia extra é somado sem produtividade e também aumenta rateio fixo, alimentação e deslocamento.
- **Tratamento no sistema:** Preservado: o modificador tem o comportamento adicional "+1 dia" (campo configurável "dias extras" em cada modificador), independente do fator.
- **Recomendação:** Manter o dia extra como parâmetro explícito; avaliar se deve ser por operação ou proporcional ao nº de árvores próximas à rede.

### 5. Modificadores cadastrados que não participam da multiplicação final

- **Evidência:** SUPRESSAO_V0!B31 = PRODUCT(IF(E17…), IF(E19…), IF(E21…), IF(E22…), IF(E23…), IF(E24…), IF(E20…)) — omite E18 (rede elétrica). PODA_V0!B30 omite E17 (rede elétrica). Todos os demais 7 modificadores de cada aba participam.
- **Impacto:** Com o fator atual (1,00) não há efeito. Se o fator de rede elétrica for alterado na planilha, a mudança seria ignorada silenciosamente.
- **Tratamento no sistema:** Cada modificador tem a marcação "Na planilha" (participa do produto no motor v1). Rede elétrica está desmarcada, reproduzindo a planilha; se seu fator ≠ 1, o motor v1 exibe aviso de fator ignorado. O motor v2 multiplica todos os modificadores ligados.
- **Recomendação:** Usar o motor v2 ou marcar "Na planilha" caso se queira aplicar um fator à rede elétrica.

### 6. Diferenças de metodologia entre Inventário, Poda e Supressão

- **Evidência:** Inventário: 1 técnico fixo no custo (B12 sem ⌈aux/4⌉), sem modificadores, sem combustível/caçamba/licença, com plaquetas + QR Code. Supressão: técnicos = ⌈aux/4⌉; licenciamento em 3 faixas (1–5 ÷5×4 h; 6–9 ÷9×6 h; ≥10 ÷10×8 h) só no tipo 1; caçamba ⌈n/20⌉ (fácil) ou ⌈n/10⌉ (média/difícil); compensação ambiental DENTRO do custo base (B30 = SUM(B17:B22)+B28), portanto multiplicada pelos modificadores. Poda: licenciamento em 2 faixas (<10 ÷5×4 h; ≥10 ÷10×8 h) por opção; caçamba pelo tipo de poda (÷100 só limpeza; ÷50 demais); fator do tipo de poda (1,07/1,00/1,05); preço sem margem (item 1). Caçamba, rateio fixo e licenciamento não são afetados pelos modificadores nas duas abas.
- **Impacto:** Cenário SUP-4 (todos os modificadores, com compensação): v1 R$ 144.001,95 × v2 R$ 141.659,91 — no v2 a compensação (valor regulatório) não é multiplicada pelos fatores operacionais e os técnicos têm mínimo 1.
- **Tratamento no sistema:** Cada serviço é um módulo próprio do Pricing Engine que reproduz exatamente sua aba; as diferenças ficam documentadas na memória de cálculo de cada item.
- **Recomendação:** Harmonizar no motor v2: compensação fora dos fatores; técnicos da equipe cobrados em todos os serviços.

### 7. Observações adicionais (sem alteração no motor v1)

- **Evidência:** Deslocamento = (km × custo/km + pedágio) × dias × PESSOAS — distância e pedágio são cobrados por pessoa, não por veículo. Produtividade difícil 0,33 árvore/dia gera ⌈1/0,33⌉ = 4 dias para 1 árvore (1/0,33 = 3,03). Rótulo "Material úmido/seco (1=úmido, 0=seco)".
- **Impacto:** Supressão difícil de 1 árvore: 4 dias. Deslocamento com 4 pessoas custa 4× o de 1 veículo.
- **Tratamento no sistema:** Reproduzido fielmente no v1 e v2 (sem mudança silenciosa).
- **Recomendação:** Revisar com a operação: custo de deslocamento por veículo e produtividade difícil = 1/3 (0,3333…).

## 4. Preço legado × preço revisado

| Cenário | v1 legado | Margem v1 | v2 padronizado | Margem v2 | Diferença |
|---|---:|---:|---:|---:|---:|
| INV-1 — Inventário média, sem hospedagem, com pedágio | R$ 31.369,92 | 35% | R$ 31.369,92 | 35% | — |
| INV-2 — Inventário fácil com hospedagem | R$ 19.355,23 | 35% | R$ 19.355,23 | 35% | — |
| INV-3 — Inventário difícil sem auxiliares (0 pessoas) | R$ 5.341,40 | 35% | R$ 5.808,12 | 35% | R$ 466,72 (8,74%) |
| INV-4 — Inventário grande com hospedagem e 5 auxiliares | R$ 221.348,31 | 35% | R$ 235.177,18 | 35% | R$ 13.828,87 (6,25%) |
| SUP-1 — Supressão fácil, licenciamento (≥10), sem caçamba | R$ 6.309,42 | 35% | R$ 6.309,42 | 35% | — |
| SUP-2 — Supressão média, licença 6–9, compensação, caçamba, hospedagem | R$ 25.891,67 | 35% | R$ 25.891,67 | 35% | — |
| SUP-3 — Supressão difícil, apenas supressão, caçamba | R$ 39.840,97 | 35% | R$ 39.840,97 | 35% | — |
| SUP-4 — Supressão com todos os modificadores (inclui rede elétrica +1 dia) | R$ 144.001,95 | 35% | R$ 141.659,91 | 35% | -R$ 2.342,04 (-1,63%) |
| SUP-5 — Supressão fácil, licença 1–5, acesso difícil + úmido + concreto | R$ 2.637,26 | 35% | R$ 2.637,26 | 35% | — |
| SUP-6 — Supressão sem auxiliares (0 técnicos) | R$ 776,15 | 35% | R$ 1.588,59 | 35% | R$ 812,44 (104,68%) |
| SUP-7 — Supressão fácil com caçamba (÷20) e compensação, sem licença | R$ 23.281,45 | 35% | R$ 22.860,69 | 35% | -R$ 420,76 (-1,81%) |
| POD-1 — Poda apenas limpeza, caçamba (÷100) | R$ 10.446,07 | 0% | R$ 16.070,87 | 35% | R$ 5.624,80 (53,85%) |
| POD-2 — Poda apenas raleamento, licença ≥10, caçamba, hospedagem | R$ 16.343,82 | 0% | R$ 25.144,34 | 35% | R$ 8.800,52 (53,85%) |
| POD-3 — Poda limpeza + raleamento, licença, sem caçamba | R$ 29.691,12 | 0% | R$ 45.678,65 | 35% | R$ 15.987,53 (53,85%) |
| POD-4 — Poda difícil com todos os modificadores | R$ 254.171,20 | 0% | R$ 391.032,62 | 35% | R$ 136.861,42 (53,85%) |
| POD-5 — Poda limpeza, licença <10, acesso difícil + úmido | R$ 3.222,28 | 0% | R$ 4.957,35 | 35% | R$ 1.735,07 (53,85%) |
| POD-6 — Poda raleamento sem auxiliares (0 técnicos) | R$ 498,76 | 0% | R$ 1.629,47 | 35% | R$ 1.130,71 (226,7%) |

Motor v2 (Arborent padronizado): metodologia padronizada na poda; mínimo de 1 técnico; todos os modificadores ligados multiplicados; compensação ambiental fora dos fatores operacionais; inventário cobra os técnicos da equipe. Ativação apenas após validação administrativa registrada.

## 5. Precisão e arredondamentos

- Cálculos em Decimal (decimal.js, 34 dígitos); nenhum float JavaScript em valores monetários.
- ⌈⌉ apenas onde a planilha usa ARREDONDAR.PARA.CIMA: dias, técnicos por auxiliares e nº de caçambas.
- Preço final e preço por árvore arredondados a centavos (meio para cima) somente no fim; intermediários com precisão total.
- Banco: dinheiro em `Decimal(14,2)`, fatores/margens em `Decimal(10,6)`; snapshot JSON com precisão total.
- Totais de orçamento/proposta somam os preços de itens já arredondados; alçadas de margem comparadas com precisão de 0,01%.
