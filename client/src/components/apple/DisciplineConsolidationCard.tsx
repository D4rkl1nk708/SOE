import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Merge, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Pill, SectionLabel } from "@/components/apple";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

/**
 * Card "Consolidar duplicadas" (v6.9.7, item 7).
 *
 * Nunca automático: mostra origem → destino com tópicos e questões afetados e
 * só executa depois da confirmação com o resumo. A mescla em si é a
 * `discipline.consolidate`, que faz backup por grupo no servidor.
 */
export function DisciplineConsolidationCard({
  className,
  onConsolidated,
}: {
  className?: string;
  onConsolidated?: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: preview } = trpc.discipline.consolidationPreview.useQuery();
  const [confirming, setConfirming] = useState(false);

  const consolidate = trpc.discipline.consolidate.useMutation({
    onSuccess: (result) => {
      setConfirming(false);
      if (result.consolidated === 0) {
        toast.info("Nenhuma disciplina duplicada para consolidar.");
      } else {
        toast.success(
          `${result.sourcesAbsorbed} disciplina(s) somada(s) em ${result.disciplinesAfter} · ${result.questionsAfter} questões preservadas.`,
          {
            description:
              "Backup automático salvo em data/backups/mescla-disciplinas-*.json.",
          },
        );
      }
      utils.discipline.list.invalidate();
      utils.discipline.duplicates.invalidate();
      utils.discipline.consolidationPreview.invalidate();
      utils.topic.list.invalidate();
      onConsolidated?.();
    },
    onError: (error) =>
      toast.error(error.message || "Não foi possível consolidar agora."),
  });

  if (!preview || preview.groups.length === 0) return null;

  const grupos = preview.groups.length;
  const reduzidas = preview.disciplinesBefore - preview.disciplinesAfter;

  return (
    <Card className={cn("p-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel>Disciplinas duplicadas</SectionLabel>
          <p className="mt-1 text-[13px] font-medium text-foreground">
            Consolidar duplicadas ({grupos} grupo{grupos === 1 ? "" : "s"} ·{" "}
            {preview.disciplinesBefore} disciplinas → {preview.disciplinesAfter}
            )
          </p>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            {preview.questionsMoved} questões e {preview.totalTopics} tópico
            {preview.totalTopics === 1 ? "" : "s"} passam para a disciplina com
            mais questões.{" "}
            {reduzidas > 0
              ? `${reduzidas} disciplina${reduzidas === 1 ? "" : "s"} deixam de existir.`
              : "Nada é apagado além das duplicadas."}
          </p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-secondary text-muted-foreground">
          <Merge size={16} />
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {preview.groups.map((group) => (
          <div
            key={group.key}
            className="rounded-[10px] border border-border bg-secondary/30 px-3 py-2.5"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill tone="success">destino</Pill>
              <span className="min-w-0 truncate text-[12.5px] font-medium text-foreground">
                {group.targetName}
              </span>
              <span className="apple-num text-[11px] text-muted-foreground">
                {group.targetQuestions} questões
              </span>
            </div>
            <div className="mt-2 space-y-1">
              {group.sources.map((source) => (
                <div key={source.id} className="flex items-center gap-2">
                  <ArrowRight
                    size={12}
                    className="shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
                    {source.name}
                  </span>
                  <span className="apple-num shrink-0 text-[11px] text-muted-foreground">
                    {source.topics} tópico{source.topics === 1 ? "" : "s"} ·{" "}
                    {source.questions} q.
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {!confirming ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setConfirming(true)}
            className="h-9 rounded-[10px] px-4 text-[12px] font-semibold"
          >
            Consolidar
          </Button>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck size={12} /> backup automático antes de cada mescla
          </span>
        </div>
      ) : (
        <div className="mt-3 rounded-[10px] border border-[color-mix(in_srgb,var(--accent-amber)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent-amber)_8%,transparent)] px-3 py-2.5">
          <p className="text-[12px] leading-5 text-foreground">
            Confirmar consolidação de {grupos} grupo{grupos === 1 ? "" : "s"}?{" "}
            {reduzidas} disciplina{reduzidas === 1 ? "" : "s"} serão absorvida
            {reduzidas === 1 ? "" : "s"} e {preview.questionsMoved} questões
            somadas — revisões, tentativas, erros, flashcards e notas vão junto.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              onClick={() => consolidate.mutate()}
              disabled={consolidate.isPending}
              className="h-8 rounded-[9px] px-3 text-[11.5px] font-semibold"
            >
              {consolidate.isPending ? "Consolidando…" : "Confirmar"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={consolidate.isPending}
              className="h-8 rounded-[9px] px-3 text-[11.5px]"
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
