import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Sparkles,
  Target,
  TrendingDown,
  Clock,
  AlertCircle,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const API_KEY_STORAGE = "soe_mentor_api_key";
const API_PROVIDER_STORAGE = "soe_mentor_provider";

export function RecommendationCard() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const settings = stats?.settings as any;

  const apiKey =
    settings?.aiApiKey || localStorage.getItem(API_KEY_STORAGE) || "";
  const provider = (settings?.aiProvider ||
    localStorage.getItem(API_PROVIDER_STORAGE) ||
    "gemini") as "claude" | "gemini" | "openai";

  const {
    data: rec,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = trpc.mentor.getMentorRecommendation.useQuery(
    { apiKey, provider },
    {
      enabled: !!apiKey,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 60 * 24,
    },
  );

  useEffect(() => {
    if (!rec) return;
    try {
      const key = `soe_mentor_popup_${new Date().toISOString().slice(0, 10)}`;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
      setOpen(true);
    } catch {}
  }, [rec]);

  if (!apiKey) return null;
  if (isLoading) {
    return (
      <div className="soe-card p-4">
        <Skeleton className="mb-2 h-4 w-40" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    );
  }
  if (error || !rec) return null;

  const isHighPriority = rec.priority === "alta";
  const followRecommendation = () => {
    setOpen(false);
    sessionStorage.setItem(
      "soe_guided_block",
      JSON.stringify({
        id: `mentor-${rec.topicId || rec.disciplineId || "focus"}`,
        kind: "estudo",
        title: (rec as any).topicName || rec.disciplineName,
        subtitle: rec.disciplineName,
        reason: rec.diagnostic,
        minutes: 25,
        topicId: rec.topicId,
        topicName: (rec as any).topicName,
        disciplineId: rec.disciplineId,
        disciplineName: rec.disciplineName,
        lens: "edital",
      }),
    );
    navigate("/guided");
  };

  const askMentor = () => {
    sessionStorage.setItem(
      "soe_mentor_prefill",
      `Me explique o foco de hoje: ${rec.disciplineName}${(rec as any).topicName ? ` — ${(rec as any).topicName}` : ""}. ` +
        `Diagnóstico: ${rec.diagnostic}. O que exatamente eu preciso entender e praticar agora?`,
    );
    setOpen(false);
    navigate("/mentor");
  };

  return (
    <>
      <div className="soe-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={`mt-0.5 rounded-md p-1.5 ${isHighPriority ? "bg-amber-500/10 text-amber-500" : "bg-primary/10 text-primary"}`}
          >
            <Sparkles size={14} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Mentor de hoje
              </p>
              {isHighPriority && (
                <Badge
                  variant="outline"
                  className="h-4 border-amber-500/20 bg-amber-500/10 px-1.5 text-[8px] font-bold uppercase text-amber-500"
                >
                  Urgente
                </Badge>
              )}
            </div>
            <p className="truncate text-sm font-semibold">
              {rec.disciplineName}
              {(rec as any).topicName ? ` · ${(rec as any).topicName}` : ""}
            </p>
            <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">
              {rec.diagnostic}
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-[10px]"
            onClick={() => refetch()}
            disabled={isRefetching}
            title="Recalcular orientação"
          >
            {isRefetching ? "..." : "Recalcular"}
          </Button>
          <Button
            size="sm"
            className="h-8 text-[10px]"
            onClick={() => setOpen(true)}
          >
            Abrir orientação
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-lg border-border bg-card p-0">
          <DialogHeader className="border-b border-border p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <DialogTitle className="text-lg font-semibold">
                Orientação do mentor
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              {rec.contextTag} · Foco em {rec.disciplineName}
              {(rec as any).topicName ? ` — ${(rec as any).topicName}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 p-5">
            <div className="rounded-md border border-border bg-secondary/20 p-4">
              <p className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                <AlertCircle size={11} /> Diagnóstico
              </p>
              <p className="text-sm leading-relaxed text-foreground/90">
                {rec.diagnostic}
              </p>
            </div>

            <div className="rounded-md border border-primary/15 bg-primary/5 p-4">
              <p className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                <TrendingDown size={11} /> Plano de ação
              </p>
              <p className="text-sm leading-relaxed text-foreground/90">
                {rec.actionPlan}
              </p>
            </div>

            <div className="rounded-md border border-destructive/15 bg-destructive/5 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-destructive/70">
                <Clock size={11} /> Risco se não fizer agora
              </p>
              <p className="text-xs italic leading-relaxed text-destructive/80">
                “{rec.prediction}”
              </p>
            </div>

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Fechar
              </Button>
              <Button variant="outline" onClick={askMentor}>
                <Sparkles className="mr-2 h-3.5 w-3.5" /> Me explique com IA
              </Button>
              <Button onClick={followRecommendation}>
                <Target className="mr-2 h-3.5 w-3.5" /> Seguir recomendação
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
