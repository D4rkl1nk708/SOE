import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import Calendar from "@/pages/Calendar";
import Notes from "@/pages/Notes";
import Statistics from "@/pages/Statistics";

// Mock wouter
vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

document.execCommand = vi.fn();

// Mock Recharts
vi.mock("recharts", () => {
  const Original = vi.importActual("recharts");
  return {
    ...Original,
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
    BarChart: ({ children }: any) => (
      <div data-testid="barchart">{children}</div>
    ),
    Bar: () => <div />,
    XAxis: () => <div />,
    YAxis: () => <div />,
    CartesianGrid: () => <div />,
    Tooltip: () => <div />,
    Cell: () => <div />,
    LineChart: ({ children }: any) => (
      <div data-testid="linechart">{children}</div>
    ),
    Line: () => <div />,
  };
});

// Mock framer-motion
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual("framer-motion");
  return {
    ...(actual as any),
    AnimatePresence: ({ children }: any) => <>{children}</>,
    motion: {
      div: ({ children, onClick, ...props }: any) => (
        <div onClick={onClick} {...props}>
          {children}
        </div>
      ),
    },
  };
});

// Mock useDashboard
vi.mock("@/hooks/useDashboard", () => ({
  useScheduleSettings: () => ({
    scheduleDialogOpen: false,
    setScheduleDialogOpen: vi.fn(),
    testIntervalInput: "3",
    setTestIntervalInput: vi.fn(),
    revisionIntervalInput: "25",
    setRevisionIntervalInput: vi.fn(),
    revisionSecondPhaseInput: "50",
    setRevisionSecondPhaseInput: vi.fn(),
    handleSaveSchedule: vi.fn(),
    isSaving: false,
  }),
}));

const mockCalendarGetActivities = vi.fn();
const mockCalendarSaveLink = vi.fn();
const mockCalendarMarkCompleted = vi.fn();

const mockNoteList = vi.fn();
const mockNoteUpsert = vi.fn();
const mockNoteDelete = vi.fn();
const mockGenerateFlashcards = vi.fn();

const mockGetStatsInsight = vi.fn();
const mockResetAllStats = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      dashboard: {
        getStats: {
          invalidate: vi.fn(),
          fetch: vi.fn().mockResolvedValue({ settings: { aiApiKey: "test" } }),
        },
      },
      calendar: { getActivities: { invalidate: vi.fn() } },
      note: { list: { invalidate: vi.fn() } },
      flashcard: { list: { invalidate: vi.fn() } },
      topic: { list: { invalidate: vi.fn() } },
      client: {
        ai: {
          processText: {
            mutate: vi.fn().mockResolvedValue({ result: "Processed" }),
          },
        },
      },
    }),
    dashboard: {
      getStats: {
        useQuery: () => ({
          data: {
            settings: { aiApiKey: "test", aiProvider: "gemini" },
            disciplineStats: [
              {
                disciplineId: 1,
                name: "Math",
                color: "#f00",
                performance: {
                  questionsResolved: 10,
                  correctCount: 8,
                  accuracy: 80,
                },
                studyTimeSeconds: 3600,
              },
            ],
          },
          isLoading: false,
        }),
      },
      getWeeklyStats: {
        useQuery: () => ({
          data: { thisWeek: { questions: 10 }, lastWeek: { questions: 5 } },
          isLoading: false,
        }),
      },
    },
    calendar: {
      getActivities: {
        useQuery: () => ({
          data: mockCalendarGetActivities(),
          isLoading: false,
        }),
      },
      saveLink: {
        useMutation: (opts: any = {}) => ({
          mutate: (d: any) => {
            mockCalendarSaveLink(d);
            opts?.onSuccess?.();
          },
        }),
      },
      markCompleted: {
        useMutation: (opts: any = {}) => ({
          mutate: (d: any) => {
            mockCalendarMarkCompleted(d);
            opts?.onSuccess?.();
          },
        }),
      },
    },
    note: {
      list: { useQuery: () => ({ data: mockNoteList(), isLoading: false }) },
      upsert: {
        useMutation: (opts: any = {}) => ({
          mutate: (d: any, mOpts: any = {}) => {
            mockNoteUpsert(d);
            opts?.onSuccess?.({ id: 1 });
            mOpts?.onSuccess?.({ id: 1 });
          },
        }),
      },
      delete: {
        useMutation: (opts: any = {}) => ({
          mutate: (d: any) => {
            mockNoteDelete(d);
            opts?.onSuccess?.();
          },
        }),
      },
    },
    discipline: {
      list: {
        useQuery: () => ({
          data: [{ id: 1, name: "Math", color: "#f00" }],
          isLoading: false,
        }),
      },
    },
    topic: {
      list: {
        useQuery: () => ({
          data: { topics: [{ id: 10, disciplineId: 1, name: "Algebra" }] },
          isLoading: false,
        }),
      },
      resetAllStats: {
        useMutation: (opts: any = {}) => ({
          mutate: () => {
            mockResetAllStats();
            opts?.onSuccess?.();
          },
        }),
      },
    },
    ai: {
      generateFlashcardsFromText: {
        useMutation: (opts: any = {}) => ({
          mutate: (d: any) => {
            mockGenerateFlashcards(d);
            opts?.onSuccess?.({ createdCount: 5 });
          },
        }),
      },
    },
    mockExam: {
      list: {
        useQuery: () => ({
          data: [
            {
              id: 1,
              date: new Date().toISOString(),
              totalQuestions: 100,
              correct: 80,
            },
          ],
          isLoading: false,
        }),
      },
    },
    revision: {
      list: { useQuery: () => ({ data: [{ id: 1 }], isLoading: false }) },
    },
    mentor: {
      getStatsInsight: {
        useMutation: (opts: any = {}) => ({
          mutate: (d: any, mOpts: any = {}) => {
            mockGetStatsInsight(d);
            opts?.onSuccess?.({ insight: "You are doing great!" });
            mOpts?.onSuccess?.({ insight: "You are doing great!" });
            mOpts?.onSettled?.();
          },
        }),
      },
    },
  },
}));

