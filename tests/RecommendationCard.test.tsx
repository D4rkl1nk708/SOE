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
  X: () => <span data-testid="icon-x" />,
  XIcon: () => <span data-testid="icon-x" />,
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

    expect(screen.getByText("Mentor de hoje")).toBeTruthy();
    expect(screen.getAllByText("Urgente").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Direito Admin/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Você está estagnado.").length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("Estude mais atos.").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Vai reprovar/).length).toBeGreaterThan(0);
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
    const refetchBtn = screen.getByTitle("Recalcular orientação");
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
    const refetchBtn = screen.getByTitle("Recalcular orientação");
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
