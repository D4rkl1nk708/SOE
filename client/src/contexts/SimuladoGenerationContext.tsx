import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export type SimuladoMode = "multiple" | "cebraspe";

export type GeneratedQuestion = {
  id: string;
  number: number;
  disciplineId: number;
  disciplineName: string;
  topicName?: string;
  banca?: string;
  statement: string;
  alternatives: { letter: string; text: string }[];
  correctAnswer: string;
  explanation?: string;
  source: "ai" | "bank";
};

type StartPayload = {
  title: string;
  mode: SimuladoMode;
  durationMinutes: number;
  sequence: { id: number; name: string }[];
  blueprint: {
    disciplineId: number;
    disciplineName: string;
    count: number;
  }[];
  apiKey: string;
  provider: "gemini" | "openai" | "claude";
  excludeStatements: string[];
  excludeQuestionIds: string[];
};

export type SimuladoGenerationStatus =
  | "idle"
  | "generating"
  | "ready"
  | "submitting"
  | "completed"
  | "error";

type SimuladoGenerationContextValue = {
  status: SimuladoGenerationStatus;
  progress: { current: number; total: number };
  questions: GeneratedQuestion[];
  blueprint: StartPayload["blueprint"];
  examId: number | null;
  meta: {
    title: string;
    mode: SimuladoMode;
    durationMinutes: number;
  } | null;
  error: string;
  start: (payload: StartPayload) => Promise<void>;
  submit: (answers: Record<string, string>) => Promise<any | null>;
  reset: () => void;
};

const SimuladoGenerationContext =
  createContext<SimuladoGenerationContextValue | null>(null);