describe("Calendar Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCalendarGetActivities.mockReturnValue([
      {
        id: 1,
        type: "study",
        date: new Date().toISOString().split("T")[0],
        topicId: 10,
        topicName: "Algebra",
        disciplineId: 1,
        disciplineName: "Math",
        disciplineColor: "#f00",
        completed: false,
      },
    ]);
  });

  test("renders calendar and interacts with activities", async () => {
    render(<Calendar />);

    // Check if current year is rendered (e.g. 2026)
    expect(screen.getByText(/202/i)).toBeTruthy();

    // Click on the day containing 'Algebra' activity to open details
    const algebraElements = screen.getAllByText("Algebra");
    fireEvent.click(algebraElements[0]);

    // Day detail modal should open
    await waitFor(() => {
      expect(screen.getByText("Programação Diária")).toBeTruthy();
    });

    // Check activity
    expect(screen.getAllByText("Algebra").length).toBeGreaterThan(0);

    // Click "Marcar como feito"
    fireEvent.click(screen.getByText("Marcar como feito"));
    expect(mockCalendarMarkCompleted).toHaveBeenCalled();

    // Click "Treinar"
    fireEvent.click(screen.getByText(/Treinar/i));
  });
});

describe("Notes Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNoteList.mockReturnValue([
      {
        id: 1,
        title: "Note 1",
        content: "<p>Hello</p>",
        disciplineId: 1,
        topicId: 10,
        updatedAt: new Date().toISOString(),
      },
    ]);
  });

  test("renders notes, creates and interacts with AI", async () => {
    render(<Notes />);

    expect(screen.getByText("Note 1")).toBeTruthy();

    // Create new note
    fireEvent.click(
      screen.getAllByRole("button").find((b) => b.innerHTML.includes("Plus")) ||
        screen.getByText("+ Nova Anotação"),
    );

    await waitFor(() => {
      expect(screen.getByText("Novo Documento")).toBeTruthy();
    });

    // Fill title
    fireEvent.change(screen.getByPlaceholderText(/Ex: Controle/i), {
      target: { value: "New Note" },
    });

    // Select discipline
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "1" } });

    // Click create
    fireEvent.click(screen.getByText("Criar Documento"));

    expect(mockNoteUpsert).toHaveBeenCalled();

    // Click on Note 1 to activate it
    fireEvent.click(screen.getByText("Note 1"));

    // Generate flashcards
    await waitFor(() => {
      expect(screen.getByTestId("btn-generate-flashcards")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("btn-generate-flashcards"));

    // Delete note
    window.confirm = vi.fn().mockReturnValue(true);
    fireEvent.click(screen.getByTestId("btn-delete-note"));

    expect(mockNoteDelete).toHaveBeenCalled();
  });
});

describe("Statistics Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders statistics and interactions", async () => {
    render(<Statistics />);

    // Hero Stats
    expect(screen.getByText("Tempo de Estudo")).toBeTruthy();
    expect(screen.getAllByText("80%").length).toBeGreaterThan(0); // accuracy

    // Mentor Insight should appear
    await waitFor(() => {
      expect(screen.getByText("Destaque do Mentor IA")).toBeTruthy();
      expect(screen.getByText("You are doing great!")).toBeTruthy();
    });

    // Reset Stats
    const resetBtn = screen.getByTitle("Zerar estatísticas de questões");
    fireEvent.click(resetBtn);

    await waitFor(() => {
      expect(screen.getByText("Zerar Agora")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Zerar Agora"));
    expect(mockResetAllStats).toHaveBeenCalled();
  });
});
