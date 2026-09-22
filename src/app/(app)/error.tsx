"use client";
import { AlertTriangle } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-md p-6 text-center">
      <AlertTriangle className="mx-auto size-10 text-amber-500" />
      <h1 className="mt-3 font-semibold">Algo deu errado</h1>
      <p className="mt-1 text-sm text-stone-500">Não foi possível carregar esta página.{error.digest ? ` (ref. ${error.digest})` : ""}</p>
      <button onClick={reset} className="btn btn-primary mt-5">Tentar novamente</button>
    </div>
  );
}
