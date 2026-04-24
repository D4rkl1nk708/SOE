import { useState, useEffect } from "react";
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
    error,
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
      <div className="soe-card p-6 border-primary/20 bg-primary/5">
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
      className={`soe-card p-6 relative overflow-hidden transition-all hover:scale-[1.005] border-2 group ${
        isHighPriority
          ? "border-amber-500/30 bg-amber-500/[0.03]"
          : "border-primary/20 bg-primary/[0.02]"
      }`}
    >
      {/* Background Decor */}
      <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none group-hover:scale-110 transition-transform duration-500">
        <Sparkles className="w-32 h-32" />
      </div>

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-8 relative z-10">
        <div className="space-y-4 flex-1">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${isHighPriority ? "bg-amber-500/20 text-amber-500" : "bg-primary/20 text-primary shadow-lg shadow-primary/10"}`}
            >
              <Target size={20} />
            </div>
            <div className="flex flex-col">
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">
                Recomendação do Mentor
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-primary/60">
                  {rec.contextTag}
                </span>
                {isHighPriority && (
                  <Badge
                    variant="outline"
                    className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[9px] h-4 font-black uppercase tracking-tighter animate-pulse"
                  >
                    Urgente
                  </Badge>
                )}
                {rec.plateauCount > 0 && (
                  <Badge
                    variant="outline"
                    className="bg-rose-500/10 text-rose-500 border-rose-500/20 text-[9px] h-4 font-black uppercase tracking-tighter"
                  >
                    {rec.plateauCount} Estagnados
                  </Badge>
                )}
                {rec.regressionCount > 0 && (
                  <Badge
                    variant="outline"
                    className="bg-orange-500/10 text-orange-500 border-orange-500/20 text-[9px] h-4 font-black uppercase tracking-tighter"
                  >
                    {rec.regressionCount} Regressões
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-2xl font-black tracking-tight leading-tight">
              Foco de Hoje:{" "}
              <span
                className={isHighPriority ? "text-amber-500" : "text-primary"}
              >
                {rec.disciplineName}
              </span>
            </h3>
            <div className="space-y-5">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-30">
                  Diagnóstico Crítico
                </p>
                <p className="text-sm font-bold opacity-90 border-l-2 border-primary/20 pl-3 py-0.5">
                  {rec.diagnostic}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-30">
                  Plano de Ação
                </p>
                <p className="text-sm opacity-80 leading-relaxed max-w-2xl bg-white/[0.03] p-3 rounded-xl border border-white/5">
                  {rec.actionPlan}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-rose-500/50">
                  Risco na Prova (Previsão)
                </p>
                <p className="text-[13px] font-medium text-rose-500/80 italic leading-relaxed">
                  "{rec.prediction}"
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-start md:items-end gap-4 shrink-0">
          <div className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/[0.04] border border-white/10 shadow-inner">
            <Clock size={16} className="opacity-40" />
            <span className="text-xs font-black uppercase tracking-widest opacity-60">
              Foco Imediato
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
