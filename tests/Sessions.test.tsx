import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import Sessions from "@/pages/Sessions";

const navigate = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/sessions", navigate],
}));

const state = vi.hoisted(() => ({ sessions: [] as any[] }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    study: {
      recentSessions: {
        useQuery: () => ({ data: state.sessions, isLoading: false }),
      },
    },
  },
}));

/** Data de hoje em YYYY-MM-DD (as sessões do resumo precisam cair nos 7 dias). */
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

const session = (overrides: Record<string, unknown> = {}) => ({
  date: today(),
  hourStart: 9,
  durationMin: 40,
  accuracy: 0.75,
  questions: 4,
  correct: 3,
  ...overrides,
});

describe("Sessions", () => {
  beforeEach(() => {
    navigate.mockClear();
    state.sessions = [];
  });

  test("renderiza o resumo dos últimos 7 dias e uma sessão", () => {
    state.sessions = [
      session({ topicName: "Controle de Constitucionalidade" }),
      session({
        hourStart: 14,
        durationMin: 20,
        accuracy: 0.5,
        questions: 2,
        correct: 1,
      }),
    ];

    render(<Sessions />);

    expect(screen.getByRole("heading", { name: "Sessões" })).toBeTruthy();
    expect(screen.getByText("Histórico")).toBeTruthy();
    // resumo: 2 sessões, 60 min, acurácia média 63%, 6 questões
    expect(screen.getByText("60")).toBeTruthy();
    expect(screen.getByText("63%")).toBeTruthy();
    expect(screen.getByText("6")).toBeTruthy();

    expect(screen.getByText("Controle de Constitucionalidade")).toBeTruthy();
    expect(screen.getByText("3/4 acertos")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getByText("40 min")).toBeTruthy();
  });

  test("mostra o estado vazio quando a lista vem vazia", () => {
    state.sessions = [];

    render(<Sessions />);

    expect(screen.getByText("Nenhuma sessão registrada ainda")).toBeTruthy();
    expect(
      screen.getByText(
        /grava o histórico automaticamente quando você encerra/i,
      ),
    ).toBeTruthy();
    expect(screen.queryByText("3/4 acertos")).toBeNull();
  });

  test("usa 'Sessão livre' quando falta topicName", () => {
    state.sessions = [session()];

    render(<Sessions />);

    expect(screen.getByText("Sessão livre")).toBeTruthy();
  });

  test("'Abrir plano' navega para /plan", () => {
    state.sessions = [session({ topicName: "Crase" })];

    render(<Sessions />);

    fireEvent.click(screen.getByText("Abrir plano"));
    expect(navigate).toHaveBeenCalledWith("/plan");
  });
});
