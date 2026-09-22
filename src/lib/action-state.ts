export type ActionState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  /** Destino após sucesso; a navegação é feita no cliente (router.push) pelo ActionForm. */
  redirectTo?: string;
  /** Carimbo para o cliente reagir a submissões repetidas com o mesmo resultado. */
  ts?: number;
} | null;

/** Anexa o destino de navegação a um resultado de sucesso. */
export const withRedirect = (res: ActionState, to: string): ActionState => (res?.ok ? { ...res, redirectTo: to } : res);
