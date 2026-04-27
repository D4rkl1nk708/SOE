import { render, screen, fireEvent } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import IntercalacaoPlanner from "@/pages/IntercalacaoPlanner";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// Mock trpc
vi.mock("@/lib/trpc", () => ({
  trpc: {
    topic: {
      list: {
        useQuery: vi.fn(),
      },
    },
  },
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock lucide-react
vi.mock("lucide-react", () => ({
  Shuffle: () => <span data-testid="icon-shuffle" />,
  Info: () => <span data-testid="icon-info" />,
  Plus: () => <span data-testid="icon-plus" />,
  X: () => <span data-testid="icon-x" />,
  ArrowRight: () => <span data-testid="icon-arrow-right" />,
  CheckCircle2: () => <span data-testid="icon-check" />,
  BookOpen: () => <span data-testid="icon-book-open" />,
}));

// Mock UI components
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, style, className }: any) => (
    <div style={style} className={className}>
      {children}
    </div>
  ),
}));

describe("IntercalacaoPlanner Component", () => {
  const mockDisciplines = [
    { id: 1, name: "Direito Admin", color: "#f00", weight: 3 },
    { id: 2, name: "Direito Const", color: "#00f", weight: 2 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (trpc.topic.list.useQuery as any).mockReturnValue({
      data: { disciplines: mockDisciplines },
    });
  });

  test("renders the planner grid", () => {
    render(<IntercalacaoPlanner />);
    expect(screen.getByText("Planejador de Intercalação")).toBeTruthy();
    expect(screen.getByText("Seg")).toBeTruthy();
    expect(screen.getByText("Manhã")).toBeTruthy();
  });

  test("can auto-fill the grid", () => {
    render(<IntercalacaoPlanner />);
    const autoFillBtn = screen.getByText("Auto-intercalar");
    fireEvent.click(autoFillBtn);

    expect(toast.success).toHaveBeenCalledWith(
      "Grade preenchida com intercalação automática!",
    );
    // The score might be slightly different depending on the number of disciplines
    // With 2 disciplines, it should be high.
    expect(screen.getByText(/Índice de intercalação:/)).toBeTruthy();
  });

  test("can clear all assignments", () => {
    render(<IntercalacaoPlanner />);
    fireEvent.click(screen.getByText("Auto-intercalar"));
    expect(screen.getByText("21/21")).toBeTruthy(); // 7 days * 3 slots

    fireEvent.click(screen.getByText("Limpar"));
    expect(screen.getByText("0/21")).toBeTruthy();
  });

  test("can manually assign a discipline to a slot", () => {
    render(<IntercalacaoPlanner />);

    // Find a select (there are many, each cell has one)
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "1" } });

    // One in legend, one in cell. Check if at least 2 exist
    expect(screen.getAllByText(/Direito Adm/).length).toBeGreaterThan(1);
    expect(screen.getByText("1/21")).toBeTruthy();
  });

  test("can remove a discipline from a slot", () => {
    render(<IntercalacaoPlanner />);
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "1" } });

    // The remove button is inside the cell div
    const cell = selects[0].parentElement!;
    const removeBtn = cell.querySelector(
      '[data-testid="icon-x"]',
    )!.parentElement;
    fireEvent.click(removeBtn!);

    expect(screen.getByText("0/21")).toBeTruthy();
  });

  test("calculates interleave quality score and shows warnings", () => {
    render(<IntercalacaoPlanner />);
    const selects = screen.getAllByRole("combobox");

    // Assign same discipline to consecutive slots in SAME DAY
    // Dom Manhã is selects[0]
    // Dom Tarde is selects[7]
    fireEvent.change(selects[0], { target: { value: "1" } });
    fireEvent.change(selects[7], { target: { value: "1" } });

    expect(screen.getByText(/Índice de intercalação:/)).toBeTruthy();
    expect(screen.getByText(/bloco\(s\) com mesma disciplina/)).toBeTruthy();
  });

  test("can re-assign a discipline to a filled slot", () => {
    render(<IntercalacaoPlanner />);
    const selects = screen.getAllByRole("combobox");

    // Fill with 1
    fireEvent.change(selects[0], { target: { value: "1" } });
    expect(screen.getAllByText(/Direito Adm/).length).toBeGreaterThan(1);

    // Fill with 2
    fireEvent.change(selects[0], { target: { value: "2" } });
    expect(screen.getAllByText(/Direito Cons/).length).toBeGreaterThan(1);
    expect(screen.getByText("1/21")).toBeTruthy();
  });

  test("can remove a discipline via the dropdown", () => {
    render(<IntercalacaoPlanner />);
    const selects = screen.getAllByRole("combobox");

    // Fill with 1
    fireEvent.change(selects[0], { target: { value: "1" } });
    expect(screen.getByText("1/21")).toBeTruthy();

    // Select empty
    fireEvent.change(selects[0], { target: { value: "" } });
    expect(screen.getByText("0/21")).toBeTruthy();
  });

  test("shows suggestion for top disciplines", () => {
    render(<IntercalacaoPlanner />);
    expect(
      screen.getByText(/Sugestão: intercale Direito Admin ↔ Direito Const/),
    ).toBeTruthy();
  });

  test("can hide the tip", () => {
    render(<IntercalacaoPlanner />);
    const closeTipBtn = screen
      .getAllByRole("button")
      .find((b) => b.querySelector('[data-testid="icon-x"]'));
    fireEvent.click(closeTipBtn!);

    expect(screen.queryByText("Como usar")).toBeNull();
  });
});
