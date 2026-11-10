/** Sem sessão válida: rotas respondem 401 e páginas mandam para as Boas-vindas. */
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "Entre na sua conta para continuar.") {
    super(message);
  }
}

/**
 * Registro que não existe OU é de outra pessoa. Os dois casos são indistinguíveis de propósito
 * (404, nunca 403), para não revelar que o registro existe.
 */
export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message = "Não encontrado.") {
    super(message);
  }
}
