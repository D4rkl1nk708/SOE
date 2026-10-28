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
  sequence: {
    id: number;
    name: string;
    topicId?: number;
    topicName?: string;
  }[];
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
  | "reviewing"
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
  reviewSummary: {
    quality: number;
    verdict: string;
    replaced: number;
    reviewed: boolean;
  } | null;
  start: (payload: StartPayload) => Promise<void>;
  submit: (answers: Record<string, string>) => Promise<any | null>;
  reset: () => void;
  loadExam: (exam: any) => boolean;
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
  const reviewSimulado = trpc.mentor.reviewSimulado.useMutation();

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
  const [reviewSummary, setReviewSummary] = useState<{
    quality: number;
    verdict: string;
    replaced: number;
    reviewed: boolean;
  } | null>(null);
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
      setReviewSummary(null);
      setMeta({
        title: payload.title,
        mode: payload.mode,
        durationMinutes: payload.durationMinutes,
      });
      setProgress({ current: 0, total: payload.sequence.length });

      try {
        const keys = payload.apiKey
          .split(/[\s,;]+/)
          .map((key) => key.trim())
          .filter(Boolean);
        if (!keys.length) throw new Error("Nenhuma chave de IA configurada.");
        const workerKeys = keys.slice(0, 4);
        const brainKey = keys[0] || workerKeys[0];
        const generated: GeneratedQuestion[] = new Array(
          payload.sequence.length,
        );
        const usedStatements = [...payload.excludeStatements];
        const usedIds = [...payload.excludeQuestionIds];
        let completed = 0;
        let failed = 0;

        const tryGenerate = async (
          key: string,
          index: number,
          discipline: { id: number; name: string },
        ) => {
          for (let attempt = 0; attempt < 3; attempt++) {
            const candidate = await generate.mutateAsync({
              disciplineId: discipline.id,
              difficulty: "medium",
              sessionHistory: [],
              apiKey: key,
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
              return candidate;
            }
          }
          return null;
        };

        const buildQuestion = (
          candidate: any,
          index: number,
          discipline: { id: number; name: string },
        ): GeneratedQuestion => ({
          id: candidate.questionId || `q-${Date.now()}-${index}`,
          number: index + 1,
          disciplineId: discipline.id,
          disciplineName: candidate.disciplineName || discipline.name,
          topicName: candidate.topicName,
          banca: candidate.banca,
          statement: candidate.statement,
          alternatives: candidate.alternatives || [],
          correctAnswer: candidate.correctAnswer || "",
          explanation: candidate.hint || undefined,
          source: candidate.source === "bank" ? "bank" : "ai",
        });

        const chunks: number[][] = Array.from(
          { length: workerKeys.length },
          () => [],
        );
        payload.sequence.forEach((_, index) => {
          chunks[index % workerKeys.length].push(index);
        });

        await Promise.all(
          chunks.map(async (indexes, workerIndex) => {
            const key = workerKeys[workerIndex];
            for (const index of indexes) {
              const discipline = payload.sequence[index];
              let candidate = null;
              let lastError: any = null;
              for (const candidateKey of [key, brainKey, ...workerKeys].filter(
                (value, position, list) => list.indexOf(value) === position,
              )) {
                try {
                  candidate = await tryGenerate(
                    candidateKey,
                    index,
                    discipline,
                  );
                  if (candidate) break;
                } catch (caught) {
                  lastError = caught;
                }
              }
              if (!candidate) {
                // Uma questão problemática não deve descartar a prova inteira.
                // Marca a falha, segue para as demais e entrega o que foi gerado.
                failed++;
                completed++;
                setProgress({
                  current: completed,
                  total: payload.sequence.length,
                });
                if (lastError)
                  console.warn(
                    `[Simulado] Questão ${index + 1} ignorada:`,
                    lastError?.message || lastError,
                  );
                continue;
              }
              generated[index] = buildQuestion(candidate, index, discipline);
              usedStatements.push(candidate.statement);
              if (candidate.questionId)
                usedIds.push(String(candidate.questionId));
              completed++;
              setProgress({
                current: completed,
                total: payload.sequence.length,
              });
            }
          }),
        );

        // O cérebro confere duplicatas entre workers e regenera com a chave
        // principal quando dois subagentes produzem o mesmo enunciado.
        const seen = new Set<string>();
        for (let index = 0; index < generated.length; index++) {
          const question = generated[index];
          if (!question) continue;
          const key = fingerprint(question.statement);
          if (!seen.has(key)) {
            seen.add(key);
            continue;
          }
          const discipline = payload.sequence[index];
          const candidate = await tryGenerate(brainKey, index, discipline);
          if (!candidate || seen.has(fingerprint(candidate.statement))) {
            failed++;
            continue;
          }
          generated[index] = buildQuestion(candidate, index, discipline);
          seen.add(fingerprint(candidate.statement));
          usedStatements.push(candidate.statement);
        }

        setStatus("reviewing");
        setProgress({
          current: payload.sequence.length,
          total: payload.sequence.length,
        });
        let replaced = 0;
        let reviewSummaryValue = {
          quality: 0,
          verdict: "Revisão não executada",
          replaced: 0,
          reviewed: false,
        };
        try {
          const review = await reviewSimulado.mutateAsync({
            questions: generated.filter(Boolean).map((question) => ({
              number: question.number,
              disciplineName: question.disciplineName,
              topicName: question.topicName,
              statement: question.statement,
              correctAnswer: question.correctAnswer,
            })),
            apiKey: brainKey,
            provider: payload.provider,
          });
          for (const number of review.duplicateIndices) {
            const index = Number(number) - 1;
            if (index < 0 || index >= generated.length) continue;
            const discipline = payload.sequence[index];
            const candidate = await tryGenerate(brainKey, index, discipline);
            if (candidate) {
              generated[index] = buildQuestion(candidate, index, discipline);
              usedStatements.push(candidate.statement);
              replaced++;
            }
          }
          reviewSummaryValue = {
            quality: review.quality,
            verdict: review.verdict,
            replaced,
            reviewed: true,
          };
        } catch (reviewError: any) {
          reviewSummaryValue = {
            quality: 0,
            verdict: "Revisão indisponível; a prova foi mantida.",
            replaced: 0,
            reviewed: false,
          };
        }
        setReviewSummary(reviewSummaryValue);

        const finalQuestions = generated.filter(
          (question): question is GeneratedQuestion => Boolean(question),
        );
        if (finalQuestions.length === 0)
          throw new Error(
            "Nenhuma questão válida foi gerada. Verifique a chave/cota da IA e tente novamente.",
          );

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
          blank: finalQuestions.length,
          totalQuestions: finalQuestions.length,
          questions: finalQuestions,
          answers: {},
          blueprint: payload.blueprint,
          status: "in_progress",
          mode: payload.mode,
          durationMinutes: payload.durationMinutes,
        });

        setQuestions(finalQuestions);
        setExamId(created.id);
        setStatus("ready");
        utils.mockExam.list.invalidate();
        toast.success("Simulado pronto!", {
          description: `${finalQuestions.length} questões geradas${failed ? ` (${failed} ignorada(s) por erro/formato)` : ""}${workerKeys.length > 1 ? ` com ${workerKeys.length} chaves em paralelo` : ""}${reviewSummaryValue.reviewed ? ` · revisão ${reviewSummaryValue.quality}/100` : ""}. Você pode continuar de onde estiver.`,
          duration: Infinity,
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

  const loadExam = useCallback((exam: any) => {
    if (!exam || !Array.isArray(exam.questions) || exam.questions.length === 0)
      return false;
    setQuestions(exam.questions);
    setBlueprint(exam.blueprint || []);
    setExamId(Number(exam.id));
    setMeta({
      title: exam.name || "Simulado",
      mode: exam.mode === "cebraspe" ? "cebraspe" : "multiple",
      durationMinutes: Number(exam.durationMinutes) || 20,
    });
    setStatus("ready");
    setError("");
    return true;
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setProgress({ current: 0, total: 0 });
    setQuestions([]);
    setBlueprint([]);
    setExamId(null);
    setMeta(null);
    setError("");
    setReviewSummary(null);
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
        reviewSummary,
        start,
        submit,
        reset,
        loadExam,
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
