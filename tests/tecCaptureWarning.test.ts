/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { minutesSinceIso, shouldWarnNoCapture } from "../shared/sessionReport";

describe("aviso de captura parada (v6.9.5)", () => {
  it("só avisa a partir de 4 minutos", () => {
    expect(shouldWarnNoCapture(0)).toBe(false);
    expect(shouldWarnNoCapture(3)).toBe(false);
    expect(shouldWarnNoCapture(4)).toBe(true);
    expect(shouldWarnNoCapture(11)).toBe(true);
  });

  it("sem referência de tempo não avisa (nunca inventa)", () => {
    expect(shouldWarnNoCapture(null)).toBe(false);
    expect(shouldWarnNoCapture(Number.NaN)).toBe(false);
  });

  it("aceita limite configurável", () => {
    expect(shouldWarnNoCapture(3, 2)).toBe(true);
    expect(shouldWarnNoCapture(3, 10)).toBe(false);
    expect(shouldWarnNoCapture(0, 0)).toBe(false);
  });

  it("minutesSinceIso converte e protege data inválida", () => {
    const now = Date.parse("2026-11-19T15:10:00.000Z");
    expect(minutesSinceIso("2026-11-19T15:00:00.000Z", now)).toBe(10);
    expect(minutesSinceIso("2026-11-19T15:10:00.000Z", now)).toBe(0);
    expect(minutesSinceIso("2026-11-19T15:20:00.000Z", now)).toBe(0);
    expect(minutesSinceIso(null, now)).toBeNull();
    expect(minutesSinceIso("nao e data", now)).toBeNull();
  });
});
