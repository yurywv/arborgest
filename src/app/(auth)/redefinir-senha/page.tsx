import Link from "next/link";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Redefinir senha" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <h2 className="text-2xl font-bold text-stone-900">Nova senha</h2>
      <p className="mt-1 mb-6 text-sm text-stone-500">Mínimo de 8 caracteres, com letras e números.</p>
      {token ? <ResetForm token={token} /> : <p className="text-sm text-red-700">Link inválido.</p>}
      <p className="mt-6 text-center text-sm"><Link href="/login" className="link">Voltar ao login</Link></p>
    </>
  );
}
