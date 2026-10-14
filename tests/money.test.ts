import { describe, expect, it } from "vitest";
import { formatEUR, parseEUR } from "@/lib/money";

describe("money", () => {
  it("formata no padrão das telas", () => {
    expect(formatEUR(50000)).toBe("€500");
    expect(formatEUR(2350)).toBe("€23,50");
    expect(formatEUR(150000)).toBe("€1.500");
    expect(formatEUR(14450)).toBe("€144,50");
  });
  it("interpreta texto digitado", () => {
    expect(parseEUR("23,5")).toBe(2350);
    expect(parseEUR("1.500")).toBe(150000);
    expect(parseEUR("")).toBe(0);
  });
});
