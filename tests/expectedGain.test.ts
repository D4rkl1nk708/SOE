import { describe, it, expect } from "vitest";
import {
  expectedGainPerMinute,
  shouldUseGainTiebreak,
  GAIN_TIEBREAK_MAX_OVERDUE_DIFF_DAYS,
} from "../shared/expectedGain";

const base = {
  weight: 3,
  proficiency: 40,
  daysSinceStudy: 10,
  accuracyTrend: 0,
  bancaShare: 0.5,
  minutes: 30,
};

describe("expectedGain — decisão por ganho esperado por minuto (4.12)", () => {
  it("monotônico em peso", () => {
    const low = expectedGainPerMinute({ ...base, weight: 2 });
    const high = expectedGainPerMinute({ ...base, weight: 5 });
    expect(high).toBeGreaterThan(low);
  });

  it("monotônico (inverso) em proficiência", () => {
    const weak = expectedGainPerMinute({ ...base, proficiency: 10 });
    const strong = expectedGainPerMinute({ ...base, proficiency: 90 });
    expect(weak).toBeGreaterThan(strong);
  });

  it("monotônico em atraso, saturando em 30 dias", () => {
    const fresh = expectedGainPerMinute({ ...base, daysSinceStudy: 0 });
    const ten = expectedGainPerMinute({ ...base, daysSinceStudy: 10 });
    const thirty = expectedGainPerMinute({ ...base, daysSinceStudy: 30 });
    const sixty = expectedGainPerMinute({ ...base, daysSinceStudy: 60 });
    expect(ten).toBeGreaterThan(fresh);
    expect(thirty).toBeGreaterThan(ten);
    expect(sixty).toBeCloseTo(thirty, 10);
  });

  it("divide pelos minutos (mínimo 1)", () => {
    const thirty = expectedGainPerMinute({ ...base, minutes: 30 });
    const ten = expectedGainPerMinute({ ...base, minutes: 10 });
    expect(ten).toBeCloseTo(thirty * 3, 10);
    expect(expectedGainPerMinute({ ...base, minutes: 0 })).toBeCloseTo(
      expectedGainPerMinute({ ...base, minutes: 1 }),
      10,
    );
  });

  it("satura proficiência e peso fora da faixa sem virar valor absurdo", () => {
    const value = expectedGainPerMinute({
      ...base,
      proficiency: 140,
      weight: 999,
      bancaShare: 3,
      accuracyTrend: 99,
    });
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
  });

  it("desempate por ganho só quando a diferença de atraso é < 7 dias", () => {
    expect(GAIN_TIEBREAK_MAX_OVERDUE_DIFF_DAYS).toBe(7);
    expect(shouldUseGainTiebreak(10, 16)).toBe(true);
    expect(shouldUseGainTiebreak(10, 17)).toBe(false);
    expect(shouldUseGainTiebreak(30, 30)).toBe(true);
    expect(shouldUseGainTiebreak(3, 40)).toBe(false);
  });
});
