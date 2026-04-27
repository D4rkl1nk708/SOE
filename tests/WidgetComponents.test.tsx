import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { PlateauRadarWidget } from "@/components/PlateauRadarWidget";
import { ScheduleDialog } from "@/components/ScheduleDialog";
import { RecallRatingDialog } from "@/components/RecallRatingDialog";
import { OnboardingWizard } from "@/components/OnboardingWizard";

// Mock trpc
const mockGetStats = vi.fn();
const mockGetPlateauedTopics = vi.fn();
const mockGenerateDossier = vi.fn();
const mockCreateDiscipline = vi.fn();
const mockUpdateSettings = vi.fn();
const mockSaveRecallRating = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      dashboard: { getStats: { invalidate: vi.fn() } },
      topic: { list: { invalidate: vi.fn() } },
      discipline: { list: { invalidate: vi.fn() } },
      revision: { list: { invalidate: vi.fn() } },
      questionError: { list: { invalidate: vi.fn() } },
    }),
    dashboard: {
      getStats: { useQuery: () => ({ data: mockGetStats() }) },
    },
    mentor: {
      getPlateauedTopics: {
        useQuery: () => ({ data: mockGetPlateauedTopics(), isLoading: false }),
      },
      generateBreakthroughDossier: {
        useMutation: (opts: any) => ({
          mutate: (d: any) => {
            mockGenerateDossier(d);
            opts?.onSuccess?.([
              { type: "analogy", title: "Test", content: "Test Content" },
            ]);
          },
          isPending: false,
        }),
      },
    },
    discipline: {
      list: { useQuery: () => ({ data: [] }) },
      create: { useMutation: () => ({ mutateAsync: mockCreateDiscipline }) },
    },
    topic: {
      list: { useQuery: () => ({ data: { topics: [] } }) },
    },
    auth: {
      updateSettings: {
        useMutation: () => ({ mutateAsync: mockUpdateSettings }),
      },
    },
    v10: {
      saveRecallRating: {
        useMutation: (opts: any) => ({
          mutate: (d: any) => {
            mockSaveRecallRating(d);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
    },
  },
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("PlateauRadarWidget Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStats.mockReturnValue({ settings: { aiApiKey: "test-key" } });
    mockGetPlateauedTopics.mockReturnValue([
      {
        topicName: "Algebra",
        disciplineName: "Math",
        accuracy: 45,
        questionsResolved: 10,
        revisionCount: 5,
      },
    ]);
  });

  test("renders PlateauRadarWidget and generates dossier", async () => {
    render(<PlateauRadarWidget />);
    expect(screen.getByText("Radar de Estagnação")).toBeTruthy();

    const topicItem = screen.getByText("Algebra");
    fireEvent.click(topicItem);

    expect(screen.getByText(/Intervenção: Algebra/i)).toBeTruthy();

    const generateBtn = screen.getByText("Gerar Dossiê");
    fireEvent.click(generateBtn);

    await waitFor(() => expect(screen.getByText("Test Content")).toBeTruthy());
  });
});

describe("ScheduleDialog Component", () => {
  test("renders and updates values", () => {
    const onSave = vi.fn();
    const setTestInterval = vi.fn();
    render(
      <ScheduleDialog
        open={true}
        onOpenChange={() => {}}
        testInterval="7"
        setTestInterval={setTestInterval}
        revisionInterval="15"
        setRevisionInterval={vi.fn()}
        revisionSecondPhase="30"
        setRevisionSecondPhase={vi.fn()}
        onSave={onSave}
        isSaving={false}
      />,
    );

    expect(screen.getByText("Configurar Ciclo")).toBeTruthy();

    const inputs = screen.getAllByRole("spinbutton");
    fireEvent.change(inputs[0], { target: { value: "10" } });
    expect(setTestInterval).toHaveBeenCalledWith("10");

    const saveBtn = screen.getByText("Salvar");
    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalled();
  });
});

describe("RecallRatingDialog Component", () => {
  test("runs through recall and rating flow", async () => {
    const onDone = vi.fn();
    render(
      <RecallRatingDialog
        open={true}
        onClose={() => {}}
        revisionId={1}
        topicName="Algebra"
        onDone={onDone}
      />,
    );

    expect(screen.getByText(/Revisão Ativa — Algebra/i)).toBeTruthy();

    // Step 1: Recall
    const textarea = screen.getByPlaceholderText(/escreva livremente/i);
    fireEvent.change(textarea, { target: { value: "Lembrei de tudo" } });
    fireEvent.click(screen.getByText(/Avançar para avaliação/i));

    // Step 2: Rating
    expect(screen.getByText(/Quanto esforço você precisou/i)).toBeTruthy();
    const ratingBtn = screen.getByText("Lembrei fácil");
    fireEvent.click(ratingBtn);

    const submitBtn = screen.getByText("Salvar avaliação");
    fireEvent.click(submitBtn);

    expect(mockSaveRecallRating).toHaveBeenCalledWith(
      expect.objectContaining({ rating: 5, freeRecallText: "Lembrei de tudo" }),
    );
    expect(onDone).toHaveBeenCalled();
  });
});

describe("OnboardingWizard Component", () => {
  test("completes onboarding flow with personalized path", async () => {
    const onComplete = vi.fn();
    render(<OnboardingWizard onComplete={onComplete} />);

    fireEvent.click(screen.getByText(/Configurar agora/i));

    // Step: Concurso -> Personalizado
    fireEvent.click(screen.getByText("Personalizado"));
    fireEvent.click(screen.getByText(/Continuar/i));

    // Step: Disciplinas
    expect(screen.getByText(/Quais disciplinas você estuda/i)).toBeTruthy();
    const input = screen.getByPlaceholderText("Disciplina 1");
    fireEvent.change(input, { target: { value: "Math" } });
    fireEvent.click(screen.getByText("+ Adicionar disciplina"));
    const input2 = screen.getByPlaceholderText("Disciplina 2");
    fireEvent.change(input2, { target: { value: "Physics" } });

    fireEvent.click(screen.getByText(/Continuar/i));

    // Step: Meta
    fireEvent.click(screen.getByText("6h"));
    fireEvent.click(screen.getByText(/Finalizar configuração/i));

    // Done
    await waitFor(() => expect(screen.getByText(/Tudo pronto/i)).toBeTruthy(), {
      timeout: 2000,
    });
    fireEvent.click(screen.getByText(/Ir para o Dashboard/i));
    expect(onComplete).toHaveBeenCalled();
  });
});
