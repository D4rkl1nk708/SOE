import { render } from "@testing-library/react";
import { describe, test, expect, vi } from "vitest";
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
import Calendar from "@/pages/Calendar";
import Disciplines from "@/pages/Disciplines";
import History from "@/pages/History";

// Mock matchMedia to prevent jsdom errors
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ResizeObserver mock
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Stable mock data to avoid infinite re-renders
const MOCK_STATS = {
  totalQuestions: 100,
  correctQuestions: 80,
  errorQuestions: 20,
  timeSpentSeconds: 3600,
  disciplineStats: [],
  settings: {
    onboardingCompleted: true,
    dailyGoalMinutes: 240,
    dashboardConfig: {
      extraWidgets: [
        "recommendation",
        "mentorBriefing",
        "heatmap",
        "dailyGoal",
        "todayRevisions",
      ],
    },
  },
  completedRevisions: 5,
  pendingRevisions: 10,
  totalTopics: 50,
};
const MOCK_TOPICS = { topics: [] };
const MOCK_REVISIONS = [];
const MOCK_NOTES = [];
const MOCK_EXAMS = [];
const MOCK_HEATMAP = [];
const MOCK_FLASHCARDS = [
  {
    id: 1,
    disciplineId: 1,
    topicId: 1,
    front: "Q1",
    back: "A1",
    interval: 1,
    easeFactor: 2.5,
    repetitions: 0,
    nextReviewDate: "2024-01-01",
    archived: false,
    tags: [],
    createdAt: "",
    updatedAt: "",
  },
];
const MOCK_DISCIPLINES = [
  {
    id: 1,
    name: "Direito",
    color: "#f00",
    weight: 10,
    order: 0,
    studyTimeSeconds: 0,
    topicCount: 2,
    performance: {
      questionsResolved: 10,
      accuracy: 70,
      correctCount: 7,
      errorCount: 3,
    },
  },
];

const createRecursiveProxy = () => {
  return new Proxy(
    {},
    {
      get: (target, prop) => {
        if (prop === "useQuery") return () => ({ data: [], isLoading: false });
        if (prop === "useMutation")
          return () => ({ mutate: vi.fn(), mutateAsync: vi.fn() });
        if (prop === "invalidate") return vi.fn();
        return createRecursiveProxy();
      },
    },
  );
};

vi.mock("@/lib/trpc", () => ({
  trpc: new Proxy(
    {},
    {
      get: (target, prop) => {
        if (prop === "useUtils") return () => createRecursiveProxy();
        if (prop === "useContext") return () => ({});

        // Return specific mocks for specific pages that need exact shapes
        if (prop === "topic") {
          return new Proxy(
            {
              list: {
                useQuery: () => ({ data: MOCK_TOPICS, isLoading: false }),
              },
            },
            {
              get: (t, p) =>
                p in t ? t[p as keyof typeof t] : createRecursiveProxy(),
            },
          );
        }
        if (prop === "flashcard") {
          return new Proxy(
            {
              list: {
                useQuery: () => ({ data: MOCK_FLASHCARDS, isLoading: false }),
              },
              due: {
                useQuery: () => ({ data: MOCK_FLASHCARDS, isLoading: false }),
              },
            },
            {
              get: (t, p) =>
                p in t ? t[p as keyof typeof t] : createRecursiveProxy(),
            },
          );
        }
        if (prop === "discipline") {
          return new Proxy(
            {
              list: {
                useQuery: () => ({ data: MOCK_DISCIPLINES, isLoading: false }),
              },
            },
            {
              get: (t, p) =>
                p in t ? t[p as keyof typeof t] : createRecursiveProxy(),
            },
          );
        }
        if (prop === "calendar") {
          return new Proxy(
            {
              getData: {
                useQuery: () => ({
                  data: { revisions: [], studySessions: [] },
                  isLoading: false,
                }),
              },
              getActivities: {
                useQuery: () => ({ data: [], isLoading: false }),
              },
            },
            {
              get: (t, p) =>
                p in t ? t[p as keyof typeof t] : createRecursiveProxy(),
            },
          );
        }
        if (prop === "history") {
          return new Proxy(
            {
              get: {
                useQuery: () => ({
                  data: { revisions: [], topics: [], disciplines: [] },
                  isLoading: false,
                }),
              },
            },
            {
              get: (t, p) =>
                p in t ? t[p as keyof typeof t] : createRecursiveProxy(),
            },
          );
        }
        if (prop === "dashboard") {
          return new Proxy(
            {
              getStats: {
                useQuery: () => ({ data: MOCK_STATS, isLoading: false }),
              },
              getWeeklyStats: { useQuery: () => ({ data: [] }) },
              getHeatmap: { useQuery: () => ({ data: MOCK_HEATMAP }) },
              getTodayMinutes: {
                useQuery: () => ({ data: { minutes: 45, goal: 120 } }),
              },
            },
            {
              get: (t, p) =>
                p in t ? t[p as keyof typeof t] : createRecursiveProxy(),
            },
          );
        }

        return createRecursiveProxy();
      },
    },
  ),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/test-path", vi.fn()],
  useRoute: () => [false, {}],
  useSearch: () => "",
  Link: ({ children }: any) => <a>{children}</a>,
}));

// Components use various Radix UI primitives and other heavy libraries,
// rendering them should pass without crashing if mocks are provided.
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

  test("MentorTab renders without crashing", () => {
    const { container } = render(<MentorTab />);
    expect(container).toBeTruthy();
  });

  test("Dashboard renders without crashing", () => {
    const { container } = render(<Dashboard />);
    expect(container).toBeTruthy();
  });

  test("QuestionSession renders without crashing", () => {
    const { container } = render(<QuestionSession />);
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

  test("Profile renders without crashing", () => {
    const { container } = render(<Profile />);
    expect(container).toBeTruthy();
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

  test("Simulado renders without crashing", () => {
    const { container } = render(<Simulado />);
    expect(container).toBeTruthy();
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

  test("Calendar renders without crashing", () => {
    const { container } = render(<Calendar />);
    expect(container).toBeTruthy();
  });

  test("Disciplines renders without crashing", () => {
    const { container } = render(<Disciplines />);
    expect(container).toBeTruthy();
  });

  test("History renders without crashing", () => {
    const { container } = render(<History />);
    expect(container).toBeTruthy();
  });
});
