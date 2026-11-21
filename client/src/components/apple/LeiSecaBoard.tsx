import { useState } from "react";
import { toast } from "sonner";
import {
  BookOpenCheck,
  Edit2,
  Layers,
  Play,
  Trash2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Pill, SectionLabel } from "@/components/apple";
import { formatPlainTextHtml } from "@/lib/sanitize";
import { trpc } from "@/lib/trpc";

/**
 * Aba "Lei seca" (v6.9.7, item 3).
 *
 * O deck é montado do material do próprio aluno (erros do caderno + notas do
 * tópico). Cada cartão mostra de onde veio — tópico e número do erro — e pode
 * ser editado ou apagado. Sem material, o empty state explica como gerar.
 */
export function LeiSecaBoard({
  onReview,
  onEdit,
  tabs,
}: {
  onReview: (cards: any[]) => void;
  onEdit: (card: any) => void;
  tabs?: React.ReactNode;
}) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.flashcard.leiSecaToday.useQuery();
  const { data: topicsData } = trpc.topic.list.useQuery();
  const { data: disciplines = [] } = trpc.discipline.list.useQuery();
  const [showGuide, setShowGuide] = useState(false);

  const build = trpc.flashcard.buildLeiSeca.useMutation({
    onSuccess: (result) => {
      utils.flashcard.list.invalidate();
      utils.flashcard.leiSecaToday.invalidate();
      if (result.created > 0) {
        toast.success(`${result.created} cartão(ões) montados da sua base`, {
          description: `${result.skipped} já existiam ou estão sem origem.`,
        });
      } else if (result.candidates.length === 0) {
        setShowGuide(true);
        toast.info("Ainda não há ponto cego com material para virar cartão.");
      } else {
        toast.info("Seus cartões de lei seca já estão montados.");
      }
    },
    onError: (error) =>
      toast.error(error.message || "Não foi possível montar os cartões."),
  });

  const remove = trpc.flashcard.delete.useMutation({
    onSuccess: () => {
      utils.flashcard.list.invalidate();
      utils.flashcard.leiSecaToday.invalidate();
    },
  });

  const topics = (topicsData?.topics || []) as any[];
  const topicName = (topicId?: number | null) =>
    topics.find((topic) => topic.id === topicId)?.name ||
    "Tópico não encontrado";
  const disciplineName = (disciplineId: number) =>
    (disciplines as any[]).find((item) => item.id === disciplineId)?.name ||
    "Disciplina";

  const cards = (data?.cards || []) as any[];
  const total = data?.total ?? 0;
  const dueToday = data?.dueToday ?? 0;
  const candidates = (data?.candidates || []) as any[];

  if (isLoading) {
    return (
      <div className="p-8 text-center text-[12px] uppercase tracking-widest text-muted-foreground">
        Lendo o deck…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tabs}

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <SectionLabel>Lei seca</SectionLabel>
            <p className="mt-1 text-[13px] font-medium text-foreground">
              {dueToday} cartão(ões) hoje · {cards.length} para revisar
            </p>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
              {total === 0
                ? "Deck vazio: ele é montado do que você já errou ou anotou."
                : `${total} cartão(ões) no deck · meta ${data?.cap ?? 15} por dia.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => build.mutate({})}
              disabled={build.isPending}
              className="h-9 rounded-[10px] px-3 text-[11.5px] font-semibold"
            >
              <Wand2 size={13} className="mr-1.5" />
              {build.isPending ? "Montando…" : "Montar da minha base"}
            </Button>
            <Button
              onClick={() => onReview(cards)}
              disabled={cards.length === 0}
              className="h-9 rounded-[10px] px-3 text-[11.5px] font-semibold"
            >
              <Play size={13} className="mr-1.5" /> Estudar hoje
            </Button>
          </div>
        </div>

        {candidates.length > 0 && (
          <div className="mt-3 rounded-[10px] border border-border bg-secondary/30 px-3 py-2">
            <p className="text-[11px] font-medium text-foreground">
              Pontos cegos de literalidade detectados
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {candidates.slice(0, 6).map((candidate) => (
                <Pill key={candidate.topicId} tone="warn">
                  {candidate.topicName} · {candidate.accuracy}%
                </Pill>
              ))}
            </div>
          </div>
        )}
      </Card>

      {cards.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhum cartão de lei seca ainda"
            description="O deck usa apenas o SEU material: erros com resolução no Caderno de Erros e notas escritas no tópico. Responda questões no TEC (ou escreva notas) e toque em “Montar da minha base”."
            action={
              <Button
                variant="outline"
                onClick={() => build.mutate({})}
                disabled={build.isPending}
                className="h-9 rounded-[10px] px-3 text-[11.5px]"
              >
                <BookOpenCheck size={13} className="mr-1.5" /> Montar da minha
                base
              </Button>
            }
          />
          {showGuide && (
            <p className="px-6 pb-5 text-center text-[11.5px] text-muted-foreground">
              Nenhum tópico passou do limiar (10+ questões com menos de 60% de
              acerto) e nenhum erro tem enunciado + resolução salvos.
            </p>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {cards.map((card) => (
            <Card key={card.id} className="p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-wrap gap-1.5">
                  <Pill tone="primary">
                    {disciplineName(card.disciplineId)}
                  </Pill>
                  <Pill>{topicName(card.topicId)}</Pill>
                  {card.sourceErrorId ? (
                    <Pill tone="warn">questão #{card.sourceErrorId}</Pill>
                  ) : (
                    <Pill tone="neutral">
                      {card.noteId ? `nota #${card.noteId}` : "nota do tópico"}
                    </Pill>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => onEdit(card)}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                    aria-label="Editar cartão"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Apagar este cartão de lei seca?"))
                        remove.mutate({ id: card.id });
                    }}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-[var(--accent-red)]"
                    aria-label="Apagar cartão"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              <p
                className="mt-2 line-clamp-3 text-[12.5px] font-medium leading-5 text-foreground"
                dangerouslySetInnerHTML={{
                  __html: formatPlainTextHtml(card.front),
                }}
              />
              <p
                className="mt-1 line-clamp-3 text-[11.5px] leading-5 text-muted-foreground"
                dangerouslySetInnerHTML={{
                  __html: formatPlainTextHtml(card.back),
                }}
              />
              <div className="mt-2 flex items-center gap-1.5 text-[10.5px] uppercase tracking-widest text-muted-foreground/70">
                <Layers size={10} />
                {card.repetitions} evocações · próxima {card.nextReviewDate}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
