/* Textos padrão das propostas (editáveis em Administração › Precificação › Textos da proposta). */
export const PROPOSAL_TEXT_DEFAULTS = {
  proposal_payment_terms: "50% na aprovação da proposta e 50% na conclusão dos serviços, mediante nota fiscal, com vencimento em 15 dias.",
  proposal_deadline: "Início em até 15 dias após o aceite, conforme programação acordada com o cliente.",
  proposal_conditions: "Valores com impostos inclusos. Reajuste anual pelo IPCA para contratos com duração superior a 12 meses.",
  proposal_assumptions: "Acesso livre às áreas de trabalho durante o horário comercial; apoio do cliente para isolamento de áreas quando necessário; quantidades conforme levantamento prévio.",
  proposal_exclusions: "Taxas e emolumentos de órgãos públicos, obras civis, reparos em calçadas/redes e serviços não descritos nesta proposta.",
  proposal_responsibilities: "Arborent: execução técnica conforme normas (NBR 16246), equipe habilitada, EPIs e ART quando aplicável. Cliente: autorizações de acesso, informações sobre interferências e aceite das etapas.",
} as const;

export type ProposalTextKey = keyof typeof PROPOSAL_TEXT_DEFAULTS;
export const PROPOSAL_TEXT_LABELS: Record<ProposalTextKey, string> = {
  proposal_payment_terms: "Forma de pagamento",
  proposal_deadline: "Prazo de execução",
  proposal_conditions: "Condições comerciais",
  proposal_assumptions: "Premissas",
  proposal_exclusions: "Exclusões",
  proposal_responsibilities: "Responsabilidades",
};
