import { describe, expect, it } from "vitest";
import { applyKey, displayAmount } from "@/lib/amount";
import { formatDateChip, formatWeekLabel, weekRange } from "@/lib/engine";

const type = (keys: string[]) => keys.reduce(applyKey, "");

describe("teclado numérico", () => {
  it("digita valores com vírgula e limita a 2 decimais", () => {
    expect(type(["2", "3", ",", "5", "0", "9"])).toBe("23,50");
    expect(type([",", "5"])).toBe("0,5");
    expect(type(["0", "7"])).toBe("7");
    expect(type(["1", ",", ",", "2"])).toBe("1,2");
  });
  it("apaga e formata", () => {
    expect(type(["1", "2", "back"])).toBe("1");
    expect(displayAmount("")).toBe("€0");
    expect(displayAmount("1500,5")).toBe("€1.500,5");
  });
});

describe("semana", () => {
  it("semana de segunda a domingo contendo a data", () => {
    expect(weekRange("2026-10-08", 1)).toEqual({ start: "2026-10-05", end: "2026-10-11" });
    expect(weekRange("2026-10-05", 1)).toEqual({ start: "2026-10-05", end: "2026-10-11" });
    expect(weekRange("2026-10-11", 1).start).toBe("2026-10-05");
    expect(weekRange("2026-10-08", 0)).toEqual({ start: "2026-10-04", end: "2026-10-10" });
  });
  it("rótulos", () => {
    expect(formatWeekLabel("2026-10-05", "2026-10-11")).toBe("Semana de 5 a 11 out");
    expect(formatWeekLabel("2026-09-28", "2026-10-04")).toBe("Semana de 28 set a 4 out");
    expect(formatDateChip("2026-10-08", "2026-10-08")).toBe("Hoje, 8 out");
    expect(formatDateChip("2026-10-07", "2026-10-08")).toBe("7 out");
  });
});
