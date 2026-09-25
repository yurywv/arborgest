"use client";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { resetPassword } from "../actions";

export function ResetForm({ token }: { token: string }) {
  return (
    <ActionForm autoComplete="on" action={resetPassword} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field name="password" label="Nova senha" type="password" autoComplete="new-password" required />
      <Field name="confirm" label="Confirme a senha" type="password" autoComplete="new-password" required />
      <SubmitButton className="w-full">Redefinir senha</SubmitButton>
    </ActionForm>
  );
}
