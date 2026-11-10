import { z } from "zod";
import { MAX_CENTS } from "@/lib/validate";

const cents = z.number().int().min(0).max(MAX_CENTS);
const name = z.string().trim().min(1).max(40);
const deadline = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .nullable()
  .optional();

const billOpening = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }),
  z.object({ mode: z.literal("paid") }),
  z.object({ mode: z.literal("partial"), cents }),
]);

/**
 * O que a pessoa digitou no onboarding. O cliente só manda ENTRADAS (nomes, valores, prazos, saldos
 * iniciais); a distribuição e qualquer número calculado são sempre refeitos no servidor. Campos
 * desconhecidos (inclusive um `userId`) são descartados.
 */
const draftSchema = z.object({
  weeklyLivingCents: cents,
  bills: z
    .array(
      z.object({
        name,
        amountCents: cents.min(1),
        dueDay: z.number().int().min(1).max(31),
        opening: billOpening.optional(),
      }),
    )
    .max(30),
  goals: z
    .array(
      z.object({
        name,
        targetCents: cents.min(1),
        deadline,
        weeklyCents: cents.nullable().optional(),
        isEmergency: z.boolean().optional(),
        openingCents: cents.optional(),
      }),
    )
    .max(30),
});

export const claimBodySchema = z.object({
  /** Identifica este rascunho: o mesmo `draftId` nunca grava duas vezes. */
  draftId: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
  /** Só quando a conta já tem plano: "keep" = usar o salvo; "replace" = substituir pelo novo. */
  mode: z.enum(["keep", "replace"]).optional(),
  draft: draftSchema,
});

export type ClaimBody = z.infer<typeof claimBodySchema>;
