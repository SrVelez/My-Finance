import { db } from "@/lib/db";

/** No máximo 5 códigos por e-mail a cada 10 minutos, e pelo menos 30 s entre um e outro. */
export const OTP_SEND_WINDOW_MS = 10 * 60_000;
export const OTP_SEND_MAX = 5;
/** Só os testes e2e (várias entradas seguidas com o mesmo e-mail) mudam isto: AUTH_OTP_MIN_GAP_SECONDS=0. */
export const OTP_SEND_MIN_GAP_MS = Number(process.env.AUTH_OTP_MIN_GAP_SECONDS ?? 30) * 1000;

/**
 * Limite de envios de código POR E-MAIL (o Better Auth só limita por IP). Registra o envio quando
 * permitido. Quem chama NÃO deve avisar o usuário quando for negado: a resposta ao pedir um código
 * é sempre a mesma, para ninguém descobrir se um e-mail tem conta.
 */
export async function allowOtpSend(email: string, now: Date = new Date()): Promise<boolean> {
  const address = email.trim().toLowerCase();
  return db.$transaction(async (tx) => {
    const recent = await tx.otpSend.findMany({
      where: { email: address, createdAt: { gt: new Date(now.getTime() - OTP_SEND_WINDOW_MS) } },
      orderBy: { createdAt: "desc" },
    });
    if (recent.length >= OTP_SEND_MAX) return false;
    if (recent[0] && now.getTime() - recent[0].createdAt.getTime() < OTP_SEND_MIN_GAP_MS) return false;

    await tx.otpSend.create({ data: { email: address, createdAt: now } });
    // Limpeza oportunista: nada com mais de um dia precisa ficar guardado.
    await tx.otpSend.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60_000) } } });
    return true;
  });
}
