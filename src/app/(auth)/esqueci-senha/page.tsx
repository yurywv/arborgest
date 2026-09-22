import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Recuperar senha" };

export default function ForgotPage() {
  return (
    <>
      <h2 className="text-2xl font-bold text-stone-900">Recuperar senha</h2>
      <p className="mt-1 mb-6 text-sm text-stone-500">Enviaremos um link de redefinição válido por 1 hora.</p>
      <ForgotForm />
      <p className="mt-6 text-center text-sm"><Link href="/login" className="link">Voltar ao login</Link></p>
    </>
  );
}
