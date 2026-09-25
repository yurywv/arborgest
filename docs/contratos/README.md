# Contratos: propostas, documentos e histórico do cliente

## Propostas em PDF no contrato
- **Contrato › Nova proposta** gera uma proposta comercial em PDF (mesmo layout da Precificação), sem precisar de orçamento.
  O formulário começa em branco: título, objeto, serviços (quantidade, unidade, valor unitário), desconto, validade e condições.
- O total é recalculado no servidor (valores em centavos, desconto ≤ subtotal).
- **Nova versão** copia o conteúdo da versão escolhida; a anterior (se emitida/enviada) passa a "Substituída" e continua no histórico.
- Fluxo: Emitida → Enviada (registro manual ou e-mail com o PDF via SMTP) → Aceita (exige nome de quem aceitou) / Recusada / Cancelada.
- Propostas enviadas ou aceitas não podem ser excluídas, e o contrato que as possui também não (use o status Cancelado/Encerrado).
- O card "Propostas" do contrato também lista as propostas do orçamento de origem (Precificação).
- Permissões: `contracts:write` para emitir/enviar/registrar resultado; `contracts:read` (ou `pricing:read`) para ver e baixar o PDF.

## Documentos anexados
- Tipos: contrato assinado, aditivo, proposta assinada, contrato social/estatuto, cartão CNPJ, procuração, pedido/OC, nota fiscal,
  ART/RRT, laudo, autorização, relatório, documento ambiental, outro. O tipo é obrigatório e não vem pré-selecionado.
- Um documento pode ser vinculado a uma proposta (ex.: a proposta assinada pelo cliente).
- Até 20 MB por arquivo. Na Vercel, arquivos acima de 4 MB vão direto do navegador para o Vercel Blob (`/api/uploads/blob`)
  e só viram documento depois que o servidor valida o conteúdo gravado (extensão × assinatura do arquivo).
- Ao excluir um contrato, os documentos anexados permanecem no cliente.

## Histórico do cliente
Cliente › **Histórico**: linha do tempo por ano com propostas (emissão, envio, aceite), contratos, orçamentos e documentos
(inclusive os anexados em contratos e propostas). A aba Documentos do cliente também reúne esses anexos.

Teste: `npm run test:e2e:contracts` (23 verificações).
