// Catálogos de domínio (valores gravados no banco + rótulos em pt-BR).
// Manter os códigos estáveis: eles são persistidos.

export type Option = { value: string; label: string };

const opts = (o: Record<string, string>): Option[] =>
  Object.entries(o).map(([value, label]) => ({ value, label }));

export function labelOf(list: Option[] | Record<string, string>, value?: string | null) {
  if (!value) return "—";
  if (Array.isArray(list)) return list.find((o) => o.value === value)?.label ?? value;
  return list[value] ?? value;
}

// ── Enums do Prisma ──
export const TREE_STATUS: Record<string, string> = {
  ATIVA: "Ativa",
  MORTA: "Morta",
  REMOVIDA: "Removida",
  TRANSPLANTADA: "Transplantada",
  SUBSTITUIDA: "Substituída",
  NAO_LOCALIZADA: "Não localizada",
};

export const CONDITION: Record<string, string> = {
  OTIMA: "Ótima",
  BOA: "Boa",
  REGULAR: "Regular",
  RUIM: "Ruim",
  CRITICA: "Crítica",
};

export const RISK_LEVEL: Record<string, string> = {
  BAIXO: "Baixo",
  MODERADO: "Moderado",
  ALTO: "Alto",
  EXTREMO: "Extremo",
};

export const PRIORITY: Record<string, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  URGENTE: "Urgente",
};

export const CONTACT_TYPE: Record<string, string> = {
  GERAL: "Geral",
  ADMINISTRATIVO: "Administrativo",
  COMERCIAL: "Comercial",
  TECNICO: "Técnico",
};

export const CLIENT_STATUS: Record<string, string> = {
  PROSPECT: "Prospect",
  ATIVO: "Ativo",
  INATIVO: "Inativo",
};

export const OPPORTUNITY_STAGE: Record<string, string> = {
  LEAD: "Lead",
  QUALIFICACAO: "Qualificação",
  VISITA: "Visita",
  PROPOSTA: "Proposta",
  NEGOCIACAO: "Negociação",
  GANHA: "Ganha",
  PERDIDA: "Perdida",
};

export const STAGE_DEFAULT_PROBABILITY: Record<string, number> = {
  LEAD: 10,
  QUALIFICACAO: 20,
  VISITA: 35,
  PROPOSTA: 50,
  NEGOCIACAO: 75,
  GANHA: 100,
  PERDIDA: 0,
};

export const CONTRACT_STATUS: Record<string, string> = {
  RASCUNHO: "Rascunho",
  ATIVO: "Ativo",
  SUSPENSO: "Suspenso",
  ENCERRADO: "Encerrado",
  CANCELADO: "Cancelado",
};

