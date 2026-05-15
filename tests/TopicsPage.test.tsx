import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import Topics from "@/pages/Topics";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// Mock trpc
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      topic: {
        list: { invalidate: vi.fn() },
      },
      dashboard: {
        getStats: { invalidate: vi.fn() },
      },
    }),
    discipline: {
      list: { useQuery: vi.fn() },
    },
    topic: {
      list: { useQuery: vi.fn() },
      create: { useMutation: vi.fn() },
      update: { useMutation: vi.fn() },
      delete: { useMutation: vi.fn() },
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
  Plus: () => <span data-testid="icon-plus" />,
  Pencil: () => <span data-testid="icon-pencil" />,
  Trash2: () => <span data-testid="icon-trash" />,
  BookMarked: () => <span data-testid="icon-bookmark" />,
  Search: () => <span data-testid="icon-search" />,
  BookOpen: () => <span data-testid="icon-book-open" />,
  Clock: () => <span data-testid="icon-clock" />,
  BarChart2: () => <span data-testid="icon-chart" />,
  Brain: () => <span data-testid="icon-brain" />,
  X: () => <span data-testid="icon-x" />,
}));

// Mock UI components that use portals or are hard to test
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: any) =>
    open ? <div data-testid="dialog-root">{children}</div> : null,
  DialogContent: ({ children }: any) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
  DialogTrigger: ({ children }: any) => <div>{children}</div>,
  useDialogComposition: () => ({
    isComposing: () => false,
    setComposing: () => {},
    justEndedComposing: () => false,
    markCompositionEnd: () => {},
  }),
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: any) => <div>{children}</div>,
  AlertDialogContent: ({ children }: any) => (
    <div data-testid="alert-dialog-content">{children}</div>
  ),
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogAction: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
  AlertDialogCancel: ({ children }: any) => <button>{children}</button>,
  AlertDialogTrigger: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/select", () => {
  const React = require("react");
  return {
    Select: ({ onValueChange, children }: any) =>
      React.createElement("div", { "data-testid": "UNIQUE_SELECT_ROOT" }, [
        React.createElement("input", {
          key: "input",
          type: "text",
          "data-testid": "UNIQUE_SELECT_INPUT",
          onChange: (e: any) => onValueChange(e.target.value),
        }),
        children,
      ]),
    SelectTrigger: ({ children }: any) =>
      React.createElement("div", null, children),
    SelectValue: () => null,
    SelectContent: ({ children }: any) =>
      React.createElement("div", null, children),
    SelectItem: ({ value, children }: any) =>
      React.createElement("div", { "data-testid": `item-${value}` }, children),
  };
});

