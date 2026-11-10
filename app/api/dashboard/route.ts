import { parsePeriodo } from "@/lib/dashboard/periodo";
import { UnauthorizedError } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { getDashboard } from "@/lib/services/dashboard";
import { serverToday } from "@/lib/services/today";

/** GET /api/dashboard?periodo=semana|mes|3meses: o resumo já agregado, só para desenhar. */
export async function GET(request: Request) {
  const periodo = parsePeriodo(new URL(request.url).searchParams.get("periodo"));
  try {
    const { userId } = await requireUser();
    return Response.json(await getDashboard(userId, periodo, await serverToday()));
  } catch (e) {
    if (e instanceof UnauthorizedError) return Response.json({ error: "Entre na sua conta para continuar." }, { status: 401 });
    return Response.json({ error: "Não deu para carregar o resumo." }, { status: 500 });
  }
}
