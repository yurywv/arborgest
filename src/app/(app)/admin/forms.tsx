"use client";
import type { Role, Team, User } from "@prisma/client";
import { ActionForm, Checkbox, CheckboxGroup, Field, FormActions, FormSection, SelectField, SubmitButton, TextArea } from "@/components/form";
import { ACTION_LABELS, PERMISSION_GROUPS } from "@/lib/auth/permissions";
import type { Option } from "@/lib/catalogs";
import { SETTING_DEFAULTS } from "@/lib/settings-defaults";
import { saveProfile, saveRole, saveSettings, saveTeam, saveUser } from "./actions";
import { changePassword } from "@/app/(auth)/actions";

export function UserForm({ user, roles }: { user?: User; roles: Option[] }) {
  const u: Partial<User> = user ?? {};
  return (
    <ActionForm action={saveUser.bind(null, user?.id ?? null)} className="space-y-4">
      <FormSection title="Usuário">
        <Field name="name" label="Nome" required defaultValue={u.name} />
        <Field name="email" label="E-mail" type="email" required defaultValue={u.email} autoComplete="off" />
        <Field name="phone" label="Telefone" type="tel" defaultValue={u.phone} />
        <Field name="jobTitle" label="Cargo" defaultValue={u.jobTitle} />
        <SelectField name="roleId" label="Perfil de acesso" required options={roles} defaultValue={u.roleId} />
        <Field name="password" label={user ? "Nova senha (opcional)" : "Senha inicial"} type="password" autoComplete="new-password" required={!user}
          hint={user ? "Preencha para redefinir a senha; as sessões do usuário serão encerradas." : "Mín. 8 caracteres, com letras e números."} />
        <div className="sm:col-span-2"><Checkbox name="active" label="Usuário ativo" defaultChecked={u.active ?? true} hint="Usuários inativos não conseguem entrar." /></div>
      </FormSection>
      <FormActions cancelHref="/admin/usuarios" />
    </ActionForm>
  );
}

export function TeamForm({ team, users, memberIds }: { team?: Team; users: Option[]; memberIds: string[] }) {
  const t: Partial<Team> = team ?? {};
  return (
    <ActionForm action={saveTeam.bind(null, team?.id ?? null)} className="space-y-4">
      <FormSection title="Equipe">
        <Field name="name" label="Nome" required defaultValue={t.name} />
        <div className="self-end"><Checkbox name="active" label="Equipe ativa" defaultChecked={t.active ?? true} /></div>
        <TextArea name="description" label="Descrição" rows={2} defaultValue={t.description} wrapClassName="sm:col-span-2" />
        <div className="sm:col-span-2"><CheckboxGroup name="memberIds" label="Integrantes" options={users} defaultValues={memberIds} columns={3} /></div>
      </FormSection>
      <FormActions cancelHref="/admin/equipes" />
    </ActionForm>
  );
}

export function RoleForm({ role }: { role?: Role }) {
  const r: Partial<Role> = role ?? {};
  return (
    <ActionForm action={saveRole.bind(null, role?.id ?? null)} className="space-y-4">
      <FormSection title="Perfil">
        <Field name="name" label="Nome" required defaultValue={r.name} />
        <Field name="key" label="Chave" required defaultValue={r.key} readOnly={r.isSystem} className={r.isSystem ? "bg-stone-50" : ""} hint={r.isSystem ? "Perfil padrão do sistema." : "Ex.: SUPERVISOR"} />
        <TextArea name="description" label="Descrição" rows={2} defaultValue={r.description} wrapClassName="sm:col-span-2" />
      </FormSection>
      <section className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Módulo</th><th>Permissões</th></tr></thead>
          <tbody>
            {PERMISSION_GROUPS.map((g) => (
              <tr key={g.key}>
                <td className="font-medium whitespace-nowrap">{g.label}</td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    {g.actions.map((a) => {
                      const p = `${g.key}:${a}`;
                      return (
                        <label key={p} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-stone-200 px-2.5 text-sm has-checked:border-brand-400 has-checked:bg-brand-50">
                          <input type="checkbox" name="permissions" value={p} defaultChecked={r.permissions?.includes(p)} className="size-4 accent-brand-600" />
                          {ACTION_LABELS[a]}
                        </label>
                      );
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <FormActions cancelHref="/admin/perfis" />
    </ActionForm>
  );
}

const SETTING_LABELS: Record<keyof typeof SETTING_DEFAULTS, [string, string?]> = {
  company_name: ["Nome da empresa", "Exibido no menu, relatórios e etiquetas."],
  company_document: ["CNPJ"],
  company_phone: ["Telefone"],
  company_email: ["E-mail"],
  inspection_interval_months: ["Intervalo padrão entre inspeções (meses)", "Reduzido automaticamente para árvores em condição ruim/crítica."],
  inspection_alert_days: ["Alertar inspeções com antecedência de (dias)"],
  contract_alert_days: ["Alertar vencimento de contratos com antecedência de (dias)"],
};

export function SettingsForm({ values }: { values: Record<string, string> }) {
  return (
    <ActionForm action={saveSettings} className="space-y-4" refreshOnSuccess>
      <FormSection title="Empresa e regras">
        {(Object.keys(SETTING_LABELS) as (keyof typeof SETTING_DEFAULTS)[]).map((k) => (
          <Field key={k} name={k} label={SETTING_LABELS[k][0]} hint={SETTING_LABELS[k][1]} defaultValue={values[k]}
            inputMode={k.endsWith("_days") || k.endsWith("_months") ? "numeric" : undefined} />
        ))}
      </FormSection>
      <SubmitButton>Salvar configurações</SubmitButton>
    </ActionForm>
  );
}

export function ProfileForm({ user }: { user: Pick<User, "name" | "phone" | "jobTitle" | "email"> }) {
  return (
    <ActionForm action={saveProfile} className="space-y-4" refreshOnSuccess>
      <FormSection title="Meus dados" description={user.email}>
        <Field name="name" label="Nome" required defaultValue={user.name} />
        <Field name="phone" label="Telefone" type="tel" defaultValue={user.phone} />
        <Field name="jobTitle" label="Cargo" defaultValue={user.jobTitle} />
      </FormSection>
      <SubmitButton>Salvar</SubmitButton>
    </ActionForm>
  );
}

export function PasswordForm() {
  return (
    <ActionForm action={changePassword} className="space-y-4" resetOnSuccess>
      <FormSection title="Alterar senha" description="As demais sessões abertas serão encerradas.">
        <Field name="current" label="Senha atual" type="password" autoComplete="current-password" required wrapClassName="sm:col-span-2" />
        <Field name="password" label="Nova senha" type="password" autoComplete="new-password" required />
        <Field name="confirm" label="Confirme a nova senha" type="password" autoComplete="new-password" required />
      </FormSection>
      <SubmitButton>Alterar senha</SubmitButton>
    </ActionForm>
  );
}
