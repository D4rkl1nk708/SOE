import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import Simulado from "@/pages/Simulado";
import { trpc } from "@/lib/trpc";

// Mock trpc
vi.mock("@/lib/trpc", () => ({
  trpc: {
    dashboard: {
      getStats: { useQuery: vi.fn() },
    },
    discipline: {
      list: { useQuery: vi.fn() },
    },
  },
}));

// Mock lucide-react
vi.mock("lucide-react", () => ({
  Clock: () => <span data-testid="icon-clock" />,
  Play: () => <span data-testid="icon-play" />,
  CheckCircle2: () => <span data-testid="icon-check-circle" />,
  XCircle: () => <span data-testid="icon-x-circle" />,
  Trophy: () => <span data-testid="icon-trophy" />,
  BarChart3: () => <span data-testid="icon-chart" />,
  ChevronLeft: () => <span data-testid="icon-left" />,
  ChevronRight: () => <span data-testid="icon-right" />,
  AlertTriangle: () => <span data-testid="icon-alert" />,
  BookOpen: () => <span data-testid="icon-book" />,
  Target: () => <span data-testid="icon-target" />,
  Timer: () => <span data-testid="icon-timer" />,
  Swords: () => <span data-testid="icon-swords" />,
  RotateCcw: () => <span data-testid="icon-retry" />,
  Check: () => <span data-testid="icon-check" />,
  X: () => <span data-testid="icon-x" />,
}));

describe("Simulado Component", () => {
  const mockDisciplines = [
    { id: 1, name: "Direito Admin", color: "#ff0000" },
    { id: 2, name: "Direito Const", color: "#0000ff" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    (trpc.dashboard.getStats.useQuery as any).mockReturnValue({ data: {} });
    (trpc.discipline.list.useQuery as any).mockReturnValue({
      data: mockDisciplines,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("configures and starts a short simulado", async () => {
    render(<Simulado />);

    fireEvent.click(screen.getByText("Direito Admin"));

    // Change total questions to 2
    const qInput = screen.getByDisplayValue("30");
    fireEvent.change(qInput, { target: { value: "2" } });

    fireEvent.click(screen.getByText("Iniciar Simulado"));

    // Question 1: Acertei
    fireEvent.click(screen.getByText("Acertei"));

    // Check if moved to Q2
    expect(
      screen.getByText((_, node) => node?.textContent === "2/2"),
    ).toBeTruthy();

    // Question 2: Errei
    fireEvent.click(screen.getByText("Errei"));

    // 3. Results Phase
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByText("Precisa melhorar")).toBeTruthy();
    expect(screen.getByText(/1 de 2 questões corretas/)).toBeTruthy();
  });

  test("handles timer and auto-finish on time out", async () => {
    render(<Simulado />);
    fireEvent.click(screen.getByText("Direito Admin"));

    // Set time to 1 minute
    const tInput = screen.getByDisplayValue("60");
    fireEvent.change(tInput, { target: { value: "1" } });

    fireEvent.click(screen.getByText("Iniciar Simulado"));

    expect(screen.getByText("01:00")).toBeTruthy();

    // Advance time by 60 seconds
    act(() => {
      vi.advanceTimersByTime(60000);
    });

    // Should be in results phase with 0% (or whatever was answered)
    expect(screen.getByText("0%")).toBeTruthy();
    expect(screen.getByText("Continue praticando")).toBeTruthy();
  });

  test("can pause and resume the timer", async () => {
    render(<Simulado />);
    fireEvent.click(screen.getByText("Direito Admin"));
    fireEvent.click(screen.getByText("Iniciar Simulado"));

    expect(screen.getByText("60:00")).toBeTruthy();

    fireEvent.click(screen.getByText("⏸ Pausar"));

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Should still be 60:00
    expect(screen.getByText("60:00")).toBeTruthy();

    fireEvent.click(screen.getByText("▶ Retomar"));

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText("59:55")).toBeTruthy();
  });

  test("can select and clear all disciplines", () => {
    render(<Simulado />);
    fireEvent.click(screen.getByText("Todas"));
    expect(screen.getByText("2 disciplinas selecionadas")).toBeTruthy();

    fireEvent.click(screen.getByText("Limpar"));
    expect(screen.queryByText("disciplinas selecionadas")).toBeNull();
  });

  test("can use presets", () => {
    render(<Simulado />);
    fireEvent.click(screen.getByText("Mini (10q / 20min)"));
    expect(screen.getByDisplayValue("10")).toBeTruthy();
    expect(screen.getByDisplayValue("20")).toBeTruthy();
  });

  test("can end simulado manually", () => {
    window.confirm = vi.fn().mockReturnValue(true);
    render(<Simulado />);
    fireEvent.click(screen.getByText("Direito Admin"));
    fireEvent.click(screen.getByText("Iniciar Simulado"));

    fireEvent.click(screen.getByText("Encerrar"));
    expect(screen.getByText("0%")).toBeTruthy();
  });

  test("shows discipline breakdown in results", () => {
    render(<Simulado />);
    fireEvent.click(screen.getByText("Todas"));

    const qInput = screen.getByDisplayValue("30");
    fireEvent.change(qInput, { target: { value: "2" } });

    fireEvent.click(screen.getByText("Iniciar Simulado"));

    // Q1: Admin -> Correct
    fireEvent.click(screen.getByText("Direito Admin"));
    fireEvent.click(screen.getByText("Acertei"));

    // Q2: Const -> Wrong
    fireEvent.click(screen.getByText("Direito Const"));
    fireEvent.click(screen.getByText("Errei"));

    expect(screen.getByText("Por disciplina")).toBeTruthy();
    expect(screen.getByText("Direito Admin")).toBeTruthy();
    expect(screen.getByText("1/1 (100%)")).toBeTruthy();
    expect(screen.getByText("Direito Const")).toBeTruthy();
    expect(screen.getByText("0/1 (0%)")).toBeTruthy();

    // Test Retry
    fireEvent.click(screen.getByText("Novo Simulado"));
    expect(screen.getByText("Simulado Cronometrado")).toBeTruthy();

    // Test Back (need to get to results again)
    fireEvent.click(screen.getByText("Direito Admin"));
    fireEvent.click(screen.getByText("Iniciar Simulado"));
    fireEvent.click(screen.getByText("Encerrar"));

    fireEvent.click(screen.getByText("Voltar"));
    expect(screen.getByText("Simulado Cronometrado")).toBeTruthy();
  });
});