function fingerprint(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export function SimuladoGenerationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const generate = trpc.mentor.generateAdaptiveQuestion.useMutation();
  const createExam = trpc.mockExam.create.useMutation();
  const updateExam = trpc.mockExam.update.useMutation();

  const [status, setStatus] = useState<SimuladoGenerationStatus>("idle");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [blueprint, setBlueprint] = useState<StartPayload["blueprint"]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [meta, setMeta] = useState<{
    title: string;
    mode: SimuladoMode;
    durationMinutes: number;
  } | null>(null);
  const [error, setError] = useState("");
  const runningRef = useRef(false);

  const start = useCallback(
    async (payload: StartPayload) => {
      if (runningRef.current) {
        toast.info("Já existe um simulado sendo gerado.");
        return;
      }
      runningRef.current = true;
      setStatus("generating");
      setError("");
      setQuestions([]);
      setBlueprint(payload.blueprint);
      setExamId(null);
      setMeta({
        title: payload.title,
        mode: payload.mode,
        durationMinutes: payload.durationMinutes,
      });
      setProgress({ current: 0, total: payload.sequence.length });

      const generated: GeneratedQuestion[] = [];
      const usedStatements = [...payload.excludeStatements];
      const usedIds = [...payload.excludeQuestionIds];

      try {
        for (let index = 0; index < payload.sequence.length; index++) {
          const discipline = payload.sequence[index];
          setProgress({
            current: index + 1,
            total: payload.sequence.length,
          });
          let question: any = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            const candidate = await generate.mutateAsync({
              disciplineId: discipline.id,
              difficulty: "medium",
              sessionHistory: [],
              apiKey: payload.apiKey,
              provider: payload.provider,
              format: payload.mode,
              excludeQuestionIds: usedIds.slice(-250),
              excludeStatements: usedStatements.slice(-80),
            });
            const candidateFingerprint = fingerprint(candidate.statement || "");
            const repeated = usedStatements.some(
              (statement) => fingerprint(statement) === candidateFingerprint,
            );
            const minimumAlternatives = payload.mode === "cebraspe" ? 2 : 4;
            const hasValidAlternatives =
              Array.isArray(candidate.alternatives) &&
              candidate.alternatives.length >= minimumAlternatives;
            if (
              !repeated &&
              candidate.statement &&
              hasValidAlternatives &&
              candidate.correctAnswer
            ) {
              question = candidate;
              break;
            }
          }
          if (!question) {
            throw new Error(
              "A IA repetiu questões demais. Tente novamente ou reduza o número de questões.",
            );
          }
          generated.push({
            id: question.questionId || `q-${Date.now()}-${index}`,
            number: index + 1,
            disciplineId: discipline.id,
            disciplineName: question.disciplineName || discipline.name,
            topicName: question.topicName,
            banca: question.banca,
            statement: question.statement,
            alternatives: question.alternatives || [],
            correctAnswer: question.correctAnswer || "",
            explanation: question.hint || undefined,
            source: question.source === "bank" ? "bank" : "ai",
          });
          usedStatements.push(question.statement);
          if (question.questionId) usedIds.push(String(question.questionId));
        }

        const examName = `${payload.title.trim() || "Simulado SOE"} · ${new Date().toLocaleString(
          "pt-BR",
          {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          },
        )}`;
        const created = await createExam.mutateAsync({
          name: examName,
          date: new Date().toISOString().slice(0, 10),
          correct: 0,
          wrong: 0,
          blank: generated.length,
          totalQuestions: generated.length,
          questions: generated,
          answers: {},
          blueprint: payload.blueprint,
          status: "in_progress",
          mode: payload.mode,
          durationMinutes: payload.durationMinutes,
        });

        setQuestions(generated);
        setExamId(created.id);
        setStatus("ready");
        utils.mockExam.list.invalidate();
        toast.success("Simulado pronto!", {
          description: `${generated.length} questões geradas. Você pode continuar de onde estiver.`,
          duration: 12000,
          action: {
            label: "Abrir prova",
            onClick: () => navigate("/simulado-inteligente"),
          },
        });
      } catch (caught: any) {
        const message = caught?.message || "Falha ao gerar o simulado.";
        setError(message);
        setStatus("error");
        toast.error(message);
      } finally {
        runningRef.current = false;
      }
    },
    [createExam, generate, navigate, utils.mockExam.list],
  );

  const submit = useCallback(
    async (answers: Record<string, string>) => {
      if (!questions.length) return null;
      setStatus("submitting");
      let correct = 0;
      let wrong = 0;
      const perDiscipline = new Map<
        string,
        { total: number; correct: number }
      >();
      for (const question of questions) {
        const selected = answers[question.id];
        const isCorrect =
          String(selected || "").toUpperCase() ===
          String(question.correctAnswer || "").toUpperCase();
        if (selected) {
          if (isCorrect) correct++;
          else wrong++;
        }
        const item = perDiscipline.get(question.disciplineName) || {
          total: 0,
          correct: 0,
        };
        item.total++;
        if (isCorrect) item.correct++;
        perDiscipline.set(question.disciplineName, item);
      }
      const blank = questions.length - correct - wrong;
      const result = {
        correct,
        wrong,
        blank,
        accuracy: Math.round((correct / questions.length) * 100),
        perDiscipline: [...perDiscipline.entries()].map(([name, value]) => ({
          name,
          ...value,
          accuracy: Math.round((value.correct / value.total) * 100),
        })),
      };
      if (examId) {
        try {
          await updateExam.mutateAsync({
            id: examId,
            correct,
            wrong,
            blank,
            totalQuestions: questions.length,
            answers,
            status: "completed",
            completedAt: new Date().toISOString(),
          });
          utils.mockExam.list.invalidate();
        } catch (caught: any) {
          toast.error(
            `Prova encerrada, mas falhou ao salvar: ${caught.message}`,
          );
        }
      }
      setStatus("completed");
      return result;
    },
    [examId, questions, updateExam, utils.mockExam.list],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setProgress({ current: 0, total: 0 });
    setQuestions([]);
    setBlueprint([]);
    setExamId(null);
    setMeta(null);
    setError("");
    runningRef.current = false;
  }, []);

  return (
    <SimuladoGenerationContext.Provider
      value={{
        status,
        progress,
        questions,
        blueprint,
        examId,
        meta,
        error,
        start,
        submit,
        reset,
      }}
    >
      {children}
    </SimuladoGenerationContext.Provider>
  );
}

export function useSimuladoGeneration() {
  const context = useContext(SimuladoGenerationContext);
  if (!context) {
    throw new Error(
      "useSimuladoGeneration deve ser usado dentro de SimuladoGenerationProvider",
    );
  }
  return context;
}
