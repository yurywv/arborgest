"use client";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { login } from "../actions";

export function LoginForm({ next }: { next?: string }) {
  return (
    <ActionForm autoComplete="on" action={login} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field name="email" label="E-mail" type="email" autoComplete="username" inputMode="email" required autoFocus />
      <Field name="password" label="Senha" type="password" autoComplete="current-password" required />
      <SubmitButton className="w-full">Entrar</SubmitButton>
    </ActionForm>
  );
}
