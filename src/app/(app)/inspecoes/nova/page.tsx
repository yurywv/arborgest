import { requirePermission } from "@/lib/auth/session";
import { treeOptions, userOptions } from "@/lib/options";
import { PageHeader } from "@/components/ui";
import { InspectionForm } from "../inspection-form";

export const metadata = { title: "Nova inspeção" };

export default async function NewInspection({ searchParams }: { searchParams: Promise<{ arvore?: string }> }) {
  const user = await requirePermission("inspections:write");
  const { arvore } = await searchParams;
  const [trees, users] = await Promise.all([treeOptions(), userOptions()]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nova inspeção" subtitle={arvore} back={{ href: arvore ? `/arvores/${arvore}` : "/inspecoes", label: "Voltar" }} />
      <InspectionForm trees={trees} users={users} treeCode={arvore} meId={user.id} />
    </div>
  );
}
