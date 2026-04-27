import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import Dashboard from "@/pages/Dashboard";
import { trpc } from "@/lib/trpc";

// Mock hooks
vi.mock("@/hooks/useDashboard", () => {
  return {
    useExams: () => ({
      exams: [{ id: "1", name: "Exam 1", date: "2025-01-01" }],
      openCreate: vi.fn(),
      dialogOpen: false,
      setDialogOpen: vi.fn(),
      examNameInput: "",
      setExamNameInput: vi.fn(),
      examDateInput: "",
      setExamDateInput: vi.fn(),
      handleSave: vi.fn(),
    }),
    useScheduleSettings: () => ({
      scheduleDialogOpen: false,
      setScheduleDialogOpen: vi.fn(),
      testIntervalInput: 1,
      setTestIntervalInput: vi.fn(),
      revisionIntervalInput: 1,
      setRevisionIntervalInput: vi.fn(),
      revisionSecondPhaseInput: 1,
      setRevisionSecondPhaseInput: vi.fn(),
      handleSaveSchedule: vi.fn(),
      isSaving: false,
    }),
    useTecImport: () => ({
      isImporting: false,
      dialogOpen: false,
      setDialogOpen: vi.fn(),
      fileInputRef: { current: { click: vi.fn() } },
      handleFileUpload: vi.fn(),
    }),
    useQuestionsDialog: () => ({
      open: false,
      setOpen: vi.fn(),
      openDialog: vi.fn(),
      correctInput: "",
      setCorrectInput: vi.fn(),
      wrongInput: "",
      setWrongInput: vi.fn(),
      handleSave: vi.fn(),
    }),
    useDragReorder: () => ({
      orderedStats: [
        {
          disciplineId: 1,
          name: "Direito Admin",
          color: "#000",
          studyTimeSeconds: 3600,
          performance: { questionsResolved: 10, correctCount: 7 },
          topics: [{ id: 1, name: "Atos", performance: { accuracy: 80 } }],
        },
      ],
      handleDragStart: vi.fn(),
      handleDragOver: vi.fn(),
      handleDragEnd: vi.fn(),
    }),
    useDashboardWidgets: () => ({
      showExtra: (id: string) => true,
      toggleExtra: vi.fn(),
    }),
    useTimeEdit: () => ({}),
    formatStudyTime: (s: number) => "1h",
  };
});

// Mock UI Components
vi.mock("@/components/StudyHeatmap", () => ({
  StudyHeatmap: () => <div data-testid="study-heatmap" />,
}));
vi.mock("@/components/DashboardWidgets", () => ({
  DailyGoalWidget: () => <div data-testid="daily-goal-widget" />,
  TodayRevisions: () => <div data-testid="today-revisions" />,
}));
vi.mock("@/components/OnboardingWizard", () => ({
  OnboardingWizard: () => <div data-testid="onboarding-wizard" />,
}));
vi.mock("@/components/PreExamBanner", () => ({
  PreExamBanner: () => <div data-testid="pre-exam-banner" />,
}));
vi.mock("@/components/MassStudyAlert", () => ({
  MassStudyAlert: () => <div data-testid="mass-study-alert" />,
}));
vi.mock("@/components/SleepWarning", () => ({
  SleepWarning: () => <div data-testid="sleep-warning" />,
}));
vi.mock("@/components/ConfusionMatrixWidget", () => ({
  ConfusionMatrixWidget: () => <div data-testid="confusion-matrix" />,
}));
vi.mock("@/components/PlateauRadarWidget", () => ({
  PlateauRadarWidget: () => <div data-testid="plateau-radar" />,
}));
vi.mock("@/components/RecommendationCard", () => ({
  RecommendationCard: () => <div data-testid="recommendation-card" />,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      dashboard: { getStats: { invalidate: vi.fn() } },
    }),
    dashboard: {
      getStats: {
        useQuery: () => ({
          data: { settings: { onboardingCompleted: true } },
          isLoading: false,
        }),
      },
      getHeatmap: { useQuery: () => ({ data: [] }) },
    },
    note: {
      list: { useQuery: () => ({ data: [] }) },
    },
    topic: {
      setPerformance: { useMutation: () => ({ mutate: vi.fn() }) },
    },
  },
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe("Dashboard Component", () => {
  test("renders all widgets when showExtra is true", () => {
    render(<Dashboard />);
    expect(screen.getByTestId("study-heatmap")).toBeTruthy();
    expect(screen.getByTestId("daily-goal-widget")).toBeTruthy();
    expect(screen.getByTestId("today-revisions")).toBeTruthy();
    expect(screen.getByTestId("recommendation-card")).toBeTruthy();
    expect(screen.getByTestId("plateau-radar")).toBeTruthy();
    expect(screen.getByTestId("confusion-matrix")).toBeTruthy();
  });

  test("can interact with discipline list", () => {
    render(<Dashboard />);
    const disciplineItem = screen.getByText("Direito Admin");
    expect(disciplineItem).toBeTruthy();

    // Expand discipline
    fireEvent.click(disciplineItem);

    // Check if topic is visible
    expect(screen.getByText("Atos")).toBeTruthy();
  });

  test("can open customize dialog", () => {
    render(<Dashboard />);
    const customizeBtn = screen.getByText(/Personalizar/i);
    fireEvent.click(customizeBtn);

    // Dialog Title
    expect(screen.getByText("Recomendação (IA)")).toBeTruthy();
  });
});
