import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { openTecBrowser } from "@/lib/openTecBrowser";
import { normalizeString } from "@shared/utils";

/**
 * Item 5 (v6.9.4): o edital é o que o usuário escolhe/importa — cada concurso
 * tem o seu. Este painel mostra a cobertura real (tópicos ligados, questões,
 * acerto, blocos sem questão), sugere vínculos por similaridade e permite
 * ajustar à mão. Nunca abre nada no TEC além da URL do caderno já sincronizado.
 */
export function EditalCoveragePanel() {
  const utils = trpc.useUtils();
  const { data: coverage, isLoading } = trpc.edital.coverage.useQuery();
  const { data: topicsData } = trpc.topic.list.useQuery();
  const [manualPick, setManualPick] = useState<Record<string, string>>({});

  const setActiveExam = trpc.edital.setActiveExam.useMutation({
    onSuccess: () => {
      utils.edital.coverage.invalidate();
      utils.dashboard.getStats.invalidate();
      toast.success("Concurso ativo atualizado.");
    },
    onError: (error) => toast.error(error.message),
  });

  const suggestLinks = trpc.edital.suggestLinks.useMutation({
    onSuccess: (result) => {
      utils.edital.coverage.invalidate();
      utils.dashboard.getStats.invalidate();
      toast.success(
        `${result.applied} linha(s) ligadas por similaridade de ${result.matched} sugestões.`,
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const linkRow = trpc.edital.linkRow.useMutation({
    onSuccess: () => {
      utils.edital.coverage.invalidate();
      toast.success("Vínculo atualizado.");
    },
    onError: (error) => toast.error(error.message),
  });

  const exams = coverage?.exams ?? [];
  const blocks = coverage?.blocks ?? [];
  const rows = useMemo(() => coverage?.rows ?? [], [coverage?.rows]);
  const cadernos = coverage?.cadernos ?? [];
  const totals = coverage?.totals;

  const unlinkedRows = useMemo(
    () =>
      rows
        .filter((row) => !row.isHeader && (row.topicIds?.length ?? 0) === 0)
        .slice(0, 8),
    [rows],
  );

  const topicsByDiscipline = useMemo(() => {
    const list = topicsData?.topics ?? [];
    return list.slice(0, 400);
  }, [topicsData]);

  const cadernoFor = (blockDiscipline: string) => {
    const key = normalizeString(blockDiscipline);
    return cadernos.find((caderno) => {
      const name = normalizeString(caderno.disciplina || "");
      if (!name || !key) return false;
      return name === key || name.includes(key) || key.includes(name);
    });
  };

  return (
    <section className="soe-card space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Cobertura do edital
          </h3>
          <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
            Cobertura real do edital do concurso ativo: linhas ligadas a
            tópicos, questões já respondidas e acerto.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Concurso ativo"
            value={coverage?.activeExamId ?? ""}
            onChange={(event) =>
              setActiveExam.mutate({ examId: event.target.value })
            }
            className="h-8 max-w-[240px] rounded-md border border-border bg-card px-2 text-[11px]"
          >
            {exams.length === 0 && <option value="">Nenhum concurso</option>}
            {exams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.name} · {exam.rows} linhas
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={suggestLinks.isPending || rows.length === 0}
            onClick={() => suggestLinks.mutate({ apply: true })}
            className="h-8 rounded-md bg-primary px-3 text-[9.5px] font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-40"
          >
            {suggestLinks.isPending ? "Sugerindo…" : "Sugerir vínculos"}
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-[11px] text-muted-foreground">
          Carregando cobertura…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Nenhuma linha de edital no concurso ativo. Importe o conteúdo
          programático acima ou escolha outro concurso.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-secondary/30 px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Linhas ligadas
              </p>
              <p className="text-[15px] font-semibold text-foreground">
                {totals?.rowsLinked ?? 0}/{totals?.rows ?? 0}
              </p>
            </div>
            <div className="rounded-lg bg-secondary/30 px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Cobertura
              </p>
              <p className="text-[15px] font-semibold text-foreground">
                {totals?.coveragePercent ?? 0}%
              </p>
            </div>
            <div className="rounded-lg bg-secondary/30 px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Questões
              </p>
              <p className="text-[15px] font-semibold text-foreground">
                {totals?.questions ?? 0}
              </p>
            </div>
            <div className="rounded-lg bg-secondary/30 px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Acerto
              </p>
              <p className="text-[15px] font-semibold text-foreground">
                {totals?.accuracy === null || totals?.accuracy === undefined
                  ? "—"
                  : `${totals.accuracy}%`}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {blocks.map((block) => {
              const caderno = cadernoFor(block.discipline);
              return (
                <div
                  key={block.discipline}
                  className="rounded-lg border border-border/70 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-[11.5px] font-semibold text-foreground">
                      {block.discipline}
                    </p>
                    <span className="text-[9.5px] text-muted-foreground">
                      {block.rowsLinked}/{block.rows} linhas ·{" "}
                      {block.linkedTopicIds.length} tópicos · {block.questions}{" "}
                      questões ·{" "}
                      {block.accuracy === null ? "—" : `${block.accuracy}%`}
                    </span>
                  </div>
                  {caderno && (
                    <button
                      type="button"
                      onClick={() =>
                        void openTecBrowser("", caderno.cadernoUrl)
                      }
                      className="mt-1 text-[9.5px] font-semibold text-primary hover:underline"
                    >
                      Abrir caderno no TEC ({caderno.topicsCount} tópicos)
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {(coverage?.emptyBlocks?.length ?? 0) > 0 && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[10px] leading-relaxed text-amber-700 dark:text-amber-400">
              <b>Blocos sem nenhuma questão:</b>{" "}
              {coverage?.emptyBlocks?.join(" · ")}
            </p>
          )}

          {unlinkedRows.length > 0 && (
            <div className="space-y-2">
              <p className="text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground">
                Linhas sem vínculo (
                {
                  rows.filter(
                    (row) => !row.isHeader && (row.topicIds?.length ?? 0) === 0,
                  ).length
                }
                )
              </p>
              {unlinkedRows.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/20 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10.5px] font-medium text-foreground">
                      {row.topic}
                    </p>
                    <p className="text-[9px] text-muted-foreground">
                      {row.discipline}
                    </p>
                  </div>
                  <select
                    aria-label={`Tópico para ${row.topic}`}
                    value={manualPick[row.id] ?? ""}
                    onChange={(event) =>
                      setManualPick((prev) => ({
                        ...prev,
                        [row.id]: event.target.value,
                      }))
                    }
                    className="h-7 max-w-[220px] rounded border border-border bg-card px-1.5 text-[10px]"
                  >
                    <option value="">Escolher tópico…</option>
                    {topicsByDiscipline.map((topic) => (
                      <option key={topic.id} value={topic.id}>
                        {topic.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!manualPick[row.id] || linkRow.isPending}
                    onClick={() =>
                      linkRow.mutate({
                        rowId: row.id,
                        topicIds: [Number(manualPick[row.id])],
                      })
                    }
                    className="h-7 rounded border border-border px-2 text-[9px] font-bold uppercase tracking-widest text-foreground disabled:opacity-40"
                  >
                    Ligar
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
