import { describe, expect, it } from "vitest";
import { buildDashboard } from "@/lib/dashboard";
import { buildCategorias, categoriasFrase } from "@/lib/dashboard/categorias";
import { buildMetas } from "@/lib/dashboard/metas";
import { buildRecebimentos } from "@/lib/dashboard/recebimentos";
import { buildRitmo } from "@/lib/dashboard/ritmo";
import type { DashGoal } from "@/lib/dashboard/types";
import { euros } from "@/lib/money";
import { gasto, recebimento, seedTxs } from "./fixtures";

const SEGUNDA = 1; // semana começa na segunda

describe("recebimentos (para onde foi cada recebimento)", () => {
  const rows = buildRecebimentos(seedTxs(), euros(120), SEGUNDA);

  it("1. semana de €280: contas €196, dia a dia €84, metas €0, folga €0, falta €36 (apertada)", () => {
    expect(rows[3]).toMatchObject({
      recebidoCents: euros(280),
      contasCents: euros(196),
      diaADiaCents: euros(84),
      metasCents: 0,
      folgaCents: 0,
      faltaCents: euros(36),
    });
    const d = buildDashboard({
      periodo: "3meses",
      today: "2026-10-22",
      weekStartDay: SEGUNDA,
      weeklyLivingCents: euros(120),
      txs: seedTxs(),
      goals: [],
      bills: [],
    });
    expect(d.destaques.semanasApertadas).toBe(1);
  });

  it("1b. recebimento antigo, sem falta registrada, deriva a falta do gasto semanal", () => {
    const antigo = recebimento("2026-09-22", euros(280)).map((t) => ({ ...t, shortfallCents: null }));
    expect(buildRecebimentos(antigo, euros(120), SEGUNDA)[0].faltaCents).toBe(euros(36));
  });

  it("2. semana de €500: contas €196, dia a dia €120, metas €58, folga €126", () => {
    expect(rows[0]).toMatchObject({
      contasCents: euros(196),
      diaADiaCents: euros(120),
      metasCents: euros(58),
      folgaCents: euros(126),
      faltaCents: 0,
    });
  });
});

describe("ritmo da semana", () => {
  // Segunda 5/out. Livre = 500 − 196 − 58 = €246.
  const semana = [
    ...recebimento("2026-10-05", euros(500)),
    gasto("2026-10-05", euros(12), "Mercado"),
    gasto("2026-10-06", euros(23), "Transporte"),
    gasto("2026-10-07", euros(17), "Mercado"),
    gasto("2026-10-08", euros(26), "Comer fora"),
  ];

  it("3. acumulado €12/€35/€52/€78, ideal do 4º dia €141, abaixo do ritmo", () => {
    const r = buildRitmo(semana, "2026-10-05", "2026-10-08");
    expect(r.livreCents).toBe(euros(246));
    expect(r.dias.slice(0, 4).map((d) => d.gastoAcumuladoCents)).toEqual([1200, 3500, 5200, 7800]);
    expect(r.dias[3].idealCents).toBe(euros(141));
    expect(r.dias[4].gastoAcumuladoCents).toBeNull(); // dias futuros ficam vazios
    expect(r.frase).toBe("Você gastou €78 de €246. Está abaixo do ritmo.");
  });

  it("acima do ritmo sugere quanto dá para gastar por dia", () => {
    const r = buildRitmo([...recebimento("2026-10-05", euros(500)), gasto("2026-10-05", euros(100), "Mercado")], "2026-10-05", "2026-10-05");
    expect(r.frase).toBe("Você está €65 acima do ritmo. Para fechar a semana, dá para gastar €24 por dia.");
  });

  it("estourou o livre", () => {
    const r = buildRitmo([...recebimento("2026-10-05", euros(500)), gasto("2026-10-05", euros(260), "Mercado")], "2026-10-05", "2026-10-05");
    expect(r.frase).toBe("Você passou €14 do livre da semana.");
  });
});

describe("metas no ritmo", () => {
  const viagem: DashGoal = {
    id: "viagem",
    name: "Viagem",
    targetCents: euros(600),
    savedCents: euros(85),
    deadline: "2027-06",
    weeklyCents: 0,
    priority: 3,
    createdOn: "2026-08-20",
  };

  it("4. Viagem €85 de €600: esperado 16%, real 14%, atrasada com o acréscimo semanal", () => {
    const [m] = buildMetas([viagem], "2026-10-08");
    expect(m).toMatchObject({ pct: 14, esperadoPct: 16, status: "atrasada" });
    // Esperado €97,67 − €85 = €12,67 de atraso; em 36 semanas basta +€1/semana.
    expect(m.frase).toBe("€12,67 atrás · +€1/semana resolve");
  });

  it("no ritmo quando o guardado alcança o esperado", () => {
    const [m] = buildMetas([{ ...viagem, savedCents: euros(100) }], "2026-10-08");
    expect(m.status).toBe("no_ritmo");
    expect(m.frase).toBe("No ritmo para jun/2027");
  });

  it("5. Reserva sem prazo: €150 de €400 a €25/semana → cerca de 10 semanas", () => {
    const [m] = buildMetas(
      [{ ...viagem, id: "reserva", name: "Reserva", targetCents: euros(400), savedCents: euros(150), deadline: null, weeklyCents: euros(25) }],
      "2026-10-08",
    );
    expect(m).toMatchObject({ status: "sem_prazo", esperadoPct: null, frase: "Sem prazo · cerca de 10 semanas" });
  });

  it("meta completa", () => {
    const [m] = buildMetas([{ ...viagem, savedCents: euros(600) }], "2026-10-08");
    expect(m).toMatchObject({ status: "concluida", pct: 100, frase: "Meta concluída" });
  });
});

describe("categorias", () => {
  const mes = [
    gasto("2026-10-01", euros(212), "Mercado"),
    gasto("2026-10-02", euros(96), "Transporte"),
    gasto("2026-10-03", euros(74), "Comer fora"),
    gasto("2026-10-04", euros(31), "Outro"),
  ];

  it("6. Mercado €212 de €413 = 51%, ordenado do maior para o menor", () => {
    const c = buildCategorias(mes);
    expect(c.map((x) => x.categoria)).toEqual(["Mercado", "Transporte", "Comer fora", "Outro"]);
    expect(c[0].pct).toBe(51);
    expect(categoriasFrase(c, [])).toBe("Mercado é 51% do que você gastou.");
  });

  it("compara com o período anterior quando há dados", () => {
    const antes = [gasto("2026-09-01", euros(54), "Comer fora")];
    expect(categoriasFrase(buildCategorias(mes), antes)).toContain("Mercado subiu €212 em relação ao período anterior.");
  });
});

describe("dados suficientes", () => {
  it("8. com 2 recebimentos não há tendências; com 3 há", () => {
    const base = { periodo: "mes" as const, today: "2026-09-10", weekStartDay: SEGUNDA, weeklyLivingCents: euros(120), goals: [], bills: [] };
    const dois = buildDashboard({ ...base, txs: seedTxs(2) });
    expect(dois.dadosSuficientes).toEqual({ tendencias: false, recebimentosTotais: 2 });
    expect(buildDashboard({ ...base, txs: seedTxs(3) }).dadosSuficientes.tendencias).toBe(true);
  });
});
