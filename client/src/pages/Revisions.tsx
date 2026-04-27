import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
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
import { useMemo, useState } from "react";
import { RecallRatingDialog } from "@/components/RecallRatingDialog";
import { PreExamBanner } from "@/components/PreExamBanner";
import { SleepWarning } from "@/components/SleepWarning";
import { TeachYourselfMode } from "@/components/TeachYourselfMode";

const PAGE_SIZE = 5;

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
      {[1, 2, 3, 4, 5].map((n: any) => (
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
    onSuccess: (_, vars) => {
      utils.revision.list.invalidate();
      utils.dashboard.getStats.invalidate();
      // F01/F04: open recall rating dialog when completing (not uncompleting)
      if (vars.completed) {
        const rev = enrichedRevisions.find((r: any) => r.id === vars.id);
        if (rev) {
          setRecallDialog({
            open: true,
            revisionId: vars.id,
            topicName: rev.topicName,
          });
          return; // toast shown after rating
        }
      }
      toast.success("Status atualizado!");
    },
  });

  const markIgnored = trpc.revision.markIgnored.useMutation({
    onSuccess: () => {
      utils.revision.list.invalidate();
      toast.success("Revisão atualizada!");
    },
  });

  const enrichedRevisions = useMemo(() => {
    if (!revisions || !topicsData) return [];
    return revisions.map((rev: any) => {
      const topic = topicsData.topics.find((t: any) => t.id === rev.topicId);
      const discipline = topicsData.disciplines.find(
        (d: any) => d.id === topic?.disciplineId,
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
        (r: any) =>
          !r.completed &&
          !r.ignored &&
          (r.scheduledDate === today || !isPast(parseISO(r.scheduledDate))),
      ),
      overdue: enrichedRevisions.filter(
        (r: any) =>
          !r.completed &&
          !r.ignored &&
          isPast(parseISO(r.scheduledDate)) &&
          r.scheduledDate !== today,
      ),
      ignored: enrichedRevisions.filter((r: any) => r.ignored),
      completed: enrichedRevisions.filter((r: any) => r.completed),
    };
  }, [enrichedRevisions]);

  if (isLoading)
    return <div className="p-8 text-center">Carregando revisões...</div>;

  const RevisionList = ({
    list,
    tab,
    emptyMessage,
  }: {
    list: any[];
    tab: keyof typeof pages;
    emptyMessage: string;
  }) => {
    const visible = list.slice(0, pages[tab]);
    const hasMore = list.length > pages[tab];

    return (
      <div className="space-y-3 mt-4">
        {list.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>{emptyMessage}</p>
          </div>
        ) : (
          <>
            {visible.map((rev: any) => (
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
    <div className="space-y-5">
      {/* F01/F04 - Recall rating dialog */}
      {recallDialog && (
        <RecallRatingDialog
          open={recallDialog.open}
          onClose={() => setRecallDialog(null)}
          revisionId={recallDialog.revisionId}
          topicName={recallDialog.topicName}
        />
      )}

      {/* F11 - Teach yourself dialog */}
      {teachDialog && (
        <TeachYourselfMode
          open={teachDialog.open}
          onClose={() => setTeachDialog(null)}
          topicName={teachDialog.topicName}
          disciplineName={teachDialog.disciplineName}
        />
      )}

      {/* F16 - Pre-exam banner */}
      <PreExamBanner />
      {/* F15 - Sleep warning */}
      <SleepWarning />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1
            className="text-3xl font-black tracking-tight flex items-center gap-2.5"
            style={{ color: "var(--app-fg)" }}
          >
            <CheckCircle2 className="h-7 w-7 text-[var(--primary)]" />
            Revisões
          </h1>
          <div className="flex items-center gap-2 text-sm">
            {groups.overdue.length > 0 ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-500 font-black uppercase tracking-widest text-[10px]">
                <AlertCircle className="w-3 h-3" />
                {groups.overdue.length} Atrasadas
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 font-black uppercase tracking-widest text-[10px]">
                <CheckCircle2 className="w-3 h-3" />
                Em dia
              </span>
            )}
            <span className="opacity-40 font-bold">
              {groups.scheduled.length} Atividades
            </span>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: "Hoje",
            count: groups.scheduled.filter(
              (r: any) => r.scheduledDate === format(new Date(), "yyyy-MM-dd"),
            ).length,
            color: "var(--primary)",
            icon: CalendarClock,
          },
          {
            label: "Atrasadas",
            count: groups.overdue.length,
            color: "var(--accent-red, #dc2626)",
            icon: AlertCircle,
          },
          {
            label: "Concluídas",
            count: groups.completed.length,
            color: "var(--accent-green)",
            icon: CheckCircle2,
          },
          {
            label: "Ignoradas",
            count: groups.ignored.length,
            color: "var(--muted-text)",
            icon: EyeOff,
          },
        ].map((item: any) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="soe-stat-card flex items-center gap-3"
            >
              <Icon
                className="w-6 h-6 flex-shrink-0"
                style={{ color: item.color }}
              />
              <div>
                <div
                  className="text-xl font-black"
                  style={{ color: item.color }}
                >
                  {item.count}
                </div>
                <div
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--muted-text)" }}
                >
                  {item.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

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
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto p-1 rounded-2xl bg-white/[0.02] border border-white/5">
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
            className="flex flex-col items-center gap-1.5 py-3 rounded-xl data-[state=active]:bg-white/10"
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
    </div>
  );
}
