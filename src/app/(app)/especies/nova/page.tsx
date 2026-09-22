import { requirePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { SpeciesForm } from "../species-form";

export const metadata = { title: "Nova espécie" };

export default async function NewSpecies() {
  await requirePermission("species:write");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nova espécie" back={{ href: "/especies", label: "Espécies" }} />
      <SpeciesForm />
    </div>
  );
}
