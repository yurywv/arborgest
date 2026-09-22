// Controle de acesso baseado em perfis (RBAC).
// As permissões de cada perfil ficam na tabela Role e podem ser editadas em Administração › Perfis.

export const PERMISSION_GROUPS = [
  { key: "dashboard", label: "Dashboard", actions: ["view"] },
  { key: "clients", label: "Clientes e contatos", actions: ["read", "write", "delete"] },
  { key: "opportunities", label: "Oportunidades", actions: ["read", "write", "delete"] },
  { key: "contracts", label: "Contratos", actions: ["read", "write", "delete"] },
  { key: "properties", label: "Propriedades e setores", actions: ["read", "write", "delete"] },
  { key: "trees", label: "Exemplares arbóreos", actions: ["read", "write", "delete"] },
  { key: "species", label: "Espécies", actions: ["write"] },
  { key: "inspections", label: "Inspeções", actions: ["read", "write", "delete"] },
  { key: "risk", label: "Avaliações de risco", actions: ["read", "write", "delete"] },
  { key: "interventions", label: "Intervenções", actions: ["read", "write", "delete"] },
  { key: "workorders", label: "Ordens de serviço", actions: ["read", "write", "delete"] },
  { key: "files", label: "Fotos e documentos", actions: ["read", "write", "delete"] },
  { key: "reports", label: "Relatórios", actions: ["view", "export"] },
  { key: "users", label: "Usuários e equipes", actions: ["read", "manage"] },
  { key: "roles", label: "Perfis de acesso", actions: ["manage"] },
  { key: "settings", label: "Configurações", actions: ["manage"] },
] as const;

export const ACTION_LABELS: Record<string, string> = {
  view: "Ver",
  read: "Ler",
  write: "Criar/editar",
  delete: "Excluir",
  export: "Exportar",
  manage: "Gerenciar",
};

export type Permission = {
  [G in (typeof PERMISSION_GROUPS)[number] as G["key"]]: `${G["key"]}:${G["actions"][number]}`;
}[(typeof PERMISSION_GROUPS)[number]["key"]];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) =>
  g.actions.map((a) => `${g.key}:${a}` as Permission),
);

const READ_ALL: Permission[] = [
  "dashboard:view", "clients:read", "opportunities:read", "contracts:read", "properties:read",
  "trees:read", "inspections:read", "risk:read", "interventions:read", "workorders:read",
  "files:read", "reports:view",
];

const without = (list: Permission[], ...remove: Permission[]) => list.filter((p) => !remove.includes(p));

export const DEFAULT_ROLES: { key: string; name: string; description: string; permissions: Permission[] }[] = [
  {
    key: "ADMIN",
    name: "Administrador",
    description: "Acesso total, incluindo usuários, perfis e configurações.",
    permissions: ALL_PERMISSIONS,
  },
  {
    key: "GESTOR",
    name: "Gestor",
    description: "Gestão técnica e comercial completa; consulta usuários.",
    permissions: without(ALL_PERMISSIONS, "users:manage", "roles:manage", "settings:manage"),
  },
  {
    key: "TECNICO",
    name: "Técnico",
    description: "Cadastro de exemplares, inspeções, riscos e intervenções em campo.",
    permissions: [
      ...READ_ALL,
      "reports:export", "trees:write", "species:write", "inspections:write", "risk:write",
      "interventions:write", "workorders:write", "files:write", "properties:write",
    ],
  },
  {
    key: "COMERCIAL",
    name: "Comercial",
    description: "CRM: clientes, contatos, oportunidades e contratos.",
    permissions: [
      ...READ_ALL,
      "reports:export", "clients:write", "opportunities:write", "opportunities:delete",
      "contracts:write", "properties:write", "files:write",
    ],
  },
  {
    key: "OPERACIONAL",
    name: "Operacional",
    description: "Execução de ordens de serviço e intervenções.",
    permissions: [
      ...without(READ_ALL, "opportunities:read", "contracts:read"),
      "workorders:write", "interventions:write", "files:write",
    ],
  },
  {
    key: "CONSULTA",
    name: "Consulta",
    description: "Somente leitura.",
    permissions: READ_ALL,
  },
];

export function hasPermission(perms: readonly string[] | undefined, p: Permission) {
  return !!perms?.includes(p);
}
