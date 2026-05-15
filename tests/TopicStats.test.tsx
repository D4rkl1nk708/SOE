import { render, screen, fireEvent } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import TopicStats from "@/pages/TopicStats";
import { trpc } from "@/lib/trpc";

// Mock trpc
vi.mock("@/lib/trpc", () => ({
  trpc: {
    dashboard: {
      getStats: {
        useQuery: vi.fn(),
      },
    },
  },
}));

// Mock lucide-react
vi.mock("lucide-react", () => ({
  BarChart3: () => <span data-testid="icon-chart" />,
  TrendingUp: () => <span data-testid="icon-up" />,
  TrendingDown: () => <span data-testid="icon-down" />,
  Target: () => <span data-testid="icon-target" />,
  BookOpen: () => <span data-testid="icon-book" />,
  Search: () => <span data-testid="icon-search" />,
  ArrowUpDown: () => <span data-testid="icon-sort" />,
  ChevronDown: () => <span data-testid="icon-chevron-down" />,
  ChevronUp: () => <span data-testid="icon-chevron-up" />,
  Clock: () => <span data-testid="icon-clock" />,
  CheckCircle2: () => <span data-testid="icon-check" />,
}));

describe("TopicStats Component", () => {
  const mockStats = {
    disciplineStats: [
      {
        disciplineId: 1,
        name: "Direito Admin",
        color: "#ff0000",
        topics: [
          {
            id: 101,
            name: "Atos Administrativos",
            studyTimeSeconds: 3600,
            performance: { correctCount: 8, errorCount: 2 },
          },
          {
            id: 102,
            name: "Poderes",
            studyTimeSeconds: 1800,
            performance: { correctCount: 4, errorCount: 6 },
          },
        ],
      },
      {
        disciplineId: 2,
        name: "Direito Const",
        color: "#0000ff",
        topics: [
          {
            id: 201,
            name: "Direitos Fundamentais",
            studyTimeSeconds: 7200,
            performance: { correctCount: 15, errorCount: 0 },
          },
          {
            id: 202,
            name: "Topic Without Data",
            studyTimeSeconds: 0,
            performance: null,
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (trpc.dashboard.getStats.useQuery as any).mockReturnValue({
      data: mockStats,
    });
  });

  test("renders summary cards and topic table", () => {
    render(<TopicStats />);
    expect(screen.getByText("Relatório Detalhado")).toBeTruthy();
    expect(screen.getByText("Temas Mapeados")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy(); // Total topics

    expect(screen.getByText("Atos Administrativos")).toBeTruthy();
    expect(screen.getByText("80%")).toBeTruthy(); // (8/10)
    expect(screen.getByText("Direitos Fundamentais")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy(); // (15/15)
    expect(screen.getByText("Poderes")).toBeTruthy();
    expect(screen.getByText("40%")).toBeTruthy(); // (4/10)
  });

  test("filters by search input", () => {
    render(<TopicStats />);
    const searchInput = screen.getByPlaceholderText("Pesquisar tema...");
    fireEvent.change(searchInput, { target: { value: "Atos" } });

    expect(screen.getByText("Atos Administrativos")).toBeTruthy();
    expect(screen.queryByText("Poderes")).toBeNull();
  });

  test("filters by discipline", () => {
    render(<TopicStats />);
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "2" } }); // Direito Const

    expect(screen.getByText("Direitos Fundamentais")).toBeTruthy();
    expect(screen.queryByText("Atos Administrativos")).toBeNull();
  });

  test("filters by performance tab", () => {
    render(<TopicStats />);

    // Filter strong (>= 75%)
    fireEvent.click(screen.getByText("Forte"));
    expect(screen.getByText("Atos Administrativos")).toBeTruthy();
    expect(screen.getByText("Direitos Fundamentais")).toBeTruthy();
    expect(screen.queryByText("Poderes")).toBeNull();

    // Filter weak (< 50%)
    fireEvent.click(screen.getByText("Crítico"));
    expect(screen.getByText("Poderes")).toBeTruthy();
    expect(screen.queryByText("Atos Administrativos")).toBeNull();

    // Filter no data
    fireEvent.click(screen.getByText("Sem Dados"));
    expect(screen.getByText("Topic Without Data")).toBeTruthy();
    expect(screen.queryByText("Poderes")).toBeNull();
  });

  test("sorts by different keys", () => {
    render(<TopicStats />);

    // Sort by name (desc by default or current dir)
    const nameSortBtn = screen.getByText("Tema");
    fireEvent.click(nameSortBtn);
    // ... check order if needed, but at least verify it doesn't crash

    // Sort by questions
    fireEvent.click(screen.getByText("Questões"));

    // Sort by accuracy
    fireEvent.click(screen.getByText("Acerto"));

    // Sort by time
    fireEvent.click(screen.getByText("Tempo"));
  });

  test("handles empty state", () => {
    (trpc.dashboard.getStats.useQuery as any).mockReturnValue({
      data: { disciplineStats: [] },
    });
    render(<TopicStats />);
    expect(
      screen.getByText("Nenhum tema encontrado para os filtros ativos"),
    ).toBeTruthy();
  });

  test("handles no results found with filters", () => {
    render(<TopicStats />);
    const searchInput = screen.getByPlaceholderText("Pesquisar tema...");
    fireEvent.change(searchInput, { target: { value: "Nonexistent" } });
    expect(
      screen.getByText("Nenhum tema encontrado para os filtros ativos"),
    ).toBeTruthy();
  });

  test("formats study time correctly", () => {
    render(<TopicStats />);
    expect(screen.getByText("1h")).toBeTruthy(); // 3600s
    expect(screen.getByText("30m")).toBeTruthy(); // 1800s
    expect(screen.getByText("2h")).toBeTruthy(); // 7200s
  });
});
