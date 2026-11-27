import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { invalidateStudyState } from "@/lib/studyState";
import { CheckCircle2, ClipboardList, XCircle } from "lucide-react";

type PretestQuestion = {
  id: string;
  questionId?: string;
  statement: string;
  alternatives: Array<{ letter: string; text: string }>;
  correctAnswer?: string;
  banca?: string;
  topicId: number;
  disciplineId: number;
  source: "bank" | "ai";
};

/**
 * Diagnóstico (v6.9.11, B1/4.4): 5 questões ANTES do conteúdo, com erro
 * esperado. O resultado entra como linha de base — nunca como nota, acurácia
 * ou domínio.
 *
 * A resposta é auto-declarada (acertei/errei), como no resto da sessão: o SOE
 * não inventa gabarito que não tem.
 */
export function PretestDiagnostic({
  topicId,
  topicName,
  disciplineId,
  onDone,
}: {
  topicId: number;
  topicName?: string;
  disciplineId?: number | null;
  onDone?: (result: {
    available: number;
    correct: number;
    sample: number;
  }) => void;
}) {
  const utils = trpc.useUtils();
  const [questions, setQuestions] = useState<PretestQuestion[] | null>(null);
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<{
    sample: number;
    correct: number;
  } | null>(null);

  const start = trpc.study.startPretest.useMutation({
    onSuccess: (data: any) => {
      if (!data?.available) {
        toast("Sem questões para o diagnóstico deste tema.", {
          description:
            "Responda algumas questões do tema (ou cadastre uma chave de IA) e o pré-teste nasce do seu próprio banco.",
        });
        return;
      }
      setQuestions(data.questions as PretestQuestion[]);
      setMarks({});
      setSaved(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const record = trpc.study.recordAttempt.useMutation({
    onSuccess: () => {
      void invalidateStudyState(utils, "attempt");
    },
  });

  const submit = async () => {
    if (!questions) return;
    let correct = 0;
    for (const question of questions) {
      const isCorrect = marks[question.id] === true;
      if (isCorrect) correct += 1;
      await record.mutateAsync({
        topicId: question.topicId,
        disciplineId: question.disciplineId ?? disciplineId ?? undefined,
        questionId: question.questionId || question.id,
        answered: true,
        correct: isCorrect,
        confidence: null,
        source: "manual",
        context: "pretest",
      } as any);
    }
    const result = {
      available: questions.length,
      correct,
      sample: questions.length,
    };
    setSaved({ sample: questions.length, correct });
    void utils.study.masterySnapshot.invalidate();
    onDone?.(result);
  };

  return (
    <div className="soe-card p-5 space-y-4 border-[color-mix(in_srgb,var(--primary)_25%,transparent)]">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] p-2 text-primary">
          <ClipboardList className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">
            Diagnóstico (5 questões, erro esperado)
          </p>
          <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground">
            Tente responder antes de estudar. O erro aqui é o ponto de partida —
            entra como linha de base, não como nota.
          </p>
        </div>
      </div>

      {!questions && !saved && (
        <button
          type="button"
          disabled={start.isPending}
          onClick={() => start.mutate({ topicId })}
          className="h-9 w-full rounded-[10px] bg-[var(--primary)] text-[12px] font-semibold text-[var(--primary-foreground)] disabled:opacity-50"
        >
          {start.isPending ? "Montando diagnóstico…" : "Começar diagnóstico"}
        </button>
      )}

      {questions && !saved && (
        <div className="space-y-4">
          {questions.map((question, index) => (
            <div
              key={question.id}
              className="rounded-[10px] border border-border bg-secondary/20 p-3"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Questão {index + 1} de {questions.length}
                {question.banca ? ` · ${question.banca}` : ""}
              </p>
              <p className="mt-1 line-clamp-4 text-[12px] leading-5 text-foreground">
                {question.statement}
              </p>
              {question.alternatives.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {question.alternatives.slice(0, 5).map((alt) => (
                    <li
                      key={alt.letter}
                      className="truncate text-[11.5px] text-muted-foreground"
                    >
                      <strong className="text-foreground">{alt.letter})</strong>{" "}
                      {alt.text}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setMarks((prev) => ({ ...prev, [question.id]: true }))
                  }
                  className={`flex items-center justify-center gap-1.5 rounded-lg border py-1.5 text-[11px] font-semibold ${
                    marks[question.id] === true
                      ? "border-[var(--accent-green)] text-[var(--accent-green)]"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  <CheckCircle2 size={13} /> Acertei
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMarks((prev) => ({ ...prev, [question.id]: false }))
                  }
                  className={`flex items-center justify-center gap-1.5 rounded-lg border py-1.5 text-[11px] font-semibold ${
                    marks[question.id] === false
                      ? "border-[var(--accent-red)] text-[var(--accent-red)]"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  <XCircle size={13} /> Errei
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            disabled={
              record.isPending ||
              questions.some((question) => marks[question.id] === undefined)
            }
            onClick={() => void submit()}
            className="h-9 w-full rounded-[10px] bg-[var(--primary)] text-[12px] font-semibold text-[var(--primary-foreground)] disabled:opacity-50"
          >
            {record.isPending ? "Salvando…" : "Fechar diagnóstico"}
          </button>
        </div>
      )}

      {saved && (
        <div className="rounded-[10px] border border-[color-mix(in_srgb,var(--accent-green)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent-green)_8%,transparent)] px-3 py-2.5">
          <p className="text-[12px] font-semibold text-foreground">
            Linha de base: {saved.correct}/{saved.sample} (
            {Math.round((saved.correct / Math.max(1, saved.sample)) * 100)}%)
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Agora estude {topicName || "o tema"} — o diagnóstico não conta como
            acurácia nem como domínio.
          </p>
        </div>
      )}
    </div>
  );
}
