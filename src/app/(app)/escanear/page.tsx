import { requirePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { Scanner } from "./scanner";

export const metadata = { title: "Escanear QR Code" };

export default async function ScanPage() {
  await requirePermission("trees:read");
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Escanear etiqueta" subtitle="Aponte a câmera para o QR Code da árvore." />
      <Scanner />
    </div>
  );
}
