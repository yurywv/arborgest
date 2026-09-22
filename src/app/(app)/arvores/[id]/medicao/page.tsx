import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { findTreeId } from "@/lib/trees";
import { PageHeader } from "@/components/ui";
import { MeasurementForm } from "./measurement-form";

export const metadata = { title: "Nova medição" };

export default async function MeasurementPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("trees:write");
  const ref = await findTreeId((await params).id);
  if (!ref) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nova medição" subtitle={ref.code} back={{ href: `/arvores/${ref.code}?aba=biometria`, label: "Ficha" }} />
      <MeasurementForm treeId={ref.id} code={ref.code} />
    </div>
  );
}
