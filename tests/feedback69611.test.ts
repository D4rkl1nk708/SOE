import { describe, it, expect } from "vitest";
import {
  BLOCK_FEEDBACK_MIN_QUESTIONS,
  resolveFeedbackMode,
  isFeedbackVisible,
  feedbackModeLabel,
} from "../shared/feedbackMode";

describe("feedback em bloco (4.5)", () => {
  it("bloco é o padrão para sessões com 5 ou mais questões", () => {
    expect(BLOCK_FEEDBACK_MIN_QUESTIONS).toBe(5);
    expect(resolveFeedbackMode(5)).toBe("block");
    expect(resolveFeedbackMode(10)).toBe("block");
    expect(resolveFeedbackMode(5, "block")).toBe("block");
  });

  it("menos de 5 questões → imediato", () => {
    expect(resolveFeedbackMode(4)).toBe("immediate");
    expect(resolveFeedbackMode(1)).toBe("immediate");
    expect(resolveFeedbackMode(4, "block")).toBe("immediate");
  });

  it("preferência explícita por imediato vence", () => {
    expect(resolveFeedbackMode(10, "immediate")).toBe("immediate");
  });

  it("durante o bloco o gabarito e a explicação ficam escondidos", () => {
    expect(isFeedbackVisible({ mode: "block", corrected: false })).toBe(false);
    expect(isFeedbackVisible({ mode: "block", corrected: true })).toBe(true);
  });

  it("no modo imediato o gabarito aparece na hora", () => {
    expect(isFeedbackVisible({ mode: "immediate", corrected: false })).toBe(
      true,
    );
  });

  it("tem rótulo legível para a tela de configurações", () => {
    expect(feedbackModeLabel("block")).toMatch(/bloco/i);
    expect(feedbackModeLabel("immediate")).toMatch(/imediato/i);
  });
});
