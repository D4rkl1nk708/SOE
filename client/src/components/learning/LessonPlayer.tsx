import { useEffect, useState } from "react";
import { Check, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import SandboxFrame from "./SandboxFrame";
import { cn } from "@/lib/utils";
import type { SavedLesson } from "@shared/topicLessons";

/**
 * Player da aula interativa.
 *
 * A animação roda no `SandboxFrame` (iframe `sandbox="allow-scripts"`, origem
 * opaca, sem rede). A barra do app fica acima: reiniciar, marcar como estudado,
 * gerar de novo e apagar. Trocar de aula troca a `key` do iframe — nenhum estado
 * da aula anterior vaza para a próxima.
 */
export function LessonPlayer({
  lesson,
  onRegenerate,
  onDelete,
  onMarkStudied,
  studiedToday = false,
  regenerating = false,
  marking = false,
}: {
  lesson: SavedLesson;
  onRegenerate?: () => void;
  onDelete?: () => void;
  onMarkStudied?: () => void;
  studiedToday?: boolean;
  regenerating?: boolean;
  marking?: boolean;
}) {
  const [restart, setRestart] = useState(0);
  const [justMarked, setJustMarked] = useState(false);

  // Aula nova = estado novo (o "marcado agora" não pode seguir para outra aula).
  useEffect(() => {
    setRestart(0);
    setJustMarked(false);
  }, [lesson.id]);

  const studied = studiedToday || justMarked;
  const headingId = `lesson-title-${lesson.id}`;

  return (
    <div
      data-testid="lesson-player"
      data-lesson-id={lesson.id}
      className="space-y-2.5"
    >
      <SandboxFrame
        world={{
          id: lesson.id,
          title: lesson.title,
          html: lesson.html,
          controls: [],
          challenges: [],
          limits: lesson.limits,
        }}
        kicker={`Aula interativa${
          lesson.disciplineName ? ` · ${lesson.disciplineName}` : ""
        } · sandbox sem rede`}
        frameKey={`${lesson.id}-${restart}`}
        height={520}
        actions={
          <>
            <button
              type="button"
              onClick={() => setRestart((value) => value + 1)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-secondary"
              aria-label="Reiniciar a animação"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Reiniciar</span>
            </button>
            {onMarkStudied && (
              <button
                type="button"
                onClick={() => {
                  setJustMarked(true);
                  onMarkStudied();
                }}
                disabled={marking || studied}
                aria-pressed={studied}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-70",
                  studied
                    ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-600"
                    : "border-border bg-background text-foreground/80 hover:bg-secondary",
                )}
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {studied ? "Estudado hoje" : "Marcar como estudado"}
                </span>
              </button>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <section aria-labelledby={headingId}>
          <h3
            id={headingId}
            className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60"
          >
            Passos da aula
          </h3>
          <ol className="mt-1 space-y-1 pl-4 text-[12px] leading-snug text-muted-foreground">
            {lesson.steps.map((step, index) => (
              <li key={`${lesson.id}-step-${index}`} className="list-decimal">
                <span className="font-medium text-foreground/80">
                  {step.title}:
                </span>{" "}
                {step.text}
              </li>
            ))}
          </ol>
        </section>
        <section className="space-y-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
            Como explorar
          </h3>
          <p className="text-[12px] leading-snug text-muted-foreground">
            {lesson.interaction}
          </p>
          <p className="text-[11.5px] leading-snug text-muted-foreground">
            Verificação: {lesson.question.prompt}
          </p>
        </section>
      </div>

      {(onRegenerate || onDelete) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
          {onRegenerate && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2 text-[11px]"
              disabled={regenerating}
              onClick={onRegenerate}
            >
              <Sparkles className="h-3 w-3" />
              Gerar de novo
            </Button>
          )}
          {onDelete && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" />
              Apagar esta aula
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default LessonPlayer;
