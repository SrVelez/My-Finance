import { UnauthorizedError } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { exportUserData } from "@/lib/services/account";
import { serverToday } from "@/lib/services/today";

/** GET /api/account/export: baixa um JSON com todos os dados de quem está logado (e só dele). */
export async function GET() {
  try {
    const { userId } = await requireUser();
    const data = await exportUserData(userId);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="financa-dados-${await serverToday()}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) return Response.json({ error: "Entre na sua conta para continuar." }, { status: 401 });
    return Response.json({ error: "Não foi possível exportar seus dados." }, { status: 500 });
  }
}
