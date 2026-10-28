import { parsePeriodo } from "@/lib/dashboard/periodo";
import { getDashboard } from "@/lib/services/dashboard";
import { serverToday } from "@/lib/services/today";

/** GET /api/dashboard?periodo=semana|mes|3meses: o resumo já agregado, só para desenhar. */
export async function GET(request: Request) {
  const periodo = parsePeriodo(new URL(request.url).searchParams.get("periodo"));
  try {
    return Response.json(await getDashboard(periodo, await serverToday()));
  } catch {
    return Response.json({ error: "Não deu para carregar o resumo." }, { status: 500 });
  }
}
