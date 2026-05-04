import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { describe, test, expect, vi } from "vitest";

// Mock ResizeObserver for Recharts
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

import Statistics from "@/pages/Statistics";
import StatisticsPage from "@/pages/StatisticsPage";
import MentorSession from "@/pages/MentorSession";
import MentorTab from "@/pages/MentorTab";
import Dashboard from "@/pages/Dashboard";
import QuestionSession from "@/pages/QuestionSession";
import Lab from "@/pages/Lab";
import Sync from "@/pages/Sync";
import Profile from "@/pages/Profile";
import Topics from "@/pages/Topics";
import Revisions from "@/pages/Revisions";
import Notes from "@/pages/Notes";
import Simulado from "@/pages/Simulado";
import Home from "@/pages/Home";
import QuestionErrors from "@/pages/QuestionErrors";
import MockExams from "@/pages/MockExams";
import Edital from "@/pages/Edital";
import Flashcards from "@/pages/Flashcards";

// Mock wouter
vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
  useSearch: () => "",
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

// Mock lucide-react
vi.mock("lucide-react", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const mocks: any = {};
  Object.keys(actual).forEach((key) => {
    mocks[key] = () => <div data-testid={`icon-${key}`} />;
  });
  return mocks;
});

// Mock trpc
vi.mock("@/lib/trpc", () => {
  const MOCK_STATS = {
    stats: {
      totalQuestions: 100,
      totalCorrect: 80,
      totalStudyTime: 3600,
      recentPerformance: [],
      disciplinePerformance: [],
      dailyGoal: 50,
      todayCount: 10,
      streak: 5,
      preferences: {
        dailyGoal: 50,
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
        performance: {},
        studyTimeSeconds: 0,
      },
    ],
    completedRevisions: 0,
    pendingRevisions: 0,
    totalTopics: 1,
  };
  const MOCK_TOPICS = {
    topics: [{ id: 10, name: "Algebra", disciplineId: 1 }],
    disciplines: [{ id: 1, name: "Math", color: "#f00" }],
  };
  const MOCK_FLASHCARDS = [];
  const MOCK_DISCIPLINES = MOCK_STATS.disciplineStats;
  const MOCK_HEATMAP = [];

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
              else if (path === "dashboard.getHeatmap") data = MOCK_HEATMAP;
              else if (path === "topic.list") data = MOCK_TOPICS;
              else if (path === "flashcard.list" || path === "flashcard.due")
                data = MOCK_FLASHCARDS;
              else if (path === "discipline.list") data = MOCK_DISCIPLINES;
              else if (path === "questionError.list") data = { items: [] };
              else if (path === "v10.getPreExamStatus")
                data = { active: false };
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

describe("Page Components", () => {
  test("Statistics renders without crashing", () => {
    const { container } = render(<Statistics />);
    expect(container).toBeTruthy();
  });

  test("StatisticsPage renders without crashing", () => {
    const { container } = render(<StatisticsPage />);
    expect(container).toBeTruthy();
  });

  test("MentorSession renders without crashing", () => {
    const { container } = render(<MentorSession />);
    expect(container).toBeTruthy();
  });

  test("QuestionSession renders without crashing", () => {
    const { container } = render(<QuestionSession />);
    expect(container).toBeTruthy();
  });

  test("MentorTab renders without crashing", () => {
    const { container } = render(<MentorTab />);
    expect(container).toBeTruthy();
  });

  test("Dashboard renders without crashing", () => {
    const { container } = render(<Dashboard />);
    expect(container).toBeTruthy();
  });

  test("Lab renders without crashing", () => {
    const { container } = render(<Lab />);
    expect(container).toBeTruthy();
  });

  test("Sync renders without crashing", () => {
    const { container } = render(<Sync />);
    expect(container).toBeTruthy();
  });

  test("Profile renders without crashing", async () => {
    await act(async () => {
      render(<Profile />);
    });
    // Check for tab labels present in Profile page
    expect(screen.getAllByText(/Ajustes/i).length).toBeGreaterThan(0);
  });

  test("Topics renders without crashing", () => {
    const { container } = render(<Topics />);
    expect(container).toBeTruthy();
  });

  test("Revisions renders without crashing", () => {
    const { container } = render(<Revisions />);
    expect(container).toBeTruthy();
  });

  test("Notes renders without crashing", () => {
    const { container } = render(<Notes />);
    expect(container).toBeTruthy();
  });

  test("Simulado renders without crashing", async () => {
    await act(async () => {
      render(<Simulado />);
    });
    expect(screen.getAllByText(/Simulado/i).length).toBeGreaterThan(0);
  });

  test("Home renders without crashing", () => {
    const { container } = render(<Home />);
    expect(container).toBeTruthy();
  });

  test("QuestionErrors renders without crashing", () => {
    const { container } = render(<QuestionErrors />);
    expect(container).toBeTruthy();
  });

  test("MockExams renders without crashing", () => {
    const { container } = render(<MockExams />);
    expect(container).toBeTruthy();
  });

  test("Edital renders without crashing", () => {
    const { container } = render(<Edital />);
    expect(container).toBeTruthy();
  });

  test("Flashcards renders without crashing", () => {
    const { container } = render(<Flashcards />);
    expect(container).toBeTruthy();
  });
});
