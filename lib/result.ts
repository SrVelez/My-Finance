/**
 * Resultado de uma ação que pode falhar por regra de negócio (ex.: "sem livre suficiente").
 * Em produção o Next esconde a mensagem de erros lançados em Server Actions, então
 * essas falhas voltam como valor para a tela poder mostrá-las.
 */
export type ActionResult = { ok: true } | { ok: false; error: string };

export const ok = (): ActionResult => ({ ok: true });
export const fail = (error: string): ActionResult => ({ ok: false, error });
