import { render } from "@testing-library/react";
import { describe, test, expect, vi } from "vitest";
import Statistics from "@/pages/Statistics";
import StatisticsPage from "@/pages/StatisticsPage";
import MentorSession from "@/pages/MentorSession";
import MentorTab from "@/pages/MentorTab";
import Dashboard from "@/pages/Dashboard";
import QuestionSession from "@/pages/QuestionSession";

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

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      dashboard: { getStats: { invalidate: vi.fn() } },
      discipline: { list: { invalidate: vi.fn() } },
      exam: { list: { invalidate: vi.fn() } },
      note: { list: { invalidate: vi.fn() } },
      topic: { list: { invalidate: vi.fn() } },
      calendar: { getData: { invalidate: vi.fn() } },
      questionError: { list: { invalidate: vi.fn() } },
      invalidate: vi.fn(),
    }),
    useContext: () => ({}),
    dashboard: {
      getStats: { useQuery: () => ({ data: MOCK_STATS, isLoading: false }) },
      getWeeklyStats: { useQuery: () => ({ data: [] }) },
      getHeatmap: { useQuery: () => ({ data: MOCK_HEATMAP }) },
      getTodayMinutes: {
        useQuery: () => ({ data: { minutes: 45, goal: 120 } }),
      },
    },
    mentor: {
      generateDeepAnalysis: { useMutation: () => ({ mutate: vi.fn() }) },
      chat: { useMutation: () => ({ mutate: vi.fn() }) },
      getRecentChats: { useQuery: () => ({ data: [] }) },
      generateAdaptiveQuestion: { useMutation: () => ({ mutate: vi.fn() }) },
      getTecRegressions: { useQuery: () => ({ data: { regressions: [] } }) },
      getStatsInsight: { useMutation: () => ({ mutate: vi.fn() }) },
      diagnoseError: { useMutation: () => ({ mutate: vi.fn() }) },
      saveSessionResult: { useMutation: () => ({ mutate: vi.fn() }) },
      getWeakProfile: { useQuery: () => ({ data: null }) },
      getMentorRecommendation: { useQuery: () => ({ data: null }) },
      getPlateauedTopics: { useQuery: () => ({ data: [] }) },
      generateBreakthroughDossier: { useMutation: () => ({ mutate: vi.fn() }) },
      getDailyBriefing: { useMutation: () => ({ mutate: vi.fn() }) },
      getConceptConfusions: { useQuery: () => ({ data: [] }) },
      generateMnemonicForConfusion: {
        useMutation: () => ({ mutate: vi.fn() }),
      },
      generateMaliciousMock: { useMutation: () => ({ mutate: vi.fn() }) },
      transcribeSubjectiveEssay: { useMutation: () => ({ mutate: vi.fn() }) },
      analyzeSubjectiveEssay: { useMutation: () => ({ mutate: vi.fn() }) },
      testKey: { useMutation: () => ({ mutate: vi.fn() }) },
    },
    v10: {
      getForgettingVelocity: { useQuery: () => ({ data: [] }) },
      getDisciplineRebalance: { useQuery: () => ({ data: [] }) },
      getPreExamStatus: { useQuery: () => ({ data: null }) },
      logStudyEnd: { useMutation: () => ({ mutate: vi.fn() }) },
      checkMassStudy: { useQuery: () => ({ data: null }) },
      logEmotion: { useMutation: () => ({ mutate: vi.fn() }) },
      updateV10Settings: { useMutation: () => ({ mutate: vi.fn() }) },
      saveRecallRating: { useMutation: () => ({ mutate: vi.fn() }) },
      getPeakHours: { useQuery: () => ({ data: [] }) },
      getEmotionCorrelation: { useQuery: () => ({ data: [] }) },
    },
    revision: {
      list: { useQuery: () => ({ data: MOCK_REVISIONS }) },
      markCompleted: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      complete: { useMutation: () => ({ mutate: vi.fn() }) },
    },
    history: {
      list: { useQuery: () => ({ data: [] }) },
    },
    mockExam: {
      list: { useQuery: () => ({ data: MOCK_EXAMS }) },
    },
    auth: {
      updateSettings: { useMutation: () => ({ mutate: vi.fn() }) },
    },
    exam: {
      list: { useQuery: () => ({ data: MOCK_EXAMS }) },
      upsert: { useMutation: () => ({ mutate: vi.fn() }) },
      delete: { useMutation: () => ({ mutate: vi.fn() }) },
    },
    discipline: {
      list: { useQuery: () => ({ data: [] }) },
      update: { useMutation: () => ({ mutate: vi.fn() }) },
      reorder: { useMutation: () => ({ mutate: vi.fn() }) },
      create: { useMutation: () => ({ mutate: vi.fn() }) },
    },
    topic: {
      list: { useQuery: () => ({ data: MOCK_TOPICS }) },
      resetAllStats: { useMutation: () => ({ mutate: vi.fn() }) },
      setPerformance: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      addStudyTime: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      update: { useMutation: () => ({ mutate: vi.fn() }) },
      reorder: { useMutation: () => ({ mutate: vi.fn() }) },
    },
    note: {
      list: { useQuery: () => ({ data: MOCK_NOTES }) },
    },
    import: {
      getICalUrl: { useQuery: () => ({ data: { token: "mock" } }) },
      tecConcursos: { useMutation: () => ({ mutate: vi.fn() }) },
    },
    questionError: {
      save: { useMutation: () => ({ mutate: vi.fn() }) },
    },
    essay: {
      list: { useQuery: () => ({ data: [] }) },
      save: { useMutation: () => ({ mutate: vi.fn() }) },
      analyze: { useMutation: () => ({ mutate: vi.fn() }) },
      transcribe: { useMutation: () => ({ mutate: vi.fn() }) },
      delete: { useMutation: () => ({ mutate: vi.fn() }) },
    },
  },
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
});
