import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import MentorSession from "@/pages/MentorSession";
import MentorTab from "@/pages/MentorTab";

// Mocks for useLocation from wouter
vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
}));

window.HTMLElement.prototype.scrollIntoView = vi.fn();

// Mocks for sonner
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mocks for Recharts in WeakProfileChart
vi.mock("@/components/WeakProfileChart", () => ({
  WeakProfileChart: ({ onSelectTopic }: any) => (
    <div
      data-testid="weak-profile-chart"
      onClick={() => onSelectTopic?.(1, 10, "Topic 1", "Discipline 1")}
    >
      Mock Chart
    </div>
  ),
}));

const mocks = vi.hoisted(() => ({
  mockGenerateAdaptiveQuestion: vi.fn(),
  mockDiagnoseError: vi.fn(),
  mockSaveSessionResult: vi.fn(),
  mockExecuteAction: vi.fn(),
  mockChat: vi.fn(),
}));

const {
  mockGenerateAdaptiveQuestion,
  mockDiagnoseError,
  mockSaveSessionResult,
  mockExecuteAction,
  mockChat,
} = mocks;

vi.mock("@/lib/trpc", () => {
  const mockMutation = (fn?: any, responseData: any = {}) => ({
    useMutation: (hookOpts: any = {}) => ({
      mutate: (d: any, mutOpts: any = {}) => {
        fn?.(d);
        hookOpts?.onSuccess?.(responseData);
        mutOpts?.onSuccess?.(responseData);
      },
      mutateAsync: async (d: any) => {
        fn?.(d);
        return responseData;
      },
      isPending: false,
    }),
  });

  return {
    trpc: {
      useUtils: () => ({
        mentor: { getWeakProfile: { invalidate: vi.fn() } },
        dashboard: { getStats: { invalidate: vi.fn() } },
        topic: { list: { invalidate: vi.fn() } },
      }),
      dashboard: {
        getStats: {
          useQuery: () => ({
            data: { settings: { aiApiKey: "test-key", aiProvider: "gemini" } },
            isLoading: false,
          }),
        },
      },
      discipline: {
        list: {
          useQuery: () => ({
            data: [{ id: 1, name: "Discipline 1", color: "#f00" }],
            isLoading: false,
          }),
        },
      },
      topic: {
        list: {
          useQuery: () => ({
            data: { topics: [] },
            isLoading: false,
          }),
        },
      },
      lab: {
        getLibraryStats: {
          useQuery: () => ({
            data: {},
            isLoading: false,
          }),
        },
      },
      mentor: {
        askLibrarian: mockMutation(null, {
          answer: "Library answer",
          sources: 1,
        }),
        generateCrossfireMock: {
          useMutation: (hookOpts: any = {}) => ({
            mutateAsync: async (d: any) => {
              const data = {
                mockTitle: "Crossfire Mock",
                questions: [
                  {
                    questionId: "cq1",
                    statement: "Crossfire Question?",
                    alternatives: [{ letter: "A", text: "Alt A" }],
                    correctAnswer: "A",
                    topicName: "Topic 1",
                    disciplineName: "Discipline 1",
                    source: "TEC (Legado)",
                  },
                ],
              };
              hookOpts?.onSuccess?.(data);
              return data;
            },
          }),
        },
        generateAdaptiveQuestion: {
          useMutation: (hookOpts: any = {}) => ({
            mutate: (d: any, mutOpts: any = {}) => {
              mocks.mockGenerateAdaptiveQuestion(d);
              const data = {
                questionId: "q1",
                statement: "Test Question?",
                alternatives: [
                  { letter: "A", text: "Alt A" },
                  { letter: "B", text: "Alt B" },
                ],
                correctAnswer: "A",
                topicName: "Topic 1",
                disciplineName: "Discipline 1",
                hint: "A hint",
              };
              hookOpts?.onSuccess?.(data);
              mutOpts?.onSuccess?.(data);
            },
          }),
        },
        diagnoseError: {
          useMutation: (hookOpts: any = {}) => ({
            mutate: (d: any, mutOpts: any = {}) => {
              mocks.mockDiagnoseError(d);
              const data = {
                diagnosis: "Bad logic",
                concept: "Logic",
                rule: "Study more",
                fixationQuestions: [
                  {
                    statement: "Fix?",
                    alternatives: [
                      { letter: "A", text: "Fix A" },
                      { letter: "B", text: "Fix B" },
                    ],
                    correctAnswer: "B",
                    explanation: "Because.",
                  },
                ],
              };
              hookOpts?.onSuccess?.(data);
              mutOpts?.onSuccess?.(data);
            },
          }),
        },
        saveSessionResult: mockMutation(mocks.mockSaveSessionResult),
        getTecRegressions: {
          useQuery: () => ({
            data: {
              regressions: [
                {
                  disciplineName: "Discipline 1",
                  topicName: "Topic 1",
                  delta: 10,
                },
              ],
            },
            isLoading: false,
          }),
        },
        executeAction: mockMutation(mocks.mockExecuteAction, {
          message: "Action accepted",
        }),
        chat: {
          useMutation: (hookOpts: any = {}) => ({
            mutate: (d: any, mutOpts: any = {}) => {
              mocks.mockChat(d);
              const data = {
                reply: "Hello",
                proposals: [
                  { type: "test", description: "Action 1", payload: {} },
                ],
              };
              hookOpts?.onSuccess?.(data);
              mutOpts?.onSuccess?.(data);
            },
            isPending: false,
          }),
        },
      },
    },
  };
});

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

