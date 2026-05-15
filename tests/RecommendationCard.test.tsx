import { render, screen, fireEvent } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { RecommendationCard } from "@/components/RecommendationCard";
import { trpc } from "@/lib/trpc";

// Mock trpc
vi.mock("@/lib/trpc", () => ({
  trpc: {
    dashboard: {
      getStats: {
        useQuery: vi.fn(),
      },
    },
    mentor: {
      getMentorRecommendation: {
        useQuery: vi.fn(),
      },
    },
  },
}));

// Mock lucide-react
vi.mock("lucide-react", () => ({
  Sparkles: () => <span data-testid="icon-sparkles" />,
  Target: () => <span data-testid="icon-target" />,
  TrendingDown: () => <span data-testid="icon-trending-down" />,
  Clock: () => <span data-testid="icon-clock" />,
  AlertCircle: () => <span data-testid="icon-alert-circle" />,
}));

// Mock UI components
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, className }: any) => (
    <div className={className}>{children}</div>
  ),
}));
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: any) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

describe("RecommendationCard Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  test("returns null if no API key in settings or localStorage", () => {
    (trpc.dashboard.getStats.useQuery as any).mockReturnValue({
      data: { settings: { aiApiKey: "" } },
    });
    (trpc.mentor.getMentorRecommendation.useQuery as any).mockReturnValue({
      data: null,
      isLoading: false,
    });

    const { container } = render(<RecommendationCard />);
    expect(container.firstChild).toBeNull();
  });

  test("renders loading state", () => {
    localStorage.setItem("soe_mentor_api_key", "test-key");
    (trpc.dashboard.getStats.useQuery as any).mockReturnValue({
      data: { settings: {} },
    });
    (trpc.mentor.getMentorRecommendation.useQuery as any).mockReturnValue({
      data: null,
      isLoading: true,
    });

    render(<RecommendationCard />);
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });

  test("renders high priority recommendation", () => {
    localStorage.setItem("soe_mentor_api_key", "test-key");
    (trpc.dashboard.getStats.useQuery as any).mockReturnValue({
      data: { settings: {} },
    });
    (trpc.mentor.getMentorRecommendation.useQuery as any).mockReturnValue({
      data: {
        priority: "alta",
        contextTag: "Geral",
        plateauCount: 2,
        regressionCount: 1,
        disciplineName: "Direito Admin",
        diagnostic: "Você está estagnado.",
        actionPlan: "Estude mais atos.",
        prediction: "Vai reprovar.",
      },
      isLoading: false,
      isRefetching: false,
    });

    render(<RecommendationCard />);

    expect(screen.getByText("Recomendação do Mentor")).toBeTruthy();
    expect(screen.getByText("Urgente")).toBeTruthy(); // Because priority === "alta"
    expect(screen.getByText("Geral")).toBeTruthy(); // contextTag
    expect(screen.getByText("Direito Admin")).toBeTruthy();
    expect(screen.getByText("Você está estagnado.")).toBeTruthy();
    expect(screen.getByText("Estude mais atos.")).toBeTruthy();
    expect(screen.getByText(/"Vai reprovar."/)).toBeTruthy();
  });

  test("calls refetch when sparkles button is clicked", () => {
    localStorage.setItem("soe_mentor_api_key", "test-key");
    const refetch = vi.fn();
    (trpc.dashboard.getStats.useQuery as any).mockReturnValue({
      data: { settings: {} },
    });
    (trpc.mentor.getMentorRecommendation.useQuery as any).mockReturnValue({
      data: {
        priority: "baixa",
        disciplineName: "D1",
        diagnostic: "D1",
        actionPlan: "A1",
        prediction: "P1",
      },
      isLoading: false,
      isRefetching: false,
      refetch,
    });

    render(<RecommendationCard />);
    const refetchBtn = screen.getByTitle("Recalcular Rota");
    fireEvent.click(refetchBtn);
    expect(refetch).toHaveBeenCalled();
  });

  test("shows loading state when refetching", () => {
    localStorage.setItem("soe_mentor_api_key", "test-key");
    (trpc.dashboard.getStats.useQuery as any).mockReturnValue({
      data: { settings: {} },
    });
    (trpc.mentor.getMentorRecommendation.useQuery as any).mockReturnValue({
      data: {
        priority: "baixa",
        disciplineName: "D1",
        diagnostic: "D1",
        actionPlan: "A1",
        prediction: "P1",
      },
      isLoading: false,
      isRefetching: true,
    });

    render(<RecommendationCard />);
    const refetchBtn = screen.getByTitle("Recalcular Rota");
    expect(refetchBtn.className).toContain("animate-spin");
    expect((refetchBtn as HTMLButtonElement).disabled).toBe(true);
  });

  test("returns null on error or no recommendation", () => {
    localStorage.setItem("soe_mentor_api_key", "test-key");
    (trpc.dashboard.getStats.useQuery as any).mockReturnValue({
      data: { settings: {} },
    });
    (trpc.mentor.getMentorRecommendation.useQuery as any).mockReturnValue({
      data: null,
      isLoading: false,
      error: { message: "Error" },
    });

    const { container } = render(<RecommendationCard />);
    expect(container.firstChild).toBeNull();
  });
});
