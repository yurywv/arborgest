import type { Tone } from "@/components/ui";

export const ESTIMATE_STATUS: Record<string, string> = {
  RASCUNHO: "Rascunho",
  EM_ELABORACAO: "Em elaboração",
  EM_APROVACAO_INTERNA: "Em aprovação interna",
  APROVADO_INTERNAMENTE: "Aprovado internamente",
  ENVIADO_CLIENTE: "Enviado ao cliente",
  EM_NEGOCIACAO: "Em negociação",
  ACEITO: "Aceito",
  RECUSADO: "Recusado",
  CANCELADO: "Cancelado",
  EXPIRADO: "Expirado",
};
export const ESTIMATE_STATUS_TONE: Record<string, Tone> = {
  RASCUNHO: "gray", EM_ELABORACAO: "blue", EM_APROVACAO_INTERNA: "yellow", APROVADO_INTERNAMENTE: "lime", ENVIADO_CLIENTE: "violet",
  EM_NEGOCIACAO: "orange", ACEITO: "green", RECUSADO: "red", CANCELADO: "gray", EXPIRADO: "gray",
};
export const PROPOSAL_STATUS: Record<string, string> = {
  RASCUNHO: "Rascunho", EMITIDA: "Emitida", ENVIADA: "Enviada", ACEITA: "Aceita", RECUSADA: "Recusada", CANCELADA: "Cancelada", SUBSTITUIDA: "Substituída",
};
export const APPROVAL_STATUS: Record<string, string> = { PENDENTE: "Pendente", APROVADO: "Aprovado", REJEITADO: "Reprovado", CANCELADO: "Cancelado" };
export const OVERRIDE_TYPE: Record<string, string> = {
  MARGEM: "Margem alterada", CUSTO_ADICIONAL: "Custo adicional", PRECO_FINAL: "Preço final alterado",
  DESCONTO_PERCENTUAL: "Desconto (%)", DESCONTO_VALOR: "Desconto (R$)", REMOCAO: "Desconto removido",
};
export const AUDIT_ACTION: Record<string, string> = {
  CRIACAO: "Criação", ALTERACAO: "Alteração", ITEM_CRIADO: "Item incluído", ITEM_RECALCULADO: "Item recalculado", ITEM_REMOVIDO: "Item removido",
  ALTERACAO_MARGEM: "Alteração de margem", ALTERACAO_PRECO: "Mudança de preço", CUSTO_ADICIONAL: "Custo adicional", DESCONTO: "Desconto",
  SOLICITACAO_APROVACAO: "Aprovação solicitada", APROVACAO: "Aprovação", REPROVACAO: "Reprovação", APROVACAO_INVALIDADA: "Aprovação invalidada",
  ENVIO_CLIENTE: "Envio ao cliente", CANCELAMENTO: "Cancelamento", STATUS: "Mudança de status", EXPIRACAO: "Expiração", REVISAO: "Revisão criada",
  DUPLICACAO: "Duplicação", REPRECIFICACAO: "Reprecificação", PROPOSTA_GERADA: "Proposta gerada", PDF_GERADO: "PDF gerado",
  CONTRATO_CRIADO: "Contrato criado", OS_CRIADA: "OS criada", OPORTUNIDADE_ATUALIZADA: "Oportunidade atualizada", PARAMETROS: "Parâmetros alterados",
  TEXTOS_PROPOSTA: "Textos da proposta", SERVICO: "Serviço", EXCLUSAO: "Exclusão",
};