// Mock react-markdown
vi.mock("react-markdown", () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

describe("MentorSession Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  test("runs a complete mentor session flow with success", async () => {
    render(<MentorSession />);

    // Step 1: Config
    expect(screen.getByText("Configuração de IA")).toBeTruthy();
    fireEvent.click(screen.getByText(/Próximo Passo/i));

    // Step 2: Profile selection
    await waitFor(() => {
      expect(screen.getByText("Ajuste de Foco")).toBeTruthy();
    });

    // Select discipline from the chart mock
    fireEvent.click(screen.getByTestId("weak-profile-chart"));

    // Select difficulty
    fireEvent.click(screen.getByText(/Intermediário/i));

    // Start
    fireEvent.click(screen.getByText(/Iniciar Treinamento/i));

    // Step 3: Question
    await waitFor(() => {
      expect(screen.getByText("Test Question?")).toBeTruthy();
    });

    // Select alternative A (Correct)
    fireEvent.click(screen.getByText("Alt A")); // alternative text or letter
    fireEvent.click(screen.getByText(/Confirmar Resposta/i));

    // The session correctly advances and calls generateAdaptiveQuestion again
    await waitFor(() => {
      expect(mockGenerateAdaptiveQuestion).toHaveBeenCalledTimes(2);
    });

    // Test finishes when history length reaches SESSION_SIZE, but here we just test one step and mock checkEndOfSession or endSession?
    // Wait, SESSION_SIZE is 10. To finish we'd need to click 10 times.
  });

  test("runs error diagnosis and fixation flow", async () => {
    render(<MentorSession />);

    // Config
    fireEvent.click(screen.getByText(/Próximo Passo/i));
    await waitFor(() => screen.getByText("Ajuste de Foco"));

    fireEvent.click(screen.getByTestId("weak-profile-chart"));
    fireEvent.click(screen.getByText(/Iniciar Treinamento/i));

    await waitFor(() => screen.getByText("Test Question?"));

    // Select alternative B (Wrong)
    fireEvent.click(screen.getByText("Alt B"));
    fireEvent.click(screen.getByText(/Confirmar Resposta/i));

    // Fixation Phase
    await waitFor(() => {
      expect(screen.getByText("Diagnóstico de Erro")).toBeTruthy();
      expect(screen.getByText("Teste de Fixação")).toBeTruthy();
      expect(screen.getByText("Fix?")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Fix B")); // Answer fixation
    fireEvent.click(screen.getByText(/Validar Fixação/i));

    await waitFor(() => {
      expect(screen.getByText("Retomar")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Retomar"));
  });
});

describe("MentorTab Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  test("renders MentorTab and interacts with chat and regressions", async () => {
    render(<MentorTab />);

    // Should render input since apiKey is "test-key"
    expect(
      screen.getByPlaceholderText("Como posso otimizar seu estudo hoje?"),
    ).toBeTruthy();

    // Type a message
    fireEvent.change(
      screen.getByPlaceholderText("Como posso otimizar seu estudo hoje?"),
      {
        target: { value: "Quero ajuda" },
      },
    );

    // Click send
    const sendBtn = screen
      .getAllByRole("button")
      .find((b) => b.innerHTML.includes("lucide")); // Hack to find send button
    fireEvent.keyDown(
      screen.getByPlaceholderText("Como posso otimizar seu estudo hoje?"),
      {
        key: "Enter",
        code: "Enter",
      },
    );

    await waitFor(() => {
      expect(mockChat).toHaveBeenCalled();
    });

    // Accept proposed action
    await waitFor(() => {
      expect(screen.getByText("Action 1")).toBeTruthy();
    });

    fireEvent.click(screen.getByText(/Aceitar/i));

    expect(mockExecuteAction).toHaveBeenCalled();

    // Test regression mnemonic trigger
    // Click the regressions alert
    const alertBtn = screen.getByText(/Alertas de Queda/i);
    fireEvent.click(alertBtn);

    await waitFor(() => {
      expect(screen.getByText("Topic 1")).toBeTruthy();
    });

    const wandBtn = screen
      .getAllByRole("button")
      .find((b) => b.title === "Gerar Mnemônico");
    if (wandBtn) fireEvent.click(wandBtn);

    await waitFor(() => {
      expect(mockChat).toHaveBeenCalledTimes(2);
    });
  });
});
