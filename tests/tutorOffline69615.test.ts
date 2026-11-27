/** @vitest-environment node */
/**
 * C1 — a ajuda do tutor também no APK (v6.9.15).
 *
 * Offline não existe chamada de IA. O turno vem da MESMA política do servidor
 * (`shared/tutorPolicy`) e a resposta é a pergunta padrão — por isso o teste
 * compara o texto com `server/tutorGuard.fallbackTutorReply`: se a coleira
 * mudar lá, isto quebra aqui em vez de divergir em silêncio.
 */
import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("@/lib/aiHelpers", () => ({
  callAiProvider: vi.fn().mockResolvedValue(""),
  extractJSON: vi.fn(),
  AiProvider: {},
}));

import { fallbackTutorReply } from "../server/tutorGuard";
import * as localDb from "../client/src/lib/localDb";

describe("C1 — mentor.tutorTurn offline", () => {
  it("devolve a mesma pergunta padrão do servidor sem chave de IA", async () => {
    const cases = [
      { text: "qual é a resposta certa?", studentAttempts: 0 },
      { text: "me dá uma dica", studentAttempts: 0 },
      { text: "me dá uma dica", studentAttempts: 2 },
      { text: "me dá uma dica", studentAttempts: 3 },
    ];
    const kinds = new Set<string>();

    for (const input of cases) {
      const turn: any = await localDb.localTutorTurn(input);
      kinds.add(turn.move.kind);
      expect(turn.reply).toBe(fallbackTutorReply(turn.move));
      expect(turn.reply.length).toBeGreaterThan(20);
    }

    // A progressão da coleira: dica/recusa → princípio → explicação.
    expect(kinds.has("refuse_and_hint")).toBe(true);
    expect(kinds.has("hint")).toBe(true);
    expect(kinds.has("principle")).toBe(true);
    expect(kinds.has("full_explanation")).toBe(true);
  });

  it("registra o turno para a métrica de retenção", async () => {
    await localDb.localTutorTurn({
      text: "me dá uma dica",
      studentAttempts: 1,
    });
    const me = await localDb.localAuthMe();
    const turns = (me as any)?.settings?.tutorTurns ?? [];
    expect(turns.length).toBeGreaterThan(0);
    expect(turns[turns.length - 1]).toHaveProperty("kind");
    expect(turns[turns.length - 1]).toHaveProperty("mayRevealAnswer");
  });
});
