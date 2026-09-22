import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; redefinida?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const sp = await searchParams;
  return (
    <>
      <h2 className="text-2xl font-bold text-stone-900">Entrar</h2>
      <p className="mt-1 mb-6 text-sm text-stone-500">Acesse com seu e-mail corporativo.</p>
      {sp.redefinida && (
        <p className="mb-4 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">Senha redefinida. Entre com a nova senha.</p>
      )}
      <LoginForm next={sp.next} />
      <p className="mt-6 text-center text-sm">
        <Link href="/esqueci-senha" className="link">Esqueci minha senha</Link>
      </p>
    </>
  );
}
