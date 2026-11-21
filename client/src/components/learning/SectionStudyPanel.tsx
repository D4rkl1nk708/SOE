import { useEffect, useRef, useState } from "react";
import {
  Boxes,
  Check,
  GitCompareArrows,
  HelpCircle,
  Loader2,
  PlayCircle,
  Save,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/apple";
import { cn } from "@/lib/utils";
import type {
  Analogy,
  CadernoVivoState,
  SectionQuestion,
} from "./useCadernoVivo";
import type { MicroWorld } from "./SandboxFrame";
import SandboxFrame from "./SandboxFrame";
import { GenerationProgress } from "./GenerationProgress";
import { LessonStudio } from "./LessonStudio";
import { useGenerationJob } from "./useGenerationJob";
import { sectionPagesLabel } from "./readingModel";
import type { SavedLesson } from "@shared/topicLessons";

type ThirdMode = "lesson" | "microWorld";

/**
 * Painel "Estudar esta seção".
 *
 * Três ações em lista vertical, cada uma dizendo o que faz, e o resultado
 * aparecendo aqui mesmo (sem modal gigante). Toda geração usa o job com %:
 * perguntas e analogias por este painel, aula interativa pelo estúdio da aula,
 * micro-mundo pelo mesmo job da seção.
 */
type PanelRequest = {
  action: "questions" | "analogies" | "lesson";
  token: number;
};

export function SectionStudyPanel({
  caderno,
  request,
  onOpenLesson,
  onOpenWorld,
}: {
  caderno: CadernoVivoState;
  request?: PanelRequest | null;
  /** O leitor mostra a aula na coluna larga; o painel só pede. */
  onOpenLesson?: (lesson: SavedLesson) => void;
  onOpenWorld?: (world: MicroWorld) => void;
}) {
  const utils = trpc.useUtils();
  const job = useGenerationJob();
  const handled = useRef<string>("");
  const [questions, setQuestions] = useState<SectionQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [analogies, setAnalogies] = useState<Analogy[] | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [whyItWorks, setWhyItWorks] = useState("");
  const [world, setWorld] = useState<MicroWorld | null>(null);
  const [third, setThird] = useState<ThirdMode>("lesson");
  const [lessonToken, setLessonToken] = useState(0);
  const lastRequest = useRef(0);

  const section = caderno.section;
  const saveAnalogy = trpc.learning.saveAnalogy.useMutation({
    onSuccess: async () => {
      toast.success("Analogia salva no tema — o mentor passa a usá-la.");
      setWhyItWorks("");
      await utils.learning.analogiesFor.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const saveWorld = trpc.learning.saveMicroWorld.useMutation({
    onError: (error) => toast.error(error.message),
  });
  // Micro-mundo já salvo neste tópico: reabre sem chamar a IA de novo.
  const savedWorlds = trpc.learning.microWorldsFor.useQuery(
    { topicName: section?.title ?? "" },
    { enabled: Boolean(section?.title) },
  );
  const savedWorld = (savedWorlds.data?.[0] ?? null) as MicroWorld | null;

  const topicName = section?.title || "";

  // Resultado do job entra na seção certa e é salvo quando for artefato.
  useEffect(() => {
    const result = job.result;
    if (!result || !section) return;
    const key = `${job.kind}:${section.title}:${job.view?.jobId ?? ""}`;
    if (handled.current === key) return;
    handled.current = key;

    if (job.kind === "questions" && Array.isArray(result.questions)) {
      setQuestions(result.questions);
      setAnswers({});
      setRevealed({});
    }
    if (job.kind === "analogies" && Array.isArray(result.analogies)) {
      setAnalogies(result.analogies);
      setChosen(null);
    }
    if (job.kind === "microWorld" && result.html) {
      setWorld(result as MicroWorld);
      saveWorld.mutate({
        topicName,
        title: result.title,
        html: result.html,
        controls: result.controls ?? [],
        challenges: result.challenges ?? [],
        limits: result.limits ?? [],
      });
      void utils.learning.microWorldsFor.invalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.result, job.kind, section?.title]);

  const requireKey = () => {
    if (!caderno.hasKey) {
      toast.error("Configure a chave de IA no Perfil para gerar com IA.");
      return false;
    }
    return true;
  };

  const startQuestions = () => {
    if (!requireKey() || !caderno.doc) return;
    void job.start({
      kind: "questions",
      topicName,
      docId: caderno.doc.id,
      sectionIndex: caderno.sectionIndex,
      disciplineName: "",
      provider: caderno.provider,
      apiKey: caderno.apiKey,
    });
  };

  const startAnalogies = () => {
    if (!requireKey() || !section) return;
    void job.start({
      kind: "analogies",
      topicName,
      context: section.text.slice(0, 600),
      provider: caderno.provider,
      apiKey: caderno.apiKey,
    });
  };

  const startWorld = () => {
    if (!requireKey()) return;
    void job.start({
      kind: "microWorld",
      topicName,
      provider: caderno.provider,
      apiKey: caderno.apiKey,
    });
  };

  // Barra de ações do mobile: dispara a ação pedida nesta seção.
  useEffect(() => {
    if (!request || request.token === lastRequest.current) return;
    lastRequest.current = request.token;
    if (request.action === "lesson") {
      setThird("lesson");
      setLessonToken(request.token);
      return;
    }
    if (!section) return;
    if (request.action === "questions") startQuestions();
    if (request.action === "analogies") startAnalogies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.token]);

  if (!section) {
    return (
      <div className="apple-card p-4 text-[12px] text-muted-foreground">
        Escolha uma seção para ver as ações de estudo.
      </div>
    );
  }

  const answeredCount =
    questions?.filter((_, index) => (answers[index] || "").trim()).length ?? 0;

  const rows = [
    {
      id: "questions",
      icon: HelpCircle,
      title: "Perguntas de recuperação",
      description:
        "3 perguntas para responder de cabeça, com a página da resposta.",
      action: "Gerar perguntas",
      onClick: startQuestions,
      busy: job.running && job.kind === "questions",
      hasResult: Boolean(questions),
    },
    {
      id: "analogies",
      icon: GitCompareArrows,
      title: "Analogias",
      description: "3 analogias com o ponto onde cada uma deixa de valer.",
      action: "Gerar analogias",
      onClick: startAnalogies,
      busy: job.running && job.kind === "analogies",
      hasResult: Boolean(analogies),
    },
  ];

  return (
    <div data-testid="study-panel" className="space-y-3">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-foreground">
          Estudar esta seção
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {sectionPagesLabel(section)}
        </span>
      </header>

      <div className="apple-list overflow-hidden rounded-[12px] border border-border bg-card">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div
              key={row.id}
              className="border-b border-border px-3 py-3 last:border-b-0"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-secondary text-muted-foreground">
                  <Icon size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium text-foreground">
                    {row.title}
                  </p>
                  <p className="mt-0.5 text-[11.5px] leading-4 text-muted-foreground">
                    {row.description}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 gap-1.5 px-2 text-[11px]"
                  disabled={job.running || job.isStarting}
                  onClick={row.onClick}
                >
                  {row.busy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : row.hasResult ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  {row.hasResult ? "Gerar outra" : row.action}
                </Button>
              </div>

              {job.kind === row.id && job.view && (
                <div className="mt-2">
                  <GenerationProgress job={job} />
                </div>
              )}

              {row.id === "questions" && questions && (
                <div
                  className="mt-2.5 space-y-3"
                  data-testid="section-questions"
                >
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Responda de cabeça · {answeredCount}/{questions.length}
                  </p>
                  {questions.map((item, index) => (
                    <div key={`${row.id}-${index}`} className="space-y-1">
                      <p className="text-[12px] font-medium leading-4 text-foreground">
                        {index + 1}. {item.question}
                      </p>
                      <textarea
                        value={answers[index] || ""}
                        onChange={(event) =>
                          setAnswers((previous) => ({
                            ...previous,
                            [index]: event.target.value,
                          }))
                        }
                        rows={2}
                        placeholder="Sua resposta, sem consultar..."
                        className="w-full resize-y rounded-md border border-border bg-background/40 p-1.5 text-[11.5px] leading-4 outline-none focus:border-primary/50"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="text-[11px] font-medium text-primary hover:underline"
                          onClick={() =>
                            setRevealed((previous) => ({
                              ...previous,
                              [index]: !previous[index],
                            }))
                          }
                        >
                          {revealed[index] ? "Ocultar resposta" : "Conferir"}
                        </button>
                        <span className="text-[10px] text-muted-foreground">
                          fonte: p. {item.pageFrom}–{item.pageTo}
                        </span>
                      </div>
                      {revealed[index] && (
                        <ul className="space-y-0.5 text-[11.5px] leading-4 text-muted-foreground">
                          {item.answerKey.map((point) => (
                            <li key={point}>• {point}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {row.id === "analogies" && analogies && (
                <div
                  className="mt-2.5 space-y-2"
                  data-testid="section-analogies"
                >
                  {caderno.savedAnalogies.length > 0 && (
                    <div className="rounded-md border border-emerald-500/25 bg-emerald-500/10 p-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                        Sua analogia salva
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-foreground">
                        {caderno.savedAnalogies[0].analogy}
                      </p>
                    </div>
                  )}
                  <textarea
                    value={whyItWorks}
                    onChange={(event) => setWhyItWorks(event.target.value)}
                    rows={2}
                    placeholder="Ao escolher, escreva em uma frase por que ela funciona para você..."
                    className="w-full resize-y rounded-md border border-border bg-background/40 p-1.5 text-[11.5px] leading-4 outline-none focus:border-primary/50"
                  />
                  {analogies.map((item, index) => (
                    <div
                      key={`${row.id}-${index}`}
                      className={cn(
                        "rounded-md border p-2",
                        chosen === index
                          ? "border-primary/40 bg-primary/5"
                          : "border-border bg-secondary/30",
                      )}
                    >
                      <p className="text-[12px] font-medium text-foreground">
                        {item.analogy}
                      </p>
                      {item.bestFor && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Ilumina: {item.bestFor}
                        </p>
                      )}
                      {item.mapping.length > 0 && (
                        <ul className="mt-0.5 space-y-0.5 text-[11px] text-muted-foreground">
                          {item.mapping.map((line) => (
                            <li key={line}>→ {line}</li>
                          ))}
                        </ul>
                      )}
                      {item.breaks && (
                        <p className="mt-0.5 text-[11px] text-[var(--accent-amber)]">
                          Onde quebra: {item.breaks}
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={saveAnalogy.isPending}
                        onClick={() => {
                          setChosen(index);
                          saveAnalogy.mutate({
                            topicName,
                            analogy: item.analogy,
                            mapping: item.mapping,
                            breaks: item.breaks,
                            bestFor: item.bestFor,
                            whyItWorks: whyItWorks.trim() || undefined,
                          });
                        }}
                        className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-60"
                      >
                        <Save className="h-3 w-3" />
                        {chosen === index ? "Escolhida" : "Ficar com esta"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Terceira ação: aula interativa (padrão) ou micro-mundo manipulável. */}
        <div className="px-3 py-3">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-secondary text-muted-foreground">
              {third === "lesson" ? (
                <PlayCircle size={14} />
              ) : (
                <Boxes size={14} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium text-foreground">
                {third === "lesson" ? "Aula interativa" : "Micro-mundo"}
              </p>
              <p className="mt-0.5 text-[11.5px] leading-4 text-muted-foreground">
                {third === "lesson"
                  ? "Animação que ensina o conceito em passos, com uma interação e uma pergunta no fim."
                  : "Página manipulável: você mexe nos controles e vê o conceito reagir."}
              </p>
            </div>
          </div>

          <SegmentedControl
            className="mt-2"
            value={third}
            onChange={(value) => setThird(value as ThirdMode)}
            options={[
              { value: "lesson", label: "Aula interativa" },
              { value: "microWorld", label: "Micro-mundo" },
            ]}
          />

          {third === "lesson" ? (
            <div className="mt-2.5">
              <LessonStudio
                topicName={topicName}
                disciplineName=""
                context={section.text}
                provider={caderno.provider}
                apiKey={caderno.apiKey}
                generateToken={lessonToken}
                onOpen={onOpenLesson}
              />
            </div>
          ) : (
            <div className="mt-2.5 space-y-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 px-2 text-[11px]"
                disabled={job.running || job.isStarting}
                onClick={startWorld}
              >
                {job.running && job.kind === "microWorld" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                {world || savedWorld
                  ? "Gerar outro micro-mundo"
                  : "Gerar micro-mundo"}
              </Button>
              {job.kind === "microWorld" && job.view && (
                <GenerationProgress job={job} title="Montando o micro-mundo" />
              )}
              {(world || savedWorld) && onOpenWorld ? (
                <div className="rounded-[10px] border border-border bg-secondary/30 p-2.5">
                  <p className="text-[12px] font-medium text-foreground">
                    {(world ?? savedWorld)!.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {world ? "Gerado agora" : "Micro-mundo salvo neste tópico"}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-1.5 h-7 px-2 text-[11px]"
                    onClick={() => onOpenWorld((world ?? savedWorld)!)}
                  >
                    Abrir no leitor
                  </Button>
                </div>
              ) : (
                (world || savedWorld) && (
                  <div className="space-y-1">
                    <p className="text-[10.5px] text-muted-foreground">
                      {world
                        ? "Gerado agora"
                        : "Micro-mundo salvo neste tópico"}
                    </p>
                    <SandboxFrame world={(world ?? savedWorld)!} />
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SectionStudyPanel;
