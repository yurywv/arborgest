import {
  LayoutDashboard, Building2, Contact, Target, FileSignature, MapPinned, Trees, Map, ClipboardCheck,
  ShieldAlert, Wrench, Calculator, SlidersHorizontal, ClipboardList, CalendarDays, FileBarChart, Users, UsersRound, KeyRound, Settings, Leaf,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/auth/permissions";

export type NavItem = { href: string; label: string; icon: LucideIcon; perm: Permission };
export type NavGroup = { label?: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  { items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard:view" }] },
  {
    label: "CRM",
    items: [
      { href: "/clientes", label: "Clientes", icon: Building2, perm: "clients:read" },
      { href: "/contatos", label: "Contatos", icon: Contact, perm: "clients:read" },
      { href: "/oportunidades", label: "Oportunidades", icon: Target, perm: "opportunities:read" },
      { href: "/precificacao", label: "Precificação", icon: Calculator, perm: "pricing:read" },
      { href: "/contratos", label: "Contratos", icon: FileSignature, perm: "contracts:read" },
    ],
  },
  {
    label: "Gestão arbórea",
    items: [
      { href: "/propriedades", label: "Propriedades", icon: MapPinned, perm: "properties:read" },
      { href: "/arvores", label: "Exemplares", icon: Trees, perm: "trees:read" },
      { href: "/mapa", label: "Mapa", icon: Map, perm: "trees:read" },
      { href: "/inspecoes", label: "Inspeções", icon: ClipboardCheck, perm: "inspections:read" },
      { href: "/riscos", label: "Avaliações de risco", icon: ShieldAlert, perm: "risk:read" },
      { href: "/especies", label: "Espécies", icon: Leaf, perm: "trees:read" },
    ],
  },
  {
    label: "Operação",
    items: [
      { href: "/ordens-servico", label: "Ordens de serviço", icon: ClipboardList, perm: "workorders:read" },
      { href: "/intervencoes", label: "Intervenções", icon: Wrench, perm: "interventions:read" },
      { href: "/agenda", label: "Agenda", icon: CalendarDays, perm: "workorders:read" },
    ],
  },
  { items: [{ href: "/relatorios", label: "Relatórios", icon: FileBarChart, perm: "reports:view" }] },
  {
    label: "Administração",
    items: [
      { href: "/admin/usuarios", label: "Usuários", icon: Users, perm: "users:read" },
      { href: "/admin/equipes", label: "Equipes", icon: UsersRound, perm: "users:read" },
      { href: "/admin/perfis", label: "Perfis", icon: KeyRound, perm: "roles:manage" },
      { href: "/admin/configuracoes", label: "Configurações", icon: Settings, perm: "settings:manage" },
      { href: "/admin/precificacao", label: "Parâmetros de preço", icon: SlidersHorizontal, perm: "pricing:params" },
    ],
  },
];

export function navFor(perms: string[]): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => perms.includes(i.perm)) })).filter((g) => g.items.length);
}
