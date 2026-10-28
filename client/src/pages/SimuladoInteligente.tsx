import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/PageShell";
import { useSimuladoGeneration } from "@/contexts/SimuladoGenerationContext";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Grid3X3,
  Play,
  Printer,
  RotateCcw,
  Sparkles,
  Target,
  Trophy,
  XCircle,
} from "lucide-react";

type Mode = "multiple" | "cebraspe";
type Phase = "config" | "generating" | "running" | "result";

type Question = {
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

type BlueprintItem = {
  disciplineId: number;
  disciplineName: string;
  count: number;
};

function normalizeLabel(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

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

function formatTime(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60,
  ).padStart(2, "0")}`;
}

function ExamPrintView({
  title,
  mode,
  questions,
  blueprint,
  includeKey,
}: {
  title: string;
  mode: Mode;
  questions: Question[];
  blueprint: BlueprintItem[];
  includeKey: boolean;
}) {
  const total = questions.length;
  return (
    <div
      className="exam-print"
      style={{
        color: "#111",
        background: "#fff",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <section style={{ pageBreakAfter: "always", padding: "24px" }}>
        <div style={{ borderTop: "4px solid #1f2937", paddingTop: 18 }}>
          <p style={{ fontSize: 11, letterSpacing: 2, margin: 0 }}>
            SOE · SISTEMA DE OTIMIZAÇÃO DE ESTUDOS
          </p>
          <h1 style={{ fontSize: 28, margin: "10px 0 4px" }}>
            CADERNO DE PROVAS
          </h1>
          <h2 style={{ fontSize: 22, margin: 0 }}>OBJETIVAS · 2026</h2>
          <p style={{ fontSize: 12, marginTop: 18 }}>
            {title} ·{" "}
            {mode === "cebraspe" ? "Certo/Errado" : "Múltipla escolha"}
          </p>
        </div>
        <div style={{ marginTop: 40, border: "1px solid #999", padding: 20 }}>
          <p style={{ fontSize: 12, lineHeight: 1.6, margin: 0 }}>
            <b>LEIA COM ATENÇÃO AS INSTRUÇÕES.</b>
          </p>
          <p style={{ fontSize: 11, lineHeight: 1.6 }}>
            Este caderno contém {total} questões. Confira se todas estão
            presentes e legíveis. O gabarito não acompanha este caderno. Reserve
            tempo para preencher a folha de respostas.
          </p>
          <p style={{ fontSize: 11, lineHeight: 1.6 }}>
            {mode === "cebraspe"
              ? "Para cada item, marque C se julgar CERTO ou E se julgar ERRADO."
              : "Para cada questão, marque a única alternativa correta (A-E)."}
          </p>
        </div>
        <div style={{ marginTop: 40, fontSize: 11 }}>
          <p>
            <b>Blueprint:</b>
          </p>
          {blueprint.map((item) => (
            <p key={item.disciplineId} style={{ margin: "2px 0" }}>
              {item.disciplineName}: {item.count} questão(ões)
            </p>
          ))}
        </div>
        <p style={{ marginTop: 60, fontSize: 10, color: "#555" }}>
          Gerado pelo SOE · use a folha de respostas ao final.
        </p>
      </section>

      <section style={{ pageBreakAfter: "always", padding: "24px" }}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>INSTRUÇÕES GERAIS</h2>
        <ul style={{ fontSize: 11, lineHeight: 1.8, paddingLeft: 18 }}>
          <li>
            O tempo de prova inclui o preenchimento da folha de respostas.
          </li>
          <li>Não é permitido consultar o gabarito durante a realização.</li>
          <li>
            Marque apenas uma resposta por questão; rasuras podem invalidá-la.
          </li>
          <li>Em caso de dúvida, siga o comando da questão.</li>
          <li>
            Ao terminar, preencha a folha de respostas e entregue o caderno.
          </li>
        </ul>
        <div style={{ marginTop: 30, border: "1px solid #aaa", padding: 14 }}>
          <p style={{ fontSize: 11, margin: 0 }}>
            <b>Assinatura:</b> ______________________________________________
          </p>
          <p style={{ fontSize: 11, margin: "18px 0 0" }}>
            <b>Data:</b> ____/____/______
          </p>
        </div>
      </section>

      <section style={{ padding: "24px" }}>
        <div style={{ borderBottom: "2px solid #1f2937", paddingBottom: 8 }}>
          <b style={{ fontSize: 11 }}>{title}</b>
          <span style={{ float: "right", fontSize: 10 }}>
            {mode === "cebraspe" ? "CEBRASPE · C/E" : "MÚLTIPLA ESCOLHA"}
          </span>
        </div>
        <div style={{ columnCount: 2, columnGap: "22px", marginTop: 14 }}>
          {questions.map((question) => (
            <article
              key={question.id}
              style={{
                breakInside: "avoid",
                marginBottom: 14,
                fontSize: 10.5,
                lineHeight: 1.45,
              }}
            >
              <p style={{ margin: "0 0 3px", fontSize: 9, color: "#555" }}>
                {question.disciplineName}
                {question.topicName ? ` · ${question.topicName}` : ""}
              </p>
              <p style={{ margin: "0 0 4px" }}>
                <b>{question.number}.</b> {question.statement}
              </p>
              {question.alternatives.map((alternative) => (
                <p
                  key={alternative.letter}
                  style={{ margin: "1px 0 1px 14px" }}
                >
                  <b>{alternative.letter})</b> {alternative.text}
                </p>
              ))}
            </article>
          ))}
        </div>
        {includeKey && (
          <div
            style={{
              marginTop: 24,
              borderTop: "2px solid #1f2937",
              paddingTop: 10,
            }}
          >
            <h2 style={{ fontSize: 14 }}>GABARITO E COMENTÁRIOS</h2>
            {questions.map((question) => (
              <p
                key={`key-${question.id}`}
                style={{ fontSize: 9.5, lineHeight: 1.5 }}
              >
                <b>
                  {question.number}. {question.correctAnswer}
                </b>{" "}
                {question.explanation || ""}
              </p>
            ))}
          </div>
        )}
      </section>

      <section style={{ pageBreakBefore: "always", padding: "24px" }}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>FOLHA DE RESPOSTAS</h2>
        <p style={{ fontSize: 11 }}>
          {title} · {total} questões · {mode === "cebraspe" ? "C/E" : "A-E"}
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 8,
            marginTop: 20,
          }}
        >
          {questions.map((question) => (
            <div
              key={`sheet-${question.id}`}
              style={{ border: "1px solid #999", padding: 6, fontSize: 10 }}
            >
              <b>{String(question.number).padStart(3, "0")}</b>
              <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
                {(mode === "cebraspe"
                  ? ["C", "E"]
                  : ["A", "B", "C", "D", "E"]
                ).map((letter) => (
                  <span
                    key={letter}
                    style={{
                      border: "1px solid #777",
                      width: 14,
                      height: 14,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 8,
                    }}
                  >
                    {letter}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function SimuladoInteligente() {
  const [, navigate] = useLocation();
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const { data: disciplines = [] } = trpc.discipline.list.useQuery();
  const { data: overview } = trpc.study.overview.useQuery({
    minutes: Number((stats?.settings as any)?.dailyGoalMinutes) || 240,
  });
  const { data: errorIntel } = trpc.study.errorPatterns.useQuery();
  const { data: priorExams = [] } = trpc.mockExam.list.useQuery();
  const { data: topicsData } = trpc.topic.list.useQuery();
  const {
    status,
    progress,
    questions,
    blueprint: generatedBlueprint,
    examId,
    meta,
    error: generationError,
    reviewSummary,
    start,
    submit,
    reset: resetGeneration,
  } = useSimuladoGeneration();

  const apiKey = (stats?.settings as any)?.aiApiKey || "";
  const provider = ((stats?.settings as any)?.aiProvider || "gemini") as
    | "gemini"
    | "openai"
    | "claude";

  const [title, setTitle] = useState("Simulado SOE");
  const [mode, setMode] = useState<Mode>("multiple");
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [durationMinutes, setDurationMinutes] = useState(20);
  const [selectedIds, setSelectedIds] = useState<number[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answersRef = useRef<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20 * 60);
  const [result, setResult] = useState<any>(null);
  const [printKey, setPrintKey] = useState(false);
  const submittedRef = useRef(false);
  const timerExamRef = useRef<number | null>(null);

  const selectedSet = useMemo(
    () =>
      new Set(
        selectedIds === null
          ? (disciplines as any[]).map((discipline) => discipline.id)
          : selectedIds,
      ),
    [selectedIds, disciplines],
  );

  const priorQuestions = useMemo(
    () =>
      (priorExams as any[]).flatMap((exam) =>
        Array.isArray(exam.questions) ? exam.questions : [],
      ),
    [priorExams],
  );

  const allocations = useMemo(() => {
    const coverage = (overview?.coverage?.disciplines || []) as any[];
    const available = (disciplines as any[]).filter((discipline) =>
      selectedSet.has(discipline.id),
    );
    const byName = new Map(
      available.map((discipline) => [
        normalizeLabel(discipline.name),
        discipline,
      ]),
    );
    const coverageSource = coverage
      .map((item) => {
        const normalized = normalizeLabel(item.name);
        const exact = byName.get(normalized);
        const fuzzy =
          exact ||
          available.find((discipline) => {
            const candidate = normalizeLabel(discipline.name);
            return (
              candidate.includes(normalized) || normalized.includes(candidate)
            );
          });
        return {
          discipline: fuzzy,
          weight: Math.max(0.1, Number(item.weight) || 1),
        };
      })
      .filter((item) => item.discipline);
    const source = coverageSource.length
      ? coverageSource
      : available.map((discipline) => ({
          discipline,
          weight: Math.max(0.1, Number(discipline.weight) || 1),
        }));

    if (!source.length) return [];
    const totalWeight = source.reduce((sum, item) => sum + item.weight, 0);
    const raw = source.map((item) => ({
      discipline: item.discipline as any,
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
    return raw.filter((item) => item.count > 0);
  }, [
    overview?.coverage?.disciplines,
    disciplines,
    selectedSet,
    totalQuestions,
  ]);

  const sequence = useMemo(() => {
    const allTopics = (topicsData?.topics || []) as any[];
    return allocations.flatMap((allocation) => {
      const disciplineTopics = allTopics.filter(
        (topic) => topic.disciplineId === allocation.discipline.id,
      );
      return Array.from({ length: allocation.count }, (_, index) => {
        const topic =
          disciplineTopics.length > 0
            ? disciplineTopics[index % disciplineTopics.length]
            : null;
        return {
          id: allocation.discipline.id,
          name: allocation.discipline.name,
          topicId: topic?.id,
          topicName: topic?.name,
        };
      });
    });
  }, [allocations, topicsData?.topics]);

  const recommendation = (errorIntel?.topTopics || []).slice(0, 2);
  const aiKeyCount = apiKey
    .split(/[\s,;]+/)
    .map((key: string) => key.trim())
    .filter(Boolean).length;
  const sections = useMemo(() => {
    const map = new Map<string, { name: string; questions: Question[] }>();
    for (const question of questions) {
      const current = map.get(question.disciplineName) || {
        name: question.disciplineName,
        questions: [],
      };
      current.questions.push(question);
      map.set(question.disciplineName, current);
    }
    return [...map.values()];
  }, [questions]);
  const phase: Phase = result
    ? "result"
    : status === "generating" || status === "reviewing"
      ? "generating"
      : (status === "ready" || status === "submitting") && questions.length > 0
        ? "running"
        : "config";

  useEffect(() => {
    if (status !== "ready" || !examId || !meta) return;
    if (timerExamRef.current === examId) return;
    timerExamRef.current = examId;
    setTitle(meta.title);
    setMode(meta.mode);
    setDurationMinutes(meta.durationMinutes);
    setTimeLeft(meta.durationMinutes * 60);
    setCurrentIndex(0);
  }, [status, examId, meta]);

  useEffect(() => {
    if (phase !== "running") return;
    const timer = setInterval(() => {
      setTimeLeft((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const finishExam = async (auto = false) => {
    if (submittedRef.current || questions.length === 0) return;
    const currentAnswers = answersRef.current;
    const unanswered = questions.filter(
      (question) => !currentAnswers[question.id],
    ).length;
    if (
      !auto &&
      unanswered > 0 &&
      !window.confirm(
        `Ainda há ${unanswered} questão(ões) sem resposta. Entregar mesmo assim?`,
      )
    ) {
      return;
    }
    submittedRef.current = true;
    const submitted = await submit(currentAnswers);
    if (!submitted) {
      submittedRef.current = false;
      return;
    }
    setResult({ ...submitted, auto });
  };

  useEffect(() => {
    if (phase === "running" && timeLeft === 0) {
      void finishExam(true);
    }
  }, [timeLeft, phase]);

  const startExam = async () => {
    if (!apiKey) {
      toast.error("Configure a chave de IA no Perfil para gerar a prova.");
      return;
    }
    if (!sequence.length) {
      toast.error("Selecione ao menos uma disciplina para gerar a prova.");
      return;
    }
    submittedRef.current = false;
    setResult(null);
    setAnswers({});
    answersRef.current = {};
    setCurrentIndex(0);
    setTimeLeft(durationMinutes * 60);
    await start({
      title,
      mode,
      durationMinutes,
      sequence: sequence.map((discipline) => ({
        id: discipline.id,
        name: discipline.name,
        topicId: discipline.topicId,
        topicName: discipline.topicName,
      })),
      blueprint: allocations.map((allocation) => ({
        disciplineId: allocation.discipline.id,
        disciplineName: allocation.discipline.name,
        count: allocation.count,
      })),
      apiKey,
      provider,
      excludeStatements: priorQuestions
        .map((question: any) => String(question.statement || ""))
        .filter(Boolean),
      excludeQuestionIds: priorQuestions
        .map((question: any) =>
          String(question.id || question.questionId || ""),
        )
        .filter(Boolean),
    });
  };

  const selectAnswer = (questionId: string, letter: string) => {
    const next = { ...answersRef.current, [questionId]: letter };
    answersRef.current = next;
    setAnswers(next);
  };

  const printExam = async (withKey = false) => {
    setPrintKey(withKey);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const api = (window as any).electron?.examPdf;
    if (api?.save) {
      const node = document.querySelector(".exam-print");
      if (!node) return;
      const result = await api.save(
        node.outerHTML,
        `${(title || "simulado-soe").replace(/[^a-zA-Z0-9-_ ]/g, "").trim()}.pdf`,
      );
      if (result?.success) toast.success("PDF salvo com sucesso.");
      else if (!result?.canceled)
        toast.error(result?.message || "Falha ao salvar PDF.");
      return;
    }
    window.print();
  };

  const resetAll = () => {
    resetGeneration();
    setResult(null);
    setAnswers({});
    answersRef.current = {};
    setCurrentIndex(0);
    timerExamRef.current = null;
    submittedRef.current = false;
  };

  const answeredCount = Object.keys(answers).length;
  const accuracy =
    questions.length > 0
      ? Math.round(
          (questions.filter(
            (question) =>
              String(answers[question.id] || "").toUpperCase() ===
              String(question.correctAnswer || "").toUpperCase(),
          ).length /
            questions.length) *
            100,
        )
      : 0;

  const toggleDiscipline = (id: number) => {
    const base =
      selectedIds === null
        ? (disciplines as any[]).map((discipline) => discipline.id)
        : selectedIds;
    const next = base.includes(id)
      ? base.filter((item) => item !== id)
      : [...base, id];
    setSelectedIds(next);
  };

  return (
    <>
      <style>{`
        @media screen { .exam-print { display: none; } }
        @media print {
          @page { size: A4; margin: 14mm; }
          body * { visibility: hidden; }
          .exam-print, .exam-print * { visibility: visible; }
          .exam-print { display: block !important; position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <ExamPrintView
        title={title}
        mode={mode}
        questions={questions}
        blueprint={
          generatedBlueprint.length
            ? generatedBlueprint
            : allocations.map((allocation) => ({
                disciplineId: allocation.discipline.id,
                disciplineName: allocation.discipline.name,
                count: allocation.count,
              }))
        }
        includeKey={printKey}
      />

      <PageShell
        eyebrow="Prova"
        title="Simulados"
        description="Gere uma prova completa, responda sem ver o gabarito e receba o resultado no final."
        metrics={
          phase === "config"
            ? [
                {
                  label: "Questões",
                  value: questions.length || totalQuestions,
                  icon: Target,
                },
                {
                  label: "Tempo",
                  value: `${durationMinutes} min`,
                  icon: Clock,
                },
                {
                  label: "Respondidas",
                  value: answeredCount,
                  icon: CheckCircle2,
                },
                { label: "Acurácia", value: `${accuracy}%`, icon: Trophy },
              ]
            : undefined
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {questions.length > 0 && (
              <Button
                variant="outline"
                className="h-9 text-[10px]"
                onClick={() => printExam(false)}
              >
                <Printer className="mr-2 h-3.5 w-3.5" /> Baixar prova
              </Button>
            )}
            <Button
              variant="outline"
              className="h-9 text-[10px]"
              onClick={() => navigate("/mock-exams")}
            >
              <FileText className="mr-2 h-3.5 w-3.5" /> Meus simulados
            </Button>
          </div>
        }
      >
        {phase === "config" && (
          <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
            <div className="space-y-4">
              {recommendation.length > 0 && (
                <section className="soe-card border-primary/20 p-4">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold">
                      Recomendação do mentor
                    </h2>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Seu histórico aponta mais erro em{" "}
                    <b className="text-foreground">
                      {recommendation
                        .map((topic: any) => topic.topicName)
                        .join(" e ")}
                    </b>
                    . O blueprint abaixo já prioriza o peso do edital; use a
                    prova para medir o conjunto.
                  </p>
                </section>
              )}

              <section className="soe-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold">
                      Disciplinas da prova
                    </h2>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedIds(null)}
                      className="text-[8.5px] font-bold uppercase tracking-wider text-primary hover:underline"
                    >
                      Todas
                    </button>
                    <button
                      onClick={() => setSelectedIds([])}
                      className="text-[8.5px] font-bold uppercase tracking-wider text-muted-foreground hover:underline"
                    >
                      Nenhuma
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                  {(disciplines as any[]).map((discipline) => {
                    const selected = selectedSet.has(discipline.id);
                    return (
                      <button
                        key={discipline.id}
                        onClick={() => toggleDiscipline(discipline.id)}
                        className={`flex items-center gap-2 rounded border px-2.5 py-2 text-left text-[10px] transition-colors ${
                          selected
                            ? "border-primary/40 bg-primary/5 text-foreground"
                            : "border-border text-muted-foreground hover:bg-secondary/30"
                        }`}
                      >
                        <span
                          className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-sm border ${
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border"
                          }`}
                        >
                          {selected && <CheckCircle2 className="h-2.5 w-2.5" />}
                        </span>
                        <span className="truncate">{discipline.name}</span>
                      </button>
                    );
                  })}
                  {disciplines.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      Cadastre disciplinas primeiro.
                    </p>
                  )}
                </div>
              </section>

              <section className="soe-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Grid3X3 className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold">
                      Blueprint da prova
                    </h2>
                  </div>
                  <span className="text-[9px] text-muted-foreground">
                    {allocations.reduce((sum, item) => sum + item.count, 0)}{" "}
                    questões
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Distribuição por peso do edital apenas entre as disciplinas
                  selecionadas.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
                      Selecione disciplinas para montar o blueprint.
                    </p>
                  )}
                </div>
              </section>

              <section className="soe-card p-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Formato</h2>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    onClick={() => setMode("multiple")}
                    className={`rounded border p-3 text-left text-[10.5px] ${
                      mode === "multiple"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-secondary/30"
                    }`}
                  >
                    <b className="block text-foreground">Múltipla escolha</b>
                    <span className="text-muted-foreground">
                      Alternativas A-E, estilo tradicional.
                    </span>
                  </button>
                  <button
                    onClick={() => setMode("cebraspe")}
                    className={`rounded border p-3 text-left text-[10.5px] ${
                      mode === "cebraspe"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-secondary/30"
                    }`}
                  >
                    <b className="block text-foreground">Certo/Errado</b>
                    <span className="text-muted-foreground">
                      Itens C/E, estilo CEBRASPE.
                    </span>
                  </button>
                </div>
              </section>
            </div>

            <aside className="space-y-4">
              <section className="soe-card p-4">
                <label className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
                  Nome da prova
                </label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-1 h-9 w-full rounded border border-border bg-secondary/30 px-3 text-sm font-semibold"
                />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
                      Questões
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
                  </div>
                  <div>
                    <label className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
                      Tempo (min)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={240}
                      value={durationMinutes}
                      onChange={(event) =>
                        setDurationMinutes(
                          Math.max(
                            1,
                            Math.min(240, Number(event.target.value)),
                          ),
                        )
                      }
                      className="mt-1 h-9 w-full rounded border border-border bg-secondary/30 px-3 text-sm font-semibold"
                    />
                  </div>
                </div>
                {!apiKey && (
                  <div className="mt-3 flex gap-2 rounded border border-amber-500/20 bg-amber-500/5 p-2.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                    <p className="text-[9.5px] text-muted-foreground">
                      Configure a chave de IA em Perfil → Inteligência
                      Artificial.
                    </p>
                  </div>
                )}
                {aiKeyCount > 1 && (
                  <div className="mt-2 rounded border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-[9.5px] text-muted-foreground">
                    <b className="text-foreground">
                      {aiKeyCount} chaves detectadas.
                    </b>{" "}
                    Até 4 trabalham em paralelo; a primeira coordena as
                    verificações e retries.
                  </div>
                )}
                {generationError && (
                  <div className="mt-2 rounded border border-destructive/20 bg-destructive/5 p-2.5 text-[9.5px] text-destructive">
                    {generationError}
                  </div>
                )}
                <Button
                  onClick={startExam}
                  className="mt-3 w-full"
                  disabled={!allocations.length || status === "generating"}
                >
                  <Play className="mr-2 h-3.5 w-3.5" /> Gerar prova
                </Button>
                <button
                  onClick={() => navigate("/mock-exams")}
                  className="mt-2 w-full text-center text-[9.5px] font-semibold text-primary hover:underline"
                >
                  Já fiz um simulado — cadastrar resultado
                </button>
              </section>
              <div className="soe-card p-4 text-[9.5px] leading-relaxed text-muted-foreground">
                <b className="text-foreground">Sem gabarito até o fim:</b> você
                pode navegar, marcar e revisar. A correção só aparece depois de
                entregar. Use <b>Baixar prova</b> para imprimir/salvar em PDF e
                responder no papel.
                <span className="mt-2 block border-t border-border pt-2">
                  <b className="text-foreground">Pesquisa opcional:</b> a IA
                  pode consultar fontes públicas atualizadas quando o provedor
                  permitir. Ela nunca acessa o TEC.
                </span>
              </div>
            </aside>
          </div>
        )}

        {phase === "generating" && (
          <section className="soe-card p-8 text-center">
            <Brain className="mx-auto h-8 w-8 animate-pulse text-primary" />
            <h2 className="mt-3 text-lg font-semibold">
              Montando sua prova...
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {progress.current} de {progress.total} questões · evitando
              repetições do seu histórico
            </p>
            <div className="mx-auto mt-4 h-1.5 max-w-md overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="mt-3 text-[10px] text-muted-foreground">
              Você pode sair desta aba. A geração continua em segundo plano e
              avisaremos quando terminar.
            </p>
          </section>
        )}

        {phase === "running" && (
          <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
            <section className="exam-paper mx-auto w-full max-w-[980px] overflow-hidden">
              <div className="paper-sans border-b-2 paper-rule px-5 pb-4 pt-5 sm:px-8">
                <div className="flex items-center justify-between text-[8px] font-bold uppercase tracking-[0.18em] text-foreground/60">
                  <span>SOE · Caderno de provas</span>
                  <span>
                    {mode === "cebraspe"
                      ? "CEBRASPE · C/E"
                      : "Múltipla escolha"}
                  </span>
                </div>
                <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground">
                  {title}
                </h2>
                <p className="mt-1 text-[10px] text-foreground/70">
                  Prova objetiva · {questions.length} questões ·{" "}
                  {durationMinutes} minutos
                </p>
                <p className="mt-2 border-t paper-rule pt-2 text-[9px] leading-relaxed text-foreground/60">
                  Leia cada questão com atenção. Marque apenas uma alternativa
                  por questão. O gabarito só será exibido após a entrega.
                </p>
              </div>
              <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b paper-rule bg-[#f6f2e8]/95 px-4 py-2 backdrop-blur dark:bg-[#16181b]/95">
                <div>
                  <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                    CADERNO DE PROVAS ·{" "}
                    {mode === "cebraspe" ? "CEBRASPE C/E" : "MÚLTIPLA ESCOLHA"}
                  </p>
                  <p className="mt-0.5 text-[13px] font-semibold">{title}</p>
                  {reviewSummary?.reviewed && (
                    <p className="mt-0.5 text-[8px] text-muted-foreground">
                      revisado pela chave cérebro · qualidade{" "}
                      {reviewSummary.quality}/100
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[9px] text-muted-foreground">
                    {answeredCount}/{questions.length} marcadas
                  </span>
                  <span
                    className={`font-mono text-sm font-semibold ${timeLeft < 60 ? "text-destructive" : ""}`}
                  >
                    {formatTime(timeLeft)}
                  </span>
                  <Button
                    variant="outline"
                    className="h-8 text-[9px]"
                    onClick={() => printExam(false)}
                  >
                    <Download className="mr-1.5 h-3 w-3" /> PDF
                  </Button>
                </div>
              </div>

              <div className="max-h-[calc(100vh-15rem)] overflow-y-auto px-4 py-3 sm:px-8">
                {sections.map((section) => (
                  <div key={section.name} className="mb-5">
                    <div className="paper-sans mb-2 flex items-center justify-between border-y paper-rule bg-black/[0.04] px-2 py-2 dark:bg-white/[0.04]">
                      <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-foreground">
                        {section.name}
                      </span>
                      <span className="text-[8px] text-muted-foreground">
                        {section.questions.length} questão(ões)
                      </span>
                    </div>
                    <div className="space-y-3">
                      {section.questions.map((question) => {
                        const globalIndex = questions.findIndex(
                          (item) => item.id === question.id,
                        );
                        return (
                          <article
                            id={`exam-question-${question.id}`}
                            key={question.id}
                            onClick={() => setCurrentIndex(globalIndex)}
                            className={`scroll-mt-24 cursor-default border-b paper-rule py-4 transition-colors ${
                              currentIndex === globalIndex ? "bg-primary/5" : ""
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-baseline gap-2">
                                <span className="paper-sans flex h-6 w-6 flex-shrink-0 items-center justify-center text-[11px] font-bold text-foreground">
                                  {question.number}.
                                </span>
                                <div className="min-w-0">
                                  <p className="paper-sans text-[8px] font-bold uppercase tracking-wider text-foreground/55">
                                    {question.disciplineName}
                                    {question.topicName
                                      ? ` · ${question.topicName}`
                                      : ""}
                                  </p>
                                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-[1.55] text-foreground">
                                    {question.statement}
                                  </p>
                                </div>
                              </div>
                              {answers[question.id] && (
                                <span className="flex-shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-semibold text-emerald-600">
                                  marcada {answers[question.id]}
                                </span>
                              )}
                            </div>

                            <div className="mt-3 grid gap-1.5">
                              {question.alternatives.map((alternative) => {
                                const selected =
                                  answers[question.id] === alternative.letter;
                                return (
                                  <button
                                    key={alternative.letter}
                                    onClick={() =>
                                      selectAnswer(
                                        question.id,
                                        alternative.letter,
                                      )
                                    }
                                    className={`flex gap-3 rounded-sm px-1 py-1.5 text-left text-[11.5px] leading-relaxed transition-colors ${
                                      selected
                                        ? "bg-primary/15 text-foreground"
                                        : "text-foreground/90 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                                    }`}
                                  >
                                    <span
                                      className={`paper-sans flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-[9px] font-bold ${
                                        selected
                                          ? "border-primary bg-primary text-primary-foreground"
                                          : "border-foreground/30 text-foreground/70"
                                      }`}
                                    >
                                      {alternative.letter}
                                    </span>
                                    <span>{alternative.text}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <div className="paper-sans flex flex-col items-center gap-2 border-t paper-rule py-5">
                  <p className="text-[9.5px] text-muted-foreground">
                    Revise as marcações no mapa ao lado antes de entregar.
                  </p>
                  <Button onClick={() => finishExam(false)}>
                    <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Entregar prova
                  </Button>
                </div>
              </div>
            </section>

            <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
              <section className="soe-card p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
                    Folha de respostas
                  </p>
                  <span className="text-[8px] text-muted-foreground">
                    {answeredCount}/{questions.length}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-5 gap-1.5">
                  {questions.map((question, index) => {
                    const answered = Boolean(answers[question.id]);
                    const active = index === currentIndex;
                    return (
                      <button
                        key={question.id}
                        onClick={() => {
                          setCurrentIndex(index);
                          document
                            .getElementById(`exam-question-${question.id}`)
                            ?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                        }}
                        className={`flex flex-col items-center justify-center rounded border py-1 text-[9px] font-semibold ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : answered
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                              : "border-border bg-secondary/30 text-muted-foreground"
                        }`}
                      >
                        <span>{question.number}</span>
                        <span className="text-[7px] opacity-70">
                          {answers[question.id] || "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  className="mt-3 w-full text-[10px]"
                  onClick={() => printExam(false)}
                >
                  <Printer className="mr-2 h-3.5 w-3.5" /> Baixar para papel
                </Button>
                <Button
                  variant="ghost"
                  className="mt-1 w-full text-[9px] text-destructive"
                  onClick={() => finishExam(false)}
                >
                  Encerrar e ver resultado
                </Button>
              </section>
              <div className="soe-card p-3 text-[9.5px] leading-relaxed text-muted-foreground">
                <b className="text-foreground">Prova em modo caderno:</b> várias
                questões na mesma página, como no papel. O gabarito só aparece
                após a entrega.
              </div>
            </aside>
          </div>
        )}

        {phase === "result" && result && (
          <div className="space-y-4">
            <section className="soe-card p-5 text-center">
              <Trophy className="mx-auto h-8 w-8 text-primary" />
              <h2 className="mt-2 text-xl font-semibold">
                {result.accuracy}% de acerto
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {result.correct} acertos · {result.wrong} erros · {result.blank}{" "}
                em branco
                {result.auto ? " · encerrada pelo tempo" : ""}
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <Button onClick={() => printExam(true)}>
                  <Download className="mr-2 h-3.5 w-3.5" /> Baixar gabarito
                </Button>
                <Button variant="outline" onClick={resetAll}>
                  <RotateCcw className="mr-2 h-3.5 w-3.5" /> Novo simulado
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate("/mock-exams")}
                >
                  Ver histórico
                </Button>
              </div>
            </section>

            <section className="soe-card p-4">
              <h3 className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                Resultado por disciplina
              </h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {result.perDiscipline.map((item: any) => (
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
            </section>

            <section className="soe-card p-4">
              <h3 className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                Correção comentada
              </h3>
              <div className="mt-2 divide-y divide-border">
                {questions.map((question) => {
                  const selected = answers[question.id];
                  const isCorrect =
                    String(selected || "").toUpperCase() ===
                    String(question.correctAnswer || "").toUpperCase();
                  return (
                    <div key={question.id} className="py-3">
                      <div className="flex items-start gap-2">
                        {isCorrect ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                        ) : (
                          <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-500" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[10.5px] font-medium">
                            {question.number}. {question.statement}
                          </p>
                          <p className="mt-1 text-[9.5px] text-muted-foreground">
                            Sua resposta: <b>{selected || "em branco"}</b> ·
                            Gabarito: <b>{question.correctAnswer}</b>
                          </p>
                          {question.explanation && (
                            <p className="mt-1 text-[9.5px] text-muted-foreground">
                              {question.explanation}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </PageShell>
    </>
  );
}
