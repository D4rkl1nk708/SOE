import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock ResizeObserver for Recharts
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

import Sync from "@/pages/Sync";
import QuestionSession from "@/pages/QuestionSession";
import Revisions from "@/pages/Revisions";
import QuestionErrors from "@/pages/QuestionErrors";

// Mock lucide-react
vi.mock("lucide-react", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const mocks: any = {};
  Object.keys(actual).forEach((key) => {
    mocks[key] = () => <div data-testid={`icon-${key}`} />;
  });
  return mocks;
});

// Mock wouter
vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
  useSearch: () => "",
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

// Mock capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => false,
  },
  CapacitorHttp: {
    request: vi.fn(),
  },
}));

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

// Mock dynamic imports
vi.mock("@/lib/localDb", () => ({
  localImportImportBackup: vi.fn().mockResolvedValue({}),
  localImportExportBackup: vi.fn().mockResolvedValue("{}"),
  localCalendarGetData: vi
    .fn()
    .mockResolvedValue({ revisions: [], topics: [] }),
}));

vi.mock("@/lib/trpc", () => {
  const { vi } = import.meta.vitest;
  const mockSetPerformance = vi.fn();
  const mockAddStudyTime = vi.fn();
  const mockSaveQuestionError = vi.fn();
  const MOCK_STATS = {
    settings: {
      onboardingCompleted: true,
      dailyGoalMinutes: 240,
      dashboardConfig: {
        extraWidgets: [
          "recommendation",
          "heatmap",
          "dailyGoal",
          "todayRevisions",
        ],
      },
    },
    disciplineStats: [
      {
        id: 1,
        name: "Math",
        color: "#f00",
        performance: { questionsResolved: 0, correctCount: 0 },
      },
    ],
    completedRevisions: 0,
    pendingRevisions: 0,
    totalTopics: 0,
  };
  const MOCK_TOPICS = {
    topics: [{ id: 10, name: "Algebra", disciplineId: 1 }],
    disciplines: [{ id: 1, name: "Math", color: "#f00" }],
  };

  const proxyCache = new Map<string, any>();
  const queryResultCache = new Map<string, any>();
  const mutationResultCache = new Map<string, any>();

  const createRecursiveProxy = (path: string = ""): any => {
    if (proxyCache.has(path)) return proxyCache.get(path);

    const f = vi.fn();
    const proxy = new Proxy(f, {
      get: (target: any, prop) => {
        if (typeof prop !== "string") return target[prop];
        const fullPath = path ? `${path}.${prop}` : prop;

        if (prop === "useQuery") {
          return (input: any) => {
            const cacheKey = `query:${path}:${JSON.stringify(input)}`;
            if (!queryResultCache.has(cacheKey)) {
              let data: any = undefined;
              if (path === "dashboard.getStats") data = MOCK_STATS;
              else if (path === "v10.getPreExamStatus")
                data = { active: false };
              else if (path === "discipline.list")
                data = MOCK_STATS.disciplineStats;
              else if (path === "topic.list") data = MOCK_TOPICS;
              else if (path === "questionError.list") data = { items: [] };
              else if (path === "revision.list") data = [];
              else if (path === "import.getICalUrl") data = { token: "test" };

              queryResultCache.set(cacheKey, {
                data,
                isLoading: false,
                refetch: vi.fn(),
                isSuccess: true,
              });
            }
            return queryResultCache.get(cacheKey);
          };
        }
        if (prop === "useMutation") {
          return (opts: any) => {
            const cacheKey = `mutation:${path}`;
            if (!mutationResultCache.has(cacheKey)) {
              mutationResultCache.set(cacheKey, {
                mutate: vi.fn(),
                mutateAsync: vi.fn().mockResolvedValue({}),
                isPending: false,
                isLoading: false,
              });
            }
            return mutationResultCache.get(cacheKey);
          };
        }
        if (prop === "useUtils") return () => trpcMock;
        if (prop === "setData" || prop === "invalidate" || prop === "fetch") {
          const cacheKey = `fn:${fullPath}`;
          if (!proxyCache.has(cacheKey)) proxyCache.set(cacheKey, vi.fn());
          return proxyCache.get(cacheKey);
        }

        return createRecursiveProxy(fullPath);
      },
    });
    proxyCache.set(path, proxy);
    return proxy;
  };

  const trpcMock = createRecursiveProxy();

  return {
    trpc: trpcMock,
  };
});

global.fetch = vi.fn();

describe("Sync Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockImplementation((url: string) => {
      if (url === "/api/sync/info")
        return Promise.resolve({
          json: async () => ({ ips: ["192.168.1.5"], port: 3000 }),
        });
      if (url === "/api/backup/list")
        return Promise.resolve({ json: async () => ({ backups: [] }) });
      return Promise.resolve({ json: async () => ({}) });
    });
  });

  test("renders Sync page", async () => {
    render(<Sync />);
    await waitFor(() => {
      expect(screen.getByText("Sync & Backup")).toBeTruthy();
    });
  });
});

describe("QuestionErrors Component", () => {
  test("renders QuestionErrors", async () => {
    render(<QuestionErrors />);
    expect(screen.getByText(/Painel de Erros/i)).toBeTruthy();
  });
});

describe("Revisions Component", () => {
  test("renders Revisions page", async () => {
    render(<Revisions />);
    expect(screen.getByText("Revisões")).toBeTruthy();
  });
});

describe("QuestionSession Component", () => {
  test("runs through a session", async () => {
    console.log("TEST START: runs through a session");
    render(<QuestionSession />);
    const discSelect = screen.getByTestId(
      "discipline-select",
    ) as HTMLSelectElement;
    const topicSelect = screen.getByTestId("topic-select") as HTMLSelectElement;

    // Wait for disciplines to load
    await waitFor(() => expect(discSelect.options.length).toBeGreaterThan(1), {
      timeout: 10000,
    });

    // Select Discipline
    await act(async () => {
      fireEvent.change(discSelect, { target: { value: "1" } });
    });
    await waitFor(() => expect(discSelect.value).toBe("1"));

    // Wait for topics to load
    await waitFor(() => expect(topicSelect.options.length).toBeGreaterThan(1), {
      timeout: 10000,
    });

    // Select Topic
    await act(async () => {
      fireEvent.change(topicSelect, { target: { value: "10" } });
    });
    await waitFor(() => expect(topicSelect.value).toBe("10"));

    const iniciarBtn = screen.getByRole("button", { name: /INICIAR/i });
    await waitFor(
      () => {
        if (iniciarBtn.hasAttribute("disabled"))
          throw new Error("STILL DISABLED");
      },
      { timeout: 10000 },
    );

    await act(async () => {
      fireEvent.click(iniciarBtn);
    });

    await waitFor(() => expect(screen.getByText(/Questão 1/i)).toBeTruthy(), {
      timeout: 10000,
    });
    fireEvent.click(screen.getByText("ERREI"));
    await waitFor(() =>
      expect(screen.getByText(/O que causou o erro?/i)).toBeTruthy(),
    );
    fireEvent.click(screen.getByText("Atenção"));
  }, 30000);
});
