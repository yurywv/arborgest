import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <p className="text-5xl font-bold text-brand-700">404</p>
        <h1 className="mt-2 text-lg font-semibold">Página não encontrada</h1>
        <p className="mt-1 text-sm text-stone-500">O registro pode ter sido removido ou o endereço está incorreto.</p>
        <Link href="/dashboard" className="btn btn-primary mt-6">Ir para o início</Link>
      </div>
    </main>
  );
}
