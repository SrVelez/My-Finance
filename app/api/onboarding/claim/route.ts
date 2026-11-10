import { UnauthorizedError } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { sanitizeDraft } from "@/lib/draft";
import { claimDraftFor } from "@/lib/services/claim";
import { serverToday } from "@/lib/services/today";
import { claimBodySchema } from "@/lib/validation/claim";

/**
 * POST /api/onboarding/claim: grava o rascunho do onboarding na conta da sessão.
 * O `userId` vem só da sessão; o corpo só traz entradas (validadas com Zod e conferidas de novo).
 */
export async function POST(request: Request) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (e) {
    if (e instanceof UnauthorizedError) return Response.json({ error: "Entre na sua conta para continuar." }, { status: 401 });
    throw e;
  }

  const body = claimBodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Plano inválido. Confira os valores e tente de novo." }, { status: 400 });

  let draft;
  try {
    // `sanitizeDraft` é a mesma conferência de sempre (limites, ids novos); o servidor recalcula tudo.
    draft = sanitizeDraft(body.data.draft);
  } catch {
    return Response.json({ error: "Plano inválido. Confira os valores e tente de novo." }, { status: 400 });
  }

  try {
    const result = await claimDraftFor(userId, body.data.draftId, draft, body.data.mode, await serverToday());
    if (result.status === "invalid") return Response.json({ error: result.error }, { status: 400 });
    return Response.json(result, { status: result.status === "has_plan" ? 409 : 200 });
  } catch {
    return Response.json({ error: "Não foi possível salvar seu plano. Tente de novo." }, { status: 500 });
  }
}
