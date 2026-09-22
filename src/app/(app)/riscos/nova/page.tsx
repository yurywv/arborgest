import { requirePermission } from "@/lib/auth/session";
import { treeOptions, userOptions } from "@/lib/options";
import { PageHeader } from "@/components/ui";
import { RiskForm } from "../risk-form";

export const metadata = { title: "Nova avaliação de risco" };

export default async function NewRisk({ searchParams }: { searchParams: Promise<{ arvore?: string }> }) {
  const user = await requirePermission("risk:write");
  const { arvore } = await searchParams;
  const [trees, users] = await Promise.all([treeOptions(), userOptions()]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nova avaliação de risco" subtitle={arvore} back={{ href: arvore ? `/arvores/${arvore}?aba=riscos` : "/riscos", label: "Voltar" }} />
      <RiskForm trees={trees} users={users} treeCode={arvore} meId={user.id} />
    </div>
  );
}
