import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Sparkles, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/apple";
import type { SavedLesson } from "@shared/topicLessons";
import { GenerationProgress } from "./GenerationProgress";
import { LessonPlayer } from "./LessonPlayer";
import { contextSnippet } from "./readingModel";
import { useGenerationJob, type GenerationProvider } from "./useGenerationJob";

/**
 * Estúdio da aula interativa de um tópico.
 *
 * Vale para os três lugares onde o aluno pede a aula (seção do PDF, tópico em
 * Temas e Caderno de Erros): recebe nome do tópico + disciplina + trecho e cuida
 * de gerar, salvar (1 aula por tópico, até 5 versões), reabrir e apagar.
 * No celular sem servidor a geração não existe — e isso é dito com clareza,
 * mostrando o que já está salvo.
 */
export function LessonStudio({
  topicName,
  disciplineName = "",
  topicId,
  context = "",
  provider = "gemini",
  apiKey,
  generateToken = 0,
  onOpen,
}: {
  topicName: string;
  disciplineName?: string;
  topicId?: number;
  context?: string;
  provider?: GenerationProvider;
  apiKey?: string;
  /** Cada incremento dispara uma nova geração (usado pela barra do mobile). */
  generateToken?: number;
  /**
   * Quando existe, a aula não é desenhada aqui: o leitor recebe o pedido e
   * mostra a animação na coluna larga (o painel de 320px não serve para
   * animação). Sem isto (nos diálogos), o player aparece inline.
   */
  onOpen?: (lesson: SavedLesson) => void;
}) {
  const utils = trpc.useUtils();
  const job = useGenerationJob();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const handledResult = useRef<string | null>(null);
  const handledToken = useRef(0);

  const lessonsQuery = trpc.learning.lessonsFor.useQuery(
    { topicName },
    { enabled: Boolean(topicName) },
  );
  const studiedQuery = trpc.learning.lessonStudiedToday.useQuery(
    { topicName },
    { enabled: Boolean(topicName) },
  );

  const saveLesson = trpc.learning.saveLesson.useMutation();
  const deleteLesson = trpc.learning.deleteLesson.useMutation();
  const markStudied = trpc.learning.markLessonStudied.useMutation({
    onSuccess: async (result) => {
      if (result.recorded) {
        toast.success("Aula marcada como estudada hoje.");
        await utils.learning.lessonStudiedToday.invalidate({ topicName });
      } else {
        toast("Essa aula já estava marcada como estudada hoje.");
      }
      await utils.dashboard.getStats.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const lessons = useMemo(
    () => (lessonsQuery.data ?? []) as SavedLesson[],
    [lessonsQuery.data],
  );
  const current = useMemo(() => {
    if (selectedId) {
      const found = lessons.find((item) => item.id === selectedId);
      if (found) return found;
    }
    return lessons[0] ?? null;
  }, [lessons, selectedId]);

  const runGeneration = () => {
    handledResult.current = null;
    void job.start({
      kind: "lesson",
      topicName,
      disciplineName,
      topicId,
      context: contextSnippet(context),
      provider,
      apiKey,
    });
  };

  useEffect(() => {
    if (!generateToken || generateToken === handledToken.current) return;
    handledToken.current = generateToken;
    if (topicName) runGeneration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generateToken, topicName]);

  // Resultado pronto: salva no tópico e passa a exibir o que foi salvo.
  useEffect(() => {
    const result = job.result;
    if (!result || !topicName) return;
    const key = String(result.id || result.title || "");
    if (handledResult.current === key) return;
    handledResult.current = key;

    void (async () => {
      try {
        const saved = await saveLesson.mutateAsync({
          topicId,
          topicName,
          disciplineName,
          title: result.title,
          html: result.html,
          steps: result.steps,
          interaction: result.interaction,
          question: result.question,
          limits: result.limits,
        });
        setSelectedId(saved.id);
        await utils.learning.lessonsFor.invalidate({ topicName });
        toast.success("Aula salva no tópico.");
        onOpen?.(saved);
      } catch (error: any) {
        toast.error(
          String(error?.message || "").trim() ||
            "A aula foi gerada, mas não consegui salvar.",
        );
      }
    })();
  }, [
    job.result,
    topicName,
    topicId,
    disciplineName,
    saveLesson,
    utils,
    onOpen,
  ]);

  const native = Capacitor.isNativePlatform();
  const generateDisabled = job.running || job.isStarting;

  return (
    <div data-testid="lesson-studio" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-medium text-foreground">
            {topicName}
          </p>
          <p className="text-[11px] text-muted-foreground">
            1 aula por tópico · até 5 versões · animação isolada, sem rede
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 px-2 text-[11px]"
          disabled={generateDisabled}
          onClick={runGeneration}
        >
          <Sparkles className="h-3 w-3" />
          {current ? "Gerar outra versão" : "Gerar aula interativa"}
        </Button>
      </div>

      {native && (
        <p className="flex items-start gap-1.5 rounded-[8px] border border-border bg-secondary/40 p-2 text-[11px] leading-4 text-muted-foreground">
          <WifiOff className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          No celular, gerar aula precisa do SOE no computador (a IA roda no
          servidor). As aulas já salvas abrem aqui.
        </p>
      )}

      <GenerationProgress job={job} title="Montando a aula interativa" />

      {lessons.length > 1 && (
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          Versões
          <select
            value={current?.id ?? ""}
            onChange={(event) => setSelectedId(event.target.value)}
            className="h-7 rounded-md border border-border bg-background px-2 text-[11px] text-foreground"
          >
            {lessons.map((lesson, index) => (
              <option key={lesson.id} value={lesson.id}>
                {index === 0 ? "Atual" : `Anterior ${index}`} ·{" "}
                {new Date(lesson.createdAt).toLocaleDateString("pt-BR")}
              </option>
            ))}
          </select>
        </label>
      )}

      {current && onOpen ? (
        <div className="rounded-[10px] border border-border bg-secondary/30 p-2.5">
          <p className="text-[12px] font-medium text-foreground">
            {current.title}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {current.steps.length} passos ·{" "}
            {new Date(current.createdAt).toLocaleDateString("pt-BR")}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => onOpen(current)}
            >
              Abrir no leitor
            </Button>
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:text-destructive"
              onClick={() =>
                deleteLesson.mutate(
                  { lessonId: current.id },
                  {
                    onSuccess: async () => {
                      setSelectedId(null);
                      await utils.learning.lessonsFor.invalidate({ topicName });
                      toast.success("Aula apagada.");
                    },
                    onError: (error) => toast.error(error.message),
                  },
                )
              }
            >
              Apagar
            </button>
          </div>
        </div>
      ) : current ? (
        <LessonPlayer
          lesson={current}
          studiedToday={Boolean(studiedQuery.data?.studied)}
          marking={markStudied.isPending}
          regenerating={job.running}
          onMarkStudied={() =>
            markStudied.mutate({
              lessonId: current.id,
              topicName,
              topicId,
            })
          }
          onRegenerate={runGeneration}
          onDelete={() =>
            deleteLesson.mutate(
              { lessonId: current.id },
              {
                onSuccess: async () => {
                  setSelectedId(null);
                  await utils.learning.lessonsFor.invalidate({ topicName });
                  toast.success("Aula apagada.");
                },
                onError: (error) => toast.error(error.message),
              },
            )
          }
        />
      ) : (
        !job.running && (
          <EmptyState
            title="Nenhuma aula ainda"
            description="A aula interativa é uma animação que explica o conceito em passos, com uma interação para você mexer e uma pergunta de verificação no fim."
            action={
              <Button
                type="button"
                size="sm"
                className="h-7 px-3 text-[11px]"
                disabled={generateDisabled}
                onClick={runGeneration}
              >
                Gerar aula interativa
              </Button>
            }
          />
        )
      )}
    </div>
  );
}

export default LessonStudio;