export const INTERVENTION_STATUS: Record<string, string> = {
  RECOMENDADA: "Recomendada",
  PROGRAMADA: "Programada",
  EM_EXECUCAO: "Em execução",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

export const WORK_ORDER_STATUS: Record<string, string> = {
  ABERTA: "Aberta",
  PROGRAMADA: "Programada",
  EM_EXECUCAO: "Em execução",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

// ── CRM ──
export const CLIENT_TYPES = opts({
  PJ: "Pessoa jurídica",
  PF: "Pessoa física",
  ORGAO_PUBLICO: "Órgão público",
  CONDOMINIO: "Condomínio",
});

export const SEGMENTS = opts({
  CONDOMINIO_RESIDENCIAL: "Condomínio residencial",
  CONDOMINIO_EMPRESARIAL: "Condomínio empresarial",
  INDUSTRIA: "Indústria",
  PREFEITURA: "Prefeitura / poder público",
  EDUCACAO: "Educação",
  SAUDE: "Saúde",
  VAREJO: "Varejo / shopping",
  AGRO: "Agronegócio",
  CONCESSIONARIA: "Concessionária de serviços",
  OUTRO: "Outro",
});

export const OPPORTUNITY_SOURCES = opts({
  INDICACAO: "Indicação",
  SITE: "Site",
  REDES_SOCIAIS: "Redes sociais",
  PROSPECCAO: "Prospecção ativa",
  LICITACAO: "Licitação",
  CLIENTE_ATUAL: "Cliente atual",
  EVENTO: "Evento",
  OUTRO: "Outro",
});

/** Catálogo único de serviços: oportunidades, ordens de serviço e precificação (simulador/orçamentos). */
export const SERVICE_LABELS = {
  AVALIACAO_RISCO: "Avaliação de risco",
  CONSULTORIA: "Consultoria",
  INVENTARIO: "Inventário",
  LICENCIAMENTO: "Licenciamento ambiental",
  MANEJO: "Manejo",
  MANUTENCAO: "Manutenção periódica",
  PLANTIO: "Plantio",
  PODA: "Poda",
  REMOCAO: "Remoção / supressão",
  FITOSSANIDADE: "Tratamento fitossanitário",
} as const;
export type CatalogService = keyof typeof SERVICE_LABELS;
export const SERVICES = opts(SERVICE_LABELS);

export const PERIODICITY = opts({
  AVULSO: "Avulso",
  MENSAL: "Mensal",
  BIMESTRAL: "Bimestral",
  TRIMESTRAL: "Trimestral",
  SEMESTRAL: "Semestral",
  ANUAL: "Anual",
});

export const PROPERTY_TYPES = opts({
  CONDOMINIO: "Condomínio",
  INDUSTRIA: "Indústria",
  PARQUE: "Parque",
  PRACA: "Praça",
  CAMPUS: "Campus / escola",
  HOSPITAL: "Hospital",
  SHOPPING: "Shopping / comércio",
  VIA_PUBLICA: "Via pública",
  FAZENDA: "Fazenda / área rural",
  OUTRO: "Outro",
});

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
].map((v) => ({ value: v, label: v }));

// ── Localização ──
export const COORD_SOURCES = opts({
  GPS_DISPOSITIVO: "GPS do dispositivo",
  MAPA: "Marcado no mapa",
  GNSS_RTK: "GNSS / RTK",
  IMPORTACAO: "Importação",
  MANUAL: "Digitação manual",
});

// ── Botânica ──
export const SPECIES_ORIGIN = opts({ NATIVA: "Nativa", EXOTICA: "Exótica" });

export const ID_CONFIDENCE = opts({
  ALTA: "Alta (confirmada)",
  MEDIA: "Média",
  BAIXA: "Baixa (a confirmar)",
});

// ── Local de implantação ──
export const SITE_TYPES = opts({
  CALCADA: "Calçada",
  PRACA: "Praça",
  PARQUE: "Parque",
  CONDOMINIO: "Condomínio",
  ESTACIONAMENTO: "Estacionamento",
  CANTEIRO_CENTRAL: "Canteiro central",
  JARDIM: "Jardim",
  INDUSTRIA: "Indústria",
  AREA_RURAL: "Área rural",
  APP: "APP",
  FRAGMENTO_FLORESTAL: "Fragmento florestal",
});

export const PAVEMENT_TYPES = opts({
  NENHUM: "Sem pavimento (solo/gramado)",
  CONCRETO: "Concreto",
  ASFALTO: "Asfalto",
  INTERTRAVADO: "Bloco intertravado",
  PEDRA_PORTUGUESA: "Pedra portuguesa",
  CERAMICO: "Cerâmico / ladrilho",
  PISO_DRENANTE: "Piso drenante",
  OUTRO: "Outro",
});

export const LEVEL3 = opts({ BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta" });

export const DRAINAGE = opts({ BOA: "Boa", REGULAR: "Regular", RUIM: "Ruim" });

export const SUN_EXPOSURE = opts({
  PLENO_SOL: "Pleno sol",
  MEIA_SOMBRA: "Meia-sombra",
  SOMBRA: "Sombra",
});

// ── Infraestrutura e conflitos ──
export const CONFLICTS = opts({
  REDE_ELETRICA: "Rede elétrica",
  TELECOMUNICACAO: "Telecomunicação",
  ILUMINACAO_PUBLICA: "Iluminação pública",
  POSTE: "Poste",
  MURO: "Muro",
  FACHADA: "Fachada",
  TELHADO: "Telhado",
  DRENAGEM: "Drenagem",
  TUBULACAO: "Tubulação",
  VIA_PUBLICA: "Via pública",
  ESTACIONAMENTO: "Estacionamento",
  PASSEIO: "Passeio de pedestre",
  CICLOVIA: "Ciclovia",
  PLAYGROUND: "Playground",
  EDIFICACAO: "Edificação próxima",
});

// ── Achados de inspeção por categoria ──
export const ROOT_FINDINGS = opts({
  RAIZES_APARENTES: "Raízes aparentes",
  RAIZES_CORTADAS: "Raízes cortadas",
  RAIZES_ESTRANGULANTES: "Raízes estrangulantes",
  DANOS_MECANICOS: "Danos mecânicos",
  LEVANTAMENTO_CALCADA: "Levantamento de calçada",
  INTERFERENCIA_FUNDACAO: "Interferência em fundação",
  INTERFERENCIA_TUBULACAO: "Interferência em tubulação",
  COMPACTACAO: "Compactação",
  EROSAO: "Erosão",
  EXPOSICAO_RADICULAR: "Exposição radicular",
  PODRIDAO: "Podridão aparente",
  FUNGOS: "Presença de fungos",
});

export const TRUNK_FINDINGS = opts({
  INCLINACAO: "Inclinação",
  CAVIDADES: "Cavidades",
  RACHADURAS: "Rachaduras",
  FISSURAS: "Fissuras",
  CANCROS: "Cancros",
  LESOES: "Lesões",
  PODRIDAO: "Podridão",
  FUNGOS: "Fungos",
  OCOS: "Ocos",
  DESCASCAMENTO: "Descascamento",
  BIFURCACAO: "Bifurcação",
  CODOMINANCIA: "Codominância",
  CASCA_INCLUSA: "Casca inclusa",
  BROTACOES_EPICORMICAS: "Brotações epicórmicas",
  DANOS_MECANICOS: "Danos mecânicos",
});

export const CROWN_FINDINGS = opts({
  ASSIMETRIA: "Assimetria",
  GALHOS_SECOS: "Galhos secos",
  GALHOS_QUEBRADOS: "Galhos quebrados",
  GALHOS_PENDENTES: "Galhos pendentes",
  GALHOS_CODOMINANTES: "Galhos codominantes",
  SOBRE_EDIFICACOES: "Galhos sobre edificações",
  SOBRE_VIAS: "Galhos sobre vias",
  SOBRE_ESTACIONAMENTO: "Galhos sobre estacionamento",
  REDE_ELETRICA: "Conflito com rede elétrica",
  PODA_INADEQUADA: "Poda anterior inadequada",
  PESO_LATERAL: "Excesso de peso lateral",
  BROTACOES_EPICORMICAS: "Brotações epicórmicas",
});

export const PHYTO_FINDINGS = opts({
  PRAGAS: "Pragas",
  DOENCAS: "Doenças",
  FUNGOS: "Fungos",
  CUPINS: "Cupins",
  BROCAS: "Brocas",
  DESFOLHA: "Desfolha",
  CLOROSE: "Clorose",
  NECROSE: "Necrose",
  GALHAS: "Galhas",
  PARASITAS: "Parasitas (ex.: erva-de-passarinho)",
});

export const FINDINGS_BY_CATEGORY = {
  RAIZES: { label: "Raízes", options: ROOT_FINDINGS },
  TRONCO: { label: "Tronco", options: TRUNK_FINDINGS },
  COPA: { label: "Copa", options: CROWN_FINDINGS },
  FITOSSANIDADE: { label: "Fitossanidade", options: PHYTO_FINDINGS },
} as const;

export type FindingCategoryKey = keyof typeof FINDINGS_BY_CATEGORY;

export const INSPECTION_REASONS = opts({
  ROTINA: "Inspeção de rotina",
  INVENTARIO: "Inventário / cadastro",
  SOLICITACAO_CLIENTE: "Solicitação do cliente",
  POS_TEMPESTADE: "Pós-tempestade",
  POS_INTERVENCAO: "Pós-intervenção",
  DENUNCIA: "Denúncia / ocorrência",
  LAUDO: "Elaboração de laudo",
});

// ── Risco (ISA TRAQ) ──
export const RISK_TARGETS = opts({
  PESSOAS: "Pessoas",
  VEICULOS: "Veículos",
  PREDIOS: "Prédios",
  RESIDENCIAS: "Residências",
  ESTACIONAMENTO: "Estacionamento",
  RUA: "Rua",
  PLAYGROUND: "Playground",
  REDE_ELETRICA: "Rede elétrica",
  INFRA_CRITICA: "Infraestrutura crítica",
});

export const TARGET_OCCUPANCY = opts({
  RARA: "Rara",
  OCASIONAL: "Ocasional",
  FREQUENTE: "Frequente",
  CONSTANTE: "Constante",
});

export const TREE_PARTS = opts({
  ARVORE_INTEIRA: "Árvore inteira (tombamento)",
  TRONCO: "Tronco",
  RAMO_PRINCIPAL: "Ramo principal / pernada",
  GALHO: "Galho",
  GALHO_SECO: "Galho seco",
  COPA: "Copa",
  RAIZES: "Raízes / placa radicular",
});

export const FAILURE_LIKELIHOOD = opts({
  IMPROVAVEL: "Improvável",
  POSSIVEL: "Possível",
  PROVAVEL: "Provável",
  IMINENTE: "Iminente",
});

export const IMPACT_LIKELIHOOD = opts({
  MUITO_BAIXA: "Muito baixa",
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
});

export const CONSEQUENCE = opts({
  DESPREZIVEL: "Desprezível",
  MENOR: "Menor",
  SIGNIFICATIVA: "Significativa",
  SEVERA: "Severa",
});

// ── Intervenções ──
export const INTERVENTION_TYPES = opts({
  PODA_LIMPEZA: "Poda de limpeza",
  PODA_FORMACAO: "Poda de formação",
  PODA_REDUCAO: "Poda de redução",
  PODA_ELEVACAO: "Poda de elevação",
  RETIRADA_GALHO: "Retirada de galho",
  TRATAMENTO_FITOSSANITARIO: "Tratamento fitossanitário",
  IRRIGACAO: "Irrigação",
  ADUBACAO: "Adubação",
  MANEJO_SOLO: "Manejo de solo",
  DESCOMPACTACAO: "Descompactação",
  INSTALACAO_SUPORTE: "Instalação de suporte",
  TOMOGRAFIA: "Tomografia",
  RESISTOGRAFIA: "Resistografia",
  TRANSPLANTE: "Transplante",
  REMOCAO: "Remoção",
});

// ── Arquivos ──
export const PHOTO_TYPES = opts({
  GERAL: "Geral",
  COPA: "Copa",
  TRONCO: "Tronco",
  RAIZES: "Raízes",
  DEFEITO: "Defeito",
  ANTES: "Antes",
  DEPOIS: "Depois",
  OUTRA: "Outra",
});

export const DOCUMENT_TYPES = opts({
  CONTRATO: "Contrato assinado",
  ADITIVO: "Aditivo contratual",
  PROPOSTA_ASSINADA: "Proposta assinada",
  PROPOSTA: "Proposta (outra)",
  CONTRATO_SOCIAL: "Contrato social / estatuto",
  CARTAO_CNPJ: "Cartão CNPJ",
  PROCURACAO: "Procuração / documento do representante",
  ORDEM_COMPRA: "Pedido / ordem de compra",
  NOTA_FISCAL: "Nota fiscal / comprovante",
  ART: "ART / RRT",
  LAUDO: "Laudo",
  AUTORIZACAO: "Autorização",
  RELATORIO: "Relatório",
  DOCUMENTO_AMBIENTAL: "Documento ambiental",
  PDF: "Outro",
});

export const enumOptions = (m: Record<string, string>): Option[] =>
  Object.entries(m).map(([value, label]) => ({ value, label }));

/** Ações registradas junto ao cliente em cada oportunidade. */
export const OPPORTUNITY_ACTIVITY_TYPES = opts({
  PRIMEIRO_CONTATO: "Primeiro contato",
  VISITA_PRESENCIAL: "Visita presencial",
  LIGACAO: "Chamada telefônica",
  VIDEOCONFERENCIA: "Videoconferência",
  WHATSAPP: "Contato por WhatsApp",
  EMAIL: "E-mail",
  REUNIAO: "Reunião",
  ENVIO_PROPOSTA: "Envio da proposta",
  NEGOCIACAO: "Negociação",
  HOMOLOGACAO: "Homologação",
  TRATATIVAS: "Tratativas",
  OUTRO: "Outro",
});

export const WORK_ORDER_ORIGIN = opts({ PROPOSTA: "Proposta", AVULSO: "Serviço avulso" });

export const PROPERTY_OWNERSHIP = opts({ PUBLICA: "Pública", PRIVADA: "Privada" });