describe("Topics Component", () => {
  const mockDisciplines = [
    { id: 1, name: "Direito Admin", color: "#f00" },
    { id: 2, name: "Direito Const", color: "#00f" },
  ];

  const mockTopics = {
    topics: [
      {
        id: 101,
        name: "Atos Administrativos",
        disciplineId: 1,
        studyTimeSeconds: 3600,
        performance: { questionsResolved: 10, accuracy: 80 },
        notes: "Importante",
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (trpc.discipline.list.useQuery as any).mockReturnValue({
      data: mockDisciplines,
    });
    (trpc.topic.list.useQuery as any).mockReturnValue({
      data: mockTopics,
      isLoading: false,
    });

    // Improved mutation mocks to trigger onSuccess
    const createMutate = vi.fn();
    (trpc.topic.create.useMutation as any).mockImplementation((opts: any) => ({
      mutate: createMutate.mockImplementation((vars: any) =>
        opts?.onSuccess?.(vars),
      ),
    }));

    const updateMutate = vi.fn();
    (trpc.topic.update.useMutation as any).mockImplementation((opts: any) => ({
      mutate: updateMutate.mockImplementation((vars: any) =>
        opts?.onSuccess?.(vars),
      ),
    }));

    const deleteMutate = vi.fn();
    (trpc.topic.delete.useMutation as any).mockImplementation((opts: any) => ({
      mutate: deleteMutate.mockImplementation((vars: any) =>
        opts?.onSuccess?.(vars),
      ),
    }));
  });

  test("renders topics list", () => {
    render(<Topics />);
    expect(screen.getByText("Atos Administrativos")).toBeTruthy();
    // Use getAllByText and check for first one or be more specific
    expect(screen.getAllByText("Direito Admin").length).toBeGreaterThan(0);
    expect(screen.getByText("1h 0m")).toBeTruthy();
    expect(screen.getByText("80%")).toBeTruthy();
  });

  test("filters topics by search input", async () => {
    render(<Topics />);
    const searchInput = screen.getByPlaceholderText(
      /Pesquisar por nome do tema/i,
    );
    fireEvent.change(searchInput, { target: { value: "Atos" } });

    expect(trpc.topic.list.useQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "Atos" }),
    );
  });

  test("filters topics by discipline", async () => {
    render(<Topics />);
    const select = screen.getByDisplayValue("Todas as Disciplinas");
    fireEvent.change(select, { target: { value: "1" } });

    expect(trpc.topic.list.useQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ disciplineId: 1 }),
    );
  });

  test("opens create dialog and handles topic creation flow", async () => {
    const mutate = vi.fn();
    (trpc.topic.create.useMutation as any).mockImplementation((opts: any) => ({
      mutate: mutate.mockImplementation((vars: any) =>
        opts?.onSuccess?.({ revisionsCreated: 3 }),
      ),
    }));

    render(<Topics />);

    // Open Dialog
    fireEvent.click(screen.getByText(/Registrar Novo Tema/i));
    expect(screen.getByText("Novo Tema de Estudo")).toBeTruthy();

    // Fill fields
    fireEvent.change(
      screen.getByPlaceholderText(/Ex: Controle de Constitucionalidade/i),
      {
        target: { value: "New Topic" },
      },
    );

    // Fill discipline (this one uses the mocked Select)
    const select = screen.getByTestId("UNIQUE_SELECT_INPUT");
    fireEvent.change(select, { target: { value: "1" } });

    // Submit first stage (opens briefing)
    fireEvent.click(screen.getByText("Salvar no Edital"));

    // Briefing stage
    expect(screen.getByText("Briefing de Pré-Estudo")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Seja breve/i), {
      target: { value: "Já sei um pouco." },
    });

    fireEvent.click(screen.getByText("Finalizar e Cadastrar"));

    await waitFor(() => {
      expect(mutate).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.queryByText("Briefing de Pré-Estudo")).toBeNull();
    });
  });

  test("opens edit dialog and handles update", async () => {
    const mutate = vi.fn();
    (trpc.topic.update.useMutation as any).mockImplementation((opts: any) => ({
      mutate: mutate.mockImplementation((vars: any) => opts?.onSuccess?.()),
    }));

    render(<Topics />);

    const pencilIcon = screen.getByTestId("icon-pencil");
    fireEvent.click(pencilIcon.closest("button")!);

    expect(screen.getByText("Editar Tema")).toBeTruthy();
    const input = screen.getByDisplayValue("Atos Administrativos");
    fireEvent.change(input, { target: { value: "Updated Topic" } });

    fireEvent.click(screen.getByText("Salvar Alterações"));

    expect(mutate).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("Editar Tema")).toBeNull());
  });

  test("handles topic deletion", async () => {
    const mutate = vi.fn();
    (trpc.topic.delete.useMutation as any).mockImplementation((opts: any) => ({
      mutate: mutate.mockImplementation((vars: any) => opts?.onSuccess?.()),
    }));

    render(<Topics />);

    const trashIcon = screen.getByTestId("icon-trash");
    fireEvent.click(trashIcon.closest("button")!);

    expect(screen.getByText("Excluir Tema?")).toBeTruthy();
    fireEvent.click(screen.getByText("Excluir"));

    expect(mutate).toHaveBeenCalled();
  });

  test("clears filters", async () => {
    (trpc.topic.list.useQuery as any).mockReturnValue({
      data: mockTopics,
      isLoading: false,
    });

    render(<Topics />);

    // Set a filter first
    const searchInput = screen.getByPlaceholderText(
      /Pesquisar por nome do tema/i,
    );
    fireEvent.change(searchInput, { target: { value: "Atos" } });

    // Now clear it
    const xBtn = screen
      .getAllByRole("button")
      .find((b) => b.querySelector('[data-testid="icon-x"]'));
    fireEvent.click(xBtn!);

    expect(trpc.topic.list.useQuery).toHaveBeenLastCalledWith(undefined);
  });

  test("shows loading state", () => {
    (trpc.topic.list.useQuery as any).mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    render(<Topics />);
    expect(screen.getByText("Carregando temas...")).toBeTruthy();
  });

  test("shows empty state", () => {
    (trpc.topic.list.useQuery as any).mockReturnValue({
      data: { topics: [] },
      isLoading: false,
    });
    render(<Topics />);
    expect(screen.getByText("Nenhum tema encontrado")).toBeTruthy();
  });

  test("validates required fields when creating", () => {
    render(<Topics />);

    fireEvent.click(screen.getByText(/Registrar Novo Tema/i));
    fireEvent.click(screen.getByText("Salvar no Edital"));

    expect(toast.error).toHaveBeenCalledWith(
      "Nome e disciplina são obrigatórios",
    );
  });

  test("updates study date and time", () => {
    render(<Topics />);
    fireEvent.click(screen.getByText(/Registrar Novo Tema/i));

    // Find inputs by type or placeholder
    const dateInput = screen.getByDisplayValue(
      new Date().toISOString().split("T")[0],
    );
    fireEvent.change(dateInput, { target: { value: "2024-01-01" } });
    expect(dateInput.getAttribute("value")).toBe("2024-01-01");

    const timeInput = screen.getByDisplayValue("60");
    fireEvent.change(timeInput, { target: { value: "120" } });
    expect(timeInput.getAttribute("value")).toBe("120");
  });
});
