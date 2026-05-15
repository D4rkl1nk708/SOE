import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Sparkles,
  Target,
  TrendingDown,
  Clock,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const API_KEY_STORAGE = "soe_mentor_api_key";
const API_PROVIDER_STORAGE = "soe_mentor_provider";

export function RecommendationCard() {
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
      staleTime: 1000 * 60 * 60 * 24, // 24 hours
    },
  );

  if (!apiKey) return null;

  if (isLoading) {
    return (
      <div className="soe-card p-6 border-primary/10 bg-primary/5">
        <Skeleton className="h-6 w-48 mb-4" />
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (error || !rec) return null;

  const isHighPriority = rec.priority === "alta";

  return (
    <div
      className={`soe-card p-6 relative overflow-hidden transition-all border group ${
        isHighPriority
          ? "border-amber-500/30 bg-amber-500/[0.02]"
          : "border-border bg-card"
      }`}
    >
      {/* Background Decor */}
      <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none transition-transform duration-500">
        <Sparkles className="w-32 h-32" />
      </div>

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-8 relative z-10">
        <div className="space-y-5 flex-1">
          <div className="flex items-center gap-4">
            <div
              className={`p-2 rounded-lg ${isHighPriority ? "bg-amber-500/10 text-amber-500" : "bg-primary/10 text-primary"}`}
            >
              <Target size={18} />
            </div>
            <div className="flex flex-col flex-1">
              <div className="flex items-center justify-between">
                <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">
                  Recomendação do Mentor
                </h2>
                <button
                  onClick={() => refetch()}
                  disabled={isRefetching}
                  title="Recalcular Rota"
                  className={`p-1 hover:bg-secondary rounded-md transition-all ${isRefetching ? "animate-spin opacity-50" : "opacity-30 hover:opacity-100"}`}
                >
                  <Sparkles size={14} />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-bold text-primary/70">
                  {rec.contextTag}
                </span>
                {isHighPriority && (
                  <Badge
                    variant="outline"
                    className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[9px] h-4 font-bold uppercase tracking-wider px-1.5"
                  >
                    Urgente
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-bold tracking-tight text-foreground leading-tight">
              Foco de Hoje:{" "}
              <span
                className={isHighPriority ? "text-amber-500" : "text-primary"}
              >
                {rec.disciplineName}
              </span>
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground opacity-50 flex items-center gap-2">
                  <AlertCircle size={10} /> Diagnóstico Crítico
                </p>
                <div className="p-4 bg-secondary/30 rounded-md border border-border min-h-[4rem] flex items-center">
                  <p className="text-sm font-bold text-foreground/90 leading-relaxed">
                    {rec.diagnostic}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground opacity-50 flex items-center gap-2">
                  <TrendingDown size={10} /> Plano de Ação
                </p>
                <div className="bg-primary/5 p-4 rounded-md border border-primary/10 min-h-[4rem] flex items-center">
                  <p className="text-sm text-foreground/80 leading-relaxed font-semibold">
                    {rec.actionPlan}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-md bg-destructive/5 border border-destructive/10">
              <p className="text-[9px] font-bold uppercase tracking-wider text-destructive/50 mb-1">
                Risco na Prova (Previsão)
              </p>
              <p className="text-[11px] font-semibold text-destructive/80 italic leading-relaxed">
                "{rec.prediction}"
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-start md:items-end gap-3 shrink-0">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-secondary/30 border border-border">
            <Clock size={14} className="text-muted-foreground" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Foco Imediato
            </span>
          </div>

          {(rec.bankQuestionCount ?? 0) > 0 && (
            <button
              onClick={() => {
                window.location.href = `/lab?startElite=true&topicId=${rec.topicId}`;
              }}
              className="w-full md:w-auto h-10 px-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center gap-3 text-[10px] font-bold uppercase tracking-wider transition-all hover:bg-primary/90"
            >
              <Target size={14} />
              Treino de Elite ({rec.bankQuestionCount})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
