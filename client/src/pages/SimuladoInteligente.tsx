import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/PageShell";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Clock,
  Play,
  RotateCcw,
  Sparkles,
  Target,
  Trophy,
  XCircle,
} from "lucide-react";

type Question = {
  questionId: string;
  source: "bank" | "ai";
  statement: string;
  alternatives: { letter: string; text: string }[];
  correctAnswer: string;
  banca?: string;
  year?: number;
  topicName?: string;
  disciplineName?: string;
  hint?: string | null;
};

type Answer = {
  disciplineId: number;
  disciplineName: string;
  correct: boolean;
  userAnswer: string;
};

type Phase = "config" | "running" | "result";

export default function SimuladoInteligente() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const { data: disciplines = [] } = trpc.discipline.list.useQuery();
  const { data: overview } = trpc.study.overview.useQuery({
    minutes: Number((stats?.settings as any)?.dailyGoalMinutes) || 240,
  });

  const apiKey = (stats?.settings as any)?.aiApiKey || "";
  const provider = ((stats?.settings as any)?.aiProvider || "gemini") as
    | "gemini"
    | "openai"
    | "claude";

  const generate = trpc.mentor.generateAdaptiveQuestion.useMutation();
  const saveExam = trpc.mockExam.create.useMutation({
    onSuccess: () => utils.mockExam.list.invalidate(),
  });

  const [phase, setPhase] = useState<Phase>("config");
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(20);
  const [current, setCurrent] = useState<Question | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [timeLeft, setTimeLeft] = useState(20 * 60);
  const savedRef = useRef(false);

  const allocations = useMemo(() => {
    const coverage = (overview?.coverage?.disciplines || []) as any[];
    const byName = new Map(
      (disciplines as any[]).map((discipline) => [discipline.name, discipline]),
    );
    const source = coverage.length
      ? coverage
          .map((item) => ({
            discipline: byName.get(item.name),
            weight: Math.max(0.1, Number(item.weight) || 1),
          }))
          .filter((item) => item.discipline)
      : (disciplines as any[]).map((discipline) => ({
          discipline,
          weight: Math.max(0.1, Number(discipline.weight) || 1),
        }));

    if (!source.length) return [];
    const totalWeight = source.reduce((sum, item) => sum + item.weight, 0);
    const raw = source.map((item) => ({
      discipline: item.discipline,
      count: Math.max(
        0,
        Math.round((item.weight / totalWeight) * totalQuestions),
      ),
    }));
    let diff = totalQuestions - raw.reduce((sum, item) => sum + item.count, 0);
    let index = 0;
    while (diff !== 0 && raw.length > 0) {
      const item = raw[index % raw.length];
      if (diff > 0) {
        item.count++;
        diff--;
      } else if (item.count > 0) {
        item.count--;
        diff++;
      }
      index++;
      if (index > raw.length * 4) break;
    }
    return raw;
  }, [overview?.coverage?.disciplines, disciplines, totalQuestions]);

  const sequence = useMemo(
    () =>
      allocations.flatMap((allocation) =>
        Array.from({ length: allocation.count }, () => allocation.discipline),
      ),
    [allocations],
  );

  const fetchQuestion = (index: number) => {
    const discipline = sequence[index];
    if (!discipline) return;
    setCurrent(null);
    setSelectedAnswer(null);
    generate.mutate(
      {
        disciplineId: discipline.id,
        difficulty: "medium",
        sessionHistory: answers.map((answer, answerIndex) => ({
          questionId: String(answerIndex),
          correct: answer.correct,
        })),
        apiKey,
        provider,
      },
      {
        onSuccess: (question) => setCurrent(question as Question),
        onError: (error) => {
          toast.error(error.message);
          setPhase("config");
        },
      },
    );
  };

  const start = () => {
    if (!apiKey) {
      toast.error("Configure a chave de IA no Perfil para gerar o simulado.");
      return;
    }
    if (!sequence.length) {
      toast.error("Cadastre disciplinas ou importe um edital primeiro.");
      return;
    }
    savedRef.current = false;
    setAnswers([]);
    setCurrentIndex(0);
    setTimeLeft(timeLimitMinutes * 60);
    setPhase("running");
    fetchQuestion(0);
  };

  useEffect(() => {
    if (phase !== "running") return;
    const timer = setInterval(() => {
      setTimeLeft((seconds) => {
        if (seconds <= 1) {
          clearInterval(timer);
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const finish = (finalAnswers: Answer[]) => {
    setPhase("result");
    if (savedRef.current) return;
    savedRef.current = true;
    const correct = finalAnswers.filter((answer) => answer.correct).length;
    const wrong = finalAnswers.length - correct;
    saveExam.mutate({
      name: `Simulado inteligente ${new Date().toLocaleDateString("pt-BR")}`,
      date: new Date().toISOString().slice(0, 10),
      correct,
      wrong,
      blank: Math.max(0, totalQuestions - finalAnswers.length),
      totalQuestions,
    });
  };

  useEffect(() => {
    if (phase === "running" && timeLeft === 0 && current) {
      finish(answers);
    }
  }, [timeLeft, phase]);

  const confirmAnswer = () => {
    if (!current || !selectedAnswer) return;
    const correct = selectedAnswer === current.correctAnswer;
    const discipline = sequence[currentIndex];
    const nextAnswers = [
      ...answers,
      {
        disciplineId: discipline?.id || 0,
        disciplineName: discipline?.name || current.disciplineName || "",
        correct,
        userAnswer: selectedAnswer,
      },
    ];
    setAnswers(nextAnswers);
    if (nextAnswers.length >= totalQuestions) {
      finish(nextAnswers);
      return;
    }
    const nextIndex = currentIndex + 1;
    setCurrentIndex(nextIndex);
    fetchQuestion(nextIndex);
  };

  const reset = () => {
    setPhase("config");
    setCurrent(null);
    setAnswers([]);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    savedRef.current = false;
  };

  const correctCount = answers.filter((answer) => answer.correct).length;
  const accuracy =
    answers.length > 0 ? Math.round((correctCount / answers.length) * 100) : 0;
  const perDiscipline = useMemo(() => {
    const map = new Map<string, { total: number; correct: number }>();
    for (const answer of answers) {
      const item = map.get(answer.disciplineName) || { total: 0, correct: 0 };
      item.total++;
      if (answer.correct) item.correct++;
      map.set(answer.disciplineName, item);
    }
    return [...map.entries()].map(([name, value]) => ({
      name,
      ...value,
      accuracy: Math.round((value.correct / value.total) * 100),
    }));
  }, [answers]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <PageShell
      eyebrow="Prova"
      title="Simulado inteligente"
      description="Questões reais geradas para o seu edital, com correção e resultado salvo."
      metrics={[
        { label: "Questões", value: totalQuestions, icon: Target },
        { label: "Tempo", value: `${timeLimitMinutes} min`, icon: Clock },
        { label: "Respondidas", value: answers.length, icon: CheckCircle2 },
        { label: "Acurácia", value: `${accuracy}%`, icon: Trophy },
      ]}
      actions={
        phase !== "config" ? (
          <Button variant="outline" className="h-9 text-[10px]" onClick={reset}>
            <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reiniciar
          </Button>
        ) : (
          <Button
            variant="outline"
            className="h-9 text-[10px]"
            onClick={() => navigate("/simulado")}
          >
            Simulado manual
          </Button>
        )
      }
    >
      {phase === "config" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <section className="soe-card p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Blueprint do simulado</h2>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              A distribuição segue o peso das disciplinas no edital. Se ainda
              não há edital, usa o peso estratégico das disciplinas.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {allocations.map((allocation) => (
                <div
                  key={allocation.discipline.id}
                  className="flex items-center justify-between rounded border border-border bg-secondary/20 px-3 py-2"
                >
                  <span className="truncate text-[10.5px] font-medium">
                    {allocation.discipline.name}
                  </span>
                  <span className="text-[10px] font-semibold text-primary">
                    {allocation.count}q
                  </span>
                </div>
              ))}
              {allocations.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Sem disciplinas. Importe o edital ou cadastre matérias.
                </p>
              )}
            </div>
            {!apiKey && (
              <div className="mt-4 flex gap-2 rounded border border-amber-500/20 bg-amber-500/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                <p className="text-[10px] text-muted-foreground">
                  Configure a chave de IA em Perfil → Inteligência Artificial
                  para gerar as questões.
                </p>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <div className="soe-card p-4">
              <label className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
                Nº de questões
              </label>
              <input
                type="number"
                min={3}
                max={50}
                value={totalQuestions}
                onChange={(event) =>
                  setTotalQuestions(
                    Math.max(1, Math.min(50, Number(event.target.value))),
                  )
                }
                className="mt-1 h-9 w-full rounded border border-border bg-secondary/30 px-3 text-sm font-semibold"
              />
              <label className="mt-3 block text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
                Tempo (min)
              </label>
              <input
                type="number"
                min={5}
                max={240}
                value={timeLimitMinutes}
                onChange={(event) =>
                  setTimeLimitMinutes(
                    Math.max(1, Math.min(240, Number(event.target.value))),
                  )
                }
                className="mt-1 h-9 w-full rounded border border-border bg-secondary/30 px-3 text-sm font-semibold"
              />
              <Button onClick={start} className="mt-4 w-full">
                <Play className="mr-2 h-3.5 w-3.5" /> Iniciar simulado
              </Button>
            </div>
            <div className="soe-card p-4 text-[10px] leading-relaxed text-muted-foreground">
              <b className="text-foreground">Como funciona:</b> o sistema gera
              uma questão por vez, corrige na hora e salva o resultado no
              histórico de simulados.
            </div>
          </aside>
        </div>
      )}

      {phase === "running" && (
        <section className="soe-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
                Questão {currentIndex + 1} de {totalQuestions}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {current?.disciplineName || "Gerando questão..."}
                {current?.topicName ? ` · ${current.topicName}` : ""}
              </p>
            </div>
            <span
              className={`font-mono text-sm font-semibold ${timeLeft < 60 ? "text-destructive" : ""}`}
            >
              {String(minutes).padStart(2, "0")}:
              {String(seconds).padStart(2, "0")}
            </span>
          </div>

          {!current ? (
            <div className="flex flex-col items-center gap-2 py-14 text-muted-foreground">
              <Brain className="h-6 w-6 animate-pulse text-primary" />
              <p className="text-[11px]">Gerando questão...</p>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {current.statement}
              </p>
              <div className="grid gap-2">
                {current.alternatives.map((alternative) => {
                  const selected = selectedAnswer === alternative.letter;
                  return (
                    <button
                      key={alternative.letter}
                      onClick={() => setSelectedAnswer(alternative.letter)}
                      className={`flex gap-3 rounded border p-3 text-left text-xs transition-colors ${
                        selected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-secondary/30"
                      }`}
                    >
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-secondary text-[9px] font-bold">
                        {alternative.letter}
                      </span>
                      <span>{alternative.text}</span>
                    </button>
                  );
                })}
              </div>
              {current.hint && (
                <p className="text-[10px] text-muted-foreground">
                  Dica: {current.hint}
                </p>
              )}
              <div className="flex justify-end">
                <Button
                  onClick={confirmAnswer}
                  disabled={!selectedAnswer || generate.isPending}
                >
                  Confirmar <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {phase === "result" && (
        <div className="space-y-4">
          <section className="soe-card p-5 text-center">
            <Trophy className="mx-auto h-8 w-8 text-primary" />
            <h2 className="mt-2 text-xl font-semibold">
              {accuracy}% de acerto
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {correctCount} acertos · {answers.length - correctCount} erros ·{" "}
              {answers.length}/{totalQuestions} respondidas
            </p>
          </section>
          <section className="soe-card p-4">
            <h2 className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              Resultado por disciplina
            </h2>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {perDiscipline.map((item) => (
                <div
                  key={item.name}
                  className="rounded border border-border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[10.5px] font-medium">
                      {item.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {item.correct}/{item.total}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${item.accuracy}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={reset}>
                <RotateCcw className="mr-2 h-3.5 w-3.5" /> Novo simulado
              </Button>
              <Button variant="outline" onClick={() => navigate("/mock-exams")}>
                Ver histórico
              </Button>
            </div>
          </section>
        </div>
      )}
    </PageShell>
  );
}
