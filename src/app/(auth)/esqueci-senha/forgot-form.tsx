"use client";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { requestPasswordReset } from "../actions";

export function ForgotForm() {
  return (
    <ActionForm autoComplete="on" action={requestPasswordReset} className="space-y-4" resetOnSuccess>
      <Field name="email" label="E-mail" type="email" inputMode="email" autoComplete="email" required />
      <SubmitButton className="w-full">Enviar link</SubmitButton>
    </ActionForm>
  );
}
