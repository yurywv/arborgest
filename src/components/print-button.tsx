"use client";
import { Printer } from "lucide-react";

export function PrintButton({ label = "Imprimir" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-primary no-print">
      <Printer className="size-4" /> {label}
    </button>
  );
}
