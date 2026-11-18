import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/PageShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  EyeOff,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
  Settings2,
  CalendarClock,
  Brain,
  Star,
} from "lucide-react";
import { format, isPast, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo, useState, useEffect } from "react";
import { RecallRatingDialog } from "@/components/RecallRatingDialog";
import { PreExamBanner } from "@/components/PreExamBanner";
import { SleepWarning } from "@/components/SleepWarning";
import { TeachYourselfMode } from "@/components/TeachYourselfMode";
import {
  DEFAULT_DAILY_REVIEW_CAP,
  prioritizeReviews,
} from "@shared/reviewQueue";

const PAGE_SIZE = 15;

// F04 - Star rating display for recall
function RecallStars({ rating }: { rating?: number }) {
  if (!rating) return null;
  const color =
    rating <= 2
      ? "var(--accent-red)"
      : rating === 3
        ? "#eab308"
        : "var(--accent-green)";
  return (
    <span
      title={`Dificuldade de evocação: ${rating}/5`}
      className="flex items-center gap-0.5"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className="h-3 w-3"
          style={{ fill: n <= rating ? color : "transparent", color }}
        />
      ))}
    </span>
  );
}

export default function Revisions() {
  const utils = trpc.useUtils();
  const { data: revisions, isLoading } = trpc.revision.list.useQuery();
  const { data: topicsData } = trpc.topic.list.useQuery();
  const { data: stats } = trpc.dashboard.getStats.useQuery();

  // Item 1 (v6.9.4): a fila mostra o top N e o resto fica em "Em espera".
  // Nada é apagado nem reagendado — a geração 25/50 não é tocada.
  const [waitingOpen, setWaitingOpen] = useState(false);
  const [capInput, setCapInput] = useState("");
  const [pages, setPages] = useState({
    scheduled: PAGE_SIZE,
    overdue: PAGE_SIZE,
    ignored: PAGE_SIZE,
    completed: PAGE_SIZE,
  });
  // F01/F04 - Recall rating dialog
  const [recallDialog, setRecallDialog] = useState<{
    open: boolean;
    revisionId: number;
    topicName: string;
  } | null>(null);
  // F11 - Teach yourself mode
  const [teachDialog, setTeachDialog] = useState<{
    open: boolean;
    topicName: string;
    disciplineName?: string;
  } | null>(null);

  const markCompleted = trpc.revision.markCompleted.useMutation({
    onMutate: async (vars) => {
      await utils.revision.list.cancel();
      const prevList = utils.revision.list.getData();
      if (prevList) {
        utils.revision.list.setData(undefined, (old) =>
          old
            ? old.map((r) =>
                r.id === vars.id ? { ...r, completed: vars.completed } : r,
              )
            : [],
        );
      }
      return { prevList, vars };
    },
    onError: (err, vars, ctx) => {
      if (ctx?.prevList) {
        utils.revision.list.setData(undefined, ctx.prevList);
      }
      toast.error("Erro ao atualizar status da revisão.");
    },
    onSuccess: (_, vars) => {
      utils.dashboard.getStats.invalidate();
      if (vars.completed) {
        const rev = enrichedRevisions.find((r) => r.id === vars.id);
        if (rev) {
          setRecallDialog({
            open: true,
            revisionId: vars.id,
            topicName: rev.topicName,
          });
          return;
        }
      }
      toast.success(
        vars.completed ? "Revisão concluída!" : "Revisão reaberta!",
      );
    },
    onSettled: () => {
      utils.revision.list.invalidate();
    },
  });

  const saveCap = trpc.v10.updateV10Settings.useMutation({
    onSuccess: () => {
      utils.dashboard.getStats.invalidate();
      toast.success("Limite diário da fila atualizado.");
    },
    onError: () => toast.error("Não foi possível salvar o limite."),
  });

  const markIgnored = trpc.revision.markIgnored.useMutation({
    onSuccess: () => {
      utils.revision.list.invalidate();
      toast.success("Revisão atualizada!");
    },
  });

  const enrichedRevisions = useMemo(() => {
    if (!revisions || !topicsData) return [];
    return revisions.map((rev) => {
      const topic = topicsData.topics.find((t) => t.id === rev.topicId);
      const discipline = topicsData.disciplines.find(
        (d) => d.id === topic?.disciplineId,
      );
      return {
        ...rev,
        topicName: topic?.name || "Tema desconhecido",
        disciplineName: discipline?.name || "Disciplina desconhecida",
        disciplineColor: discipline?.color || "#888888",
      };
    });
  }, [revisions, topicsData]);

  const groups = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    return {
      scheduled: enrichedRevisions.filter(
        (r) =>
          !r.completed &&
          !r.ignored &&
          (r.scheduledDate === today || !isPast(parseISO(r.scheduledDate))),
      ),
      overdue: enrichedRevisions.filter(
        (r) =>
          !r.completed &&
          !r.ignored &&
          isPast(parseISO(r.scheduledDate)) &&
          r.scheduledDate !== today,
      ),
      ignored: enrichedRevisions.filter((r) => r.ignored),
      completed: enrichedRevisions.filter((r) => r.completed),
    };
  }, [enrichedRevisions]);

  const dailyReviewCap = Number.isFinite(
    Number((stats?.settings as any)?.dailyReviewCap),
  )
    ? Number((stats?.settings as any)?.dailyReviewCap)
    : DEFAULT_DAILY_REVIEW_CAP;

  const queue = useMemo(() => {
    if (!enrichedRevisions.length) {
      return {
        queue: [] as typeof enrichedRevisions,
        waiting: [] as typeof enrichedRevisions,
        dueTotal: 0,
        cap: dailyReviewCap,
      };
    }
    const result = prioritizeReviews(
      enrichedRevisions,
      (topicsData?.topics || []) as any,
      (topicsData?.disciplines || []) as any,
      new Date(),
      dailyReviewCap,
    );
    return {
      queue: result.queue.map((item) => item.revision),
      waiting: result.waiting.map((item) => item.revision),
      dueTotal: result.dueTotal,
      cap: result.cap,
    };
  }, [enrichedRevisions, topicsData, dailyReviewCap]);

  useEffect(() => {
    setCapInput(String(dailyReviewCap));
  }, [dailyReviewCap]);

  // Auto infinite scroll when nearing bottom of page. Precisa ficar antes do
  // early return de loading; caso contrário o número de hooks muda entre o
  // primeiro render (loading) e o segundo (dados carregados).
  useEffect(() => {
    let frame = 0;
    const handleScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (
          window.innerHeight + window.scrollY <
          document.body.offsetHeight - 400
        ) {
          return;
        }
        setPages((prev) => {
          let changed = false;
          const next = { ...prev };
          (Object.keys(groups) as Array<keyof typeof groups>).forEach((tab) => {
            if (prev[tab] < groups[tab].length) {
              next[tab] = Math.min(prev[tab] + PAGE_SIZE, groups[tab].length);
              changed = true;
            }
          });
          return changed ? next : prev;
        });
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [groups]);

  if (isLoading)
    return <div className="p-8 text-center">Carregando revisões...</div>;

  const RevisionList = ({
    list,
    tab,
    emptyMessage,
    limit,
  }: {
    list: any[];
    tab: keyof typeof pages;
    emptyMessage: string;
    /** Quando definido, mostra exatamente esse recorte (sem "carregar mais"). */
    limit?: number;
  }) => {
    const visible =
      typeof limit === "number"
        ? list.slice(0, limit)
        : list.slice(0, pages[tab]);
    const hasMore =
      typeof limit === "number" ? false : list.length > pages[tab];

    return (
      <div className="space-y-3 mt-4">
        {list.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>{emptyMessage}</p>
          </div>
        ) : (
          <>
            {visible.map((rev) => (
              <Card
                key={rev.id}
                className={`transition-all hover:border-primary ${rev.completed ? "opacity-60 bg-muted/30" : "border-2 shadow-sm"}`}
              >
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <Checkbox
                      checked={rev.completed}
                      onCheckedChange={() =>
                        markCompleted.mutate({
                          id: rev.id,
                          completed: !rev.completed,
                        })
                      }
                      className="h-5 w-5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge
                          variant={
                            rev.type === "test" ? "secondary" : "default"
                          }
                          className="text-[10px] uppercase"
                        >
                          {rev.type === "test"
                            ? "Teste"
                            : `Revisão ${rev.revisionNumber}`}
                        </Badge>
                        <span
                          className="text-xs font-bold"
                          style={{ color: rev.disciplineColor }}
                        >
                          {rev.disciplineName}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {format(parseISO(rev.scheduledDate), "dd/MM/yyyy", {
                            locale: ptBR,
                          })}
                        </span>
                        {/* F04 - Show recall rating stars if rated */}
                        {(rev as any).recallRating && (
                          <RecallStars rating={(rev as any).recallRating} />
                        )}
                      </div>
                      <p
                        className={`font-bold truncate text-lg ${rev.completed ? "line-through text-muted-foreground" : "text-foreground"}`}
                      >
                        {rev.topicName}
                      </p>
                      {/* F04 - Rate button for completed unrated revisions */}
                      {rev.completed && !(rev as any).recallRating && (
                        <button
                          onClick={() =>
                            setRecallDialog({
                              open: true,
                              revisionId: rev.id,
                              topicName: rev.topicName,
                            })
                          }
                          className="text-xs mt-1 flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity"
                          style={{ color: "var(--primary)" }}
                        >
                          <Brain className="h-3 w-3" /> Avaliar dificuldade de
                          evocação
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {/* F11 - Teach yourself button */}
                    {!rev.completed && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-primary"
                        title="Ensinar para si mesmo"
                        onClick={() =>
                          setTeachDialog({
                            open: true,
                            topicName: rev.topicName,
                            disciplineName: rev.disciplineName,
                          })
                        }
                      >
                        <Brain className="h-5 w-5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-primary"
                      onClick={() =>
                        markIgnored.mutate({
                          id: rev.id,
                          ignored: !rev.ignored,
                        })
                      }
                    >
                      {rev.ignored ? (
                        <Eye className="h-5 w-5" />
                      ) : (
                        <EyeOff className="h-5 w-5" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {hasMore && (
              <div className="text-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPages((prev) => ({
                      ...prev,
                      [tab]: prev[tab] + PAGE_SIZE,
                    }))
                  }
                >
                  Carregar mais ({list.length - pages[tab]} restantes)
                </Button>
              </div>
            )}
            {!hasMore && list.length > PAGE_SIZE && (
              <div className="text-center pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setPages((prev) => ({ ...prev, [tab]: PAGE_SIZE }))
                  }
                >
                  Recolher lista
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <PageShell
      eyebrow="Retenção"
      title="Revisões"
      description="O que vence hoje, o que atrasou e o que já foi consolidado."
      metrics={[
        {
          label: "Hoje",
          value: groups.scheduled.filter(
            (r) => r.scheduledDate === format(new Date(), "yyyy-MM-dd"),
          ).length,
          icon: CalendarClock,
        },
        {
          label: "Atrasadas",
          value: groups.overdue.length,
          icon: AlertCircle,
          color: "var(--accent-red)",
        },
        {
          label: "Concluídas",
          value: groups.completed.length,
          icon: CheckCircle2,
          color: "var(--accent-green)",
        },
        {
          label: "Ignoradas",
          value: groups.ignored.length,
          icon: EyeOff,
          color: "var(--muted-foreground)",
        },
      ]}
      actions={
        <div className="flex items-center gap-2 text-sm">
          {groups.overdue.length > 0 ? (
            <span className="flex items-center gap-1.5 rounded-md bg-rose-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-rose-500">
              <AlertCircle className="h-3 w-3" />
              {groups.overdue.length} atrasadas
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-500">
              <CheckCircle2 className="h-3 w-3" />
              Em dia
            </span>
          )}
          <span className="text-[10px] font-semibold text-muted-foreground">
            {groups.scheduled.length} atividades
          </span>
        </div>
      }
    >
      {recallDialog && (
        <RecallRatingDialog
          open={recallDialog.open}
          onClose={() => setRecallDialog(null)}
          revisionId={recallDialog.revisionId}
          topicName={recallDialog.topicName}
        />
      )}
      {teachDialog && (
        <TeachYourselfMode
          open={teachDialog.open}
          onClose={() => setTeachDialog(null)}
          topicName={teachDialog.topicName}
          disciplineName={teachDialog.disciplineName}
        />
      )}
      <PreExamBanner />
      <SleepWarning />

      <section className="mb-2 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Fila do dia
            </h2>
            <span className="rounded bg-secondary/50 px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
              {queue.queue.length}
              {queue.waiting.length > 0 ? ` de ${queue.dueTotal}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="daily-review-cap"
              className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground"
            >
              Limite/dia
            </label>
            <Input
              id="daily-review-cap"
              type="number"
              min={0}
              max={500}
              value={capInput}
              onChange={(event) => setCapInput(event.target.value)}
              className="h-7 w-16 rounded-md text-center text-[11px]"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[9px] font-bold uppercase tracking-widest"
              disabled={
                saveCap.isPending || Number(capInput) === dailyReviewCap
              }
              onClick={() => {
                const next = Number(capInput);
                if (!Number.isFinite(next) || next < 0) {
                  toast.error(
                    "Informe um número a partir de 0 (0 = sem limite).",
                  );
                  return;
                }
                saveCap.mutate({ dailyReviewCap: Math.floor(next) });
              }}
            >
              Salvar
            </Button>
            <span className="text-[9px] text-muted-foreground">
              {dailyReviewCap === 0 ? "sem limite" : "0 = sem limite"}
            </span>
          </div>
        </div>

        {queue.dueTotal === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
            Nada vencendo agora. A fila se enche conforme as revisões vencem.
          </div>
        ) : (
          <RevisionList
            list={queue.queue}
            tab="scheduled"
            limit={queue.queue.length}
            emptyMessage="Nada vencendo agora."
          />
        )}

        {queue.waiting.length > 0 && (
          <div className="rounded-xl border border-border/70 bg-secondary/20">
            <button
              type="button"
              onClick={() => setWaitingOpen((open) => !open)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Em espera ({queue.waiting.length})
              </span>
              <span className="text-[10px] text-muted-foreground">
                {waitingOpen ? "Recolher" : "Ver revisões fora do topo"}
              </span>
            </button>
            {waitingOpen && (
              <div className="px-1 pb-2">
                <RevisionList
                  list={queue.waiting}
                  tab="overdue"
                  limit={queue.waiting.length}
                  emptyMessage="Nada em espera."
                />
              </div>
            )}
          </div>
        )}
      </section>

      <Tabs
        defaultValue="scheduled"
        className="w-full"
        onValueChange={() =>
          setPages({
            scheduled: PAGE_SIZE,
            overdue: PAGE_SIZE,
            ignored: PAGE_SIZE,
            completed: PAGE_SIZE,
          })
        }
      >
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto p-1 rounded-2xl bg-secondary/20 border border-border/70">
          <TabsTrigger
            value="scheduled"
            className="flex flex-col items-center gap-1.5 py-3 rounded-xl data-[state=active]:bg-[var(--primary)] data-[state=active]:text-[var(--primary-foreground)]"
          >
            <Clock className="h-3.5 w-3.5" />
            <span className="text-[9px] font-black uppercase tracking-widest">
              ({groups.scheduled.length})
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="overdue"
            className="flex flex-col items-center gap-1.5 py-3 rounded-xl data-[state=active]:bg-rose-500 data-[state=active]:text-white"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            <span className="text-[9px] font-black uppercase tracking-widest">
              ({groups.overdue.length})
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="ignored"
            className="flex flex-col items-center gap-1.5 py-3 rounded-xl data-[state=active]:bg-secondary/60"
          >
            <EyeOff className="h-3.5 w-3.5" />
            <span className="text-[9px] font-black uppercase tracking-widest">
              ({groups.ignored.length})
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="completed"
            className="flex flex-col items-center gap-1.5 py-3 rounded-xl data-[state=active]:bg-emerald-500 data-[state=active]:text-white"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="text-[9px] font-black uppercase tracking-widest">
              ({groups.completed.length})
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scheduled">
          <RevisionList
            list={groups.scheduled}
            tab="scheduled"
            emptyMessage="Nenhuma revisão programada para hoje ou futuro."
          />
        </TabsContent>
        <TabsContent value="overdue">
          <RevisionList
            list={groups.overdue}
            tab="overdue"
            emptyMessage="Parabéns! Você não tem revisões atrasadas."
          />
        </TabsContent>
        <TabsContent value="ignored">
          <RevisionList
            list={groups.ignored}
            tab="ignored"
            emptyMessage="Nenhuma revisão na lista de ignoradas."
          />
        </TabsContent>
        <TabsContent value="completed">
          <RevisionList
            list={groups.completed}
            tab="completed"
            emptyMessage="Você ainda não concluiu nenhuma revisão."
          />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
