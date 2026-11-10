import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

/** Minutos de validade do código (o mesmo número vai no texto do e-mail e na configuração do Better Auth). */
export const OTP_MINUTES = 10;

export type EmailTransport = "console" | "file" | "memory" | "resend";

/** Envios "guardados" quando o transporte é `memory` (testes automatizados). */
export const outbox: { email: string; code: string }[] = [];

function transport(): EmailTransport {
  const t = process.env.EMAIL_TRANSPORT;
  if (t === "console" || t === "file" || t === "memory" || t === "resend") return t;
  return process.env.NODE_ENV === "production" ? "resend" : "console";
}

/** Texto do e-mail, em português e curto. */
export const otpEmailText = (code: string) => `Seu código do Finança é ${code}. Ele vale por ${OTP_MINUTES} minutos.`;

/**
 * Envia o código de login por e-mail.
 * - desenvolvimento (padrão): imprime o código no terminal;
 * - produção (padrão): Resend (`RESEND_API_KEY` e `EMAIL_FROM`);
 * - `EMAIL_TRANSPORT=file|memory`: só para testes automatizados (o código vai para um arquivo ou para `outbox`).
 */
export async function sendOtpEmail(email: string, code: string): Promise<void> {
  switch (transport()) {
    case "console":
      console.log(`\n[Finança] Código de login para ${email}: ${code}\n`);
      return;
    case "memory":
      outbox.push({ email, code });
      return;
    case "file": {
      const file = process.env.EMAIL_FILE ?? path.resolve(".otp", "outbox.jsonl");
      await mkdir(path.dirname(file), { recursive: true });
      await appendFile(file, `${JSON.stringify({ email, code, at: new Date().toISOString() })}\n`);
      return;
    }
    case "resend": {
      const key = process.env.RESEND_API_KEY;
      const from = process.env.EMAIL_FROM;
      if (!key || !from) throw new Error("RESEND_API_KEY e EMAIL_FROM são necessários para enviar e-mails.");
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [email], subject: "Seu código do Finança", text: otpEmailText(code) }),
      });
      if (!res.ok) throw new Error(`Resend respondeu ${res.status}.`);
      return;
    }
  }
}
