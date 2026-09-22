import { ShieldX } from "lucide-react";
import { EmptyState, LinkButton } from "@/components/ui";

export const metadata = { title: "Sem permissão" };

export default function NoPermission() {
  return (
    <div className="py-10">
      <EmptyState
        icon={ShieldX}
        title="Acesso não permitido"
        description="Seu perfil de acesso não permite abrir esta página. Fale com o administrador se precisar desta permissão."
        action={<LinkButton href="/dashboard">Voltar ao início</LinkButton>}
      />
    </div>
  );
}
