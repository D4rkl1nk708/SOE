import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Sparkles, Target, TrendingDown, Clock, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const API_KEY_STORAGE = "soe_mentor_api_key";
const API_PROVIDER_STORAGE = "soe_mentor_provider";

export function RecommendationCard() {
  const [apiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) ?? "");
  const [provider] = useState<"claude" | "gemini" | "openai">(
    () => (localStorage.getItem(API_PROVIDER_STORAGE) as any) ?? "gemini"
  );

  const { data: rec, isLoading, error } = trpc.mentor.getMentorRecommendation.useQuery(
    { apiKey, provider },
    { 
      enabled: !!apiKey,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 60 * 24 // 24 hours
    }
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
    <div className={`soe-card p-6 relative overflow-hidden transition-all hover:scale-[1.01] border-2 ${
      isHighPriority ? "border-amber-500/30 bg-amber-500/[0.03]" : "border-primary/20 bg-primary/[0.02]"
    }`}>
      {/* Background Decor */}
      <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
        <Sparkles className="w-32 h-32" />
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
        <div className="space-y-3 flex-1">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${isHighPriority ? "bg-amber-500/20 text-amber-500" : "bg-primary/20 text-primary"}`}>
              <Target size={20} />
            </div>
            <h2 className="text-sm font-black uppercase tracking-widest opacity-70">Recomendação do Mentor</h2>
            {isHighPriority && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse">
                Urgente
              </Badge>
            )}
          </div>

          <div className="space-y-1">
            <h3 className="text-xl font-black tracking-tight">
              Hoje você deve focar em <span className={isHighPriority ? "text-amber-500" : "text-primary"}>{rec.disciplineName}</span>
            </h3>
            <p className="text-sm font-medium opacity-80 leading-relaxed max-w-2xl">
              {rec.reason}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-start md:items-end gap-3">
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/[0.05] border border-white/10">
            <Clock size={14} className="opacity-40" />
            <span className="text-xs font-bold uppercase tracking-tight">{rec.action}</span>
          </div>
          <button className={`w-full md:w-auto px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
            isHighPriority 
              ? "bg-amber-500 text-black hover:bg-amber-400" 
              : "bg-primary text-white hover:opacity-90 shadow-lg shadow-primary/20"
          }`}>
            Começar Agora
          </button>
        </div>
      </div>
    </div>
  );
}
