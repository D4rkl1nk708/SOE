import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Item 2.5 (v6.9.8): uma ação, um toast.
 *
 * O aluno via dois "Revisão concluída." porque dois caminhos avisavam a mesma
 * conclusão. `notify.once` usa id estável (o sonner substitui em vez de
 * empilhar) e uma janela curta bloqueia o eco do mesmo clique.
 */
const spies = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  plain: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(
    (message: unknown, options: unknown) => spies.plain(message, options),
    {
      success: (message: unknown, options: unknown) =>
        spies.success(message, options),
      error: (message: unknown, options: unknown) =>
        spies.error(message, options),
      warning: (message: unknown, options: unknown) =>
        spies.warning(message, options),
    },
  ),
}));

import { NOTIFY_WINDOW_MS, notify } from "../client/src/lib/notify";

describe("notify.once — um toast por ação", () => {
  beforeEach(() => {
    notify.reset();
    spies.success.mockClear();
    spies.error.mockClear();
    spies.warning.mockClear();
    spies.plain.mockClear();
  });

  it("dois avisos da mesma ação produzem UM toast", () => {
    const first = notify.once(
      "guided-close",
      "Sessão encerrada · revisão concluída",
    );
    const second = notify.once(
      "guided-close",
      "Sessão encerrada · revisão concluída",
    );
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(spies.success).toHaveBeenCalledTimes(1);
  });

  it("manda um id estável para o sonner substituir em vez de empilhar", () => {
    notify.once("revision-status", "Status atualizado!");
    const options = spies.success.mock.calls[0][1] as { id: string };
    expect(options.id).toBe("revision-status");
  });

  it("ações diferentes continuam aparecendo", () => {
    notify.once("revision-status", "Status atualizado!");
    notify.once("guided-close", "Sessão encerrada");
    expect(spies.success).toHaveBeenCalledTimes(2);
  });

  it("depois da janela, a mesma ação volta a avisar", () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(1_000);
    notify.once("guided-close", "Sessão encerrada");
    nowSpy.mockReturnValue(1_000 + NOTIFY_WINDOW_MS + 1);
    notify.once("guided-close", "Sessão encerrada");
    expect(spies.success).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
  });

  it("erro usa toast.error com o mesmo id", () => {
    notify.once("guided-close-error", "Falhou", { variant: "error" });
    expect(spies.error).toHaveBeenCalledTimes(1);
    expect((spies.error.mock.calls[0][1] as { id: string }).id).toBe(
      "guided-close-error",
    );
  });
});
