import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Brain,
  RotateCcw,
  Zap,
  Sparkles,
  Target,
  RefreshCw,
} from "lucide-react";

export function AiPostMortem({
  topic,
  accuracy,
  results,
}: {
  topic: any;
  accuracy: number;
  results: any[];
}) {
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const settings = stats?.settings as any;
  const apiKey =
    settings?.aiApiKey || localStorage.getItem("soe_mentor_api_key") || "";
  const provider = (settings?.aiProvider ||
    localStorage.getItem("soe_mentor_provider") ||
    "gemini") as any;

  const [postMortem, setPostMortem] = useState<any>(null);

  const analyzeMut = trpc.mentor.analyzeStudySession.useMutation({
    onSuccess: (data: any) => setPostMortem(data),
    onError: (err) => toast.error("Erro na análise: " + err.message),
  });

  const handleAnalyze = () => {
    if (!apiKey) {
      toast.error("Configure sua API Key no Perfil primeiro!");
      return;
    }
    analyzeMut.mutate({
      apiKey,
      provider,
      topicName: topic?.name || "Geral",
      disciplineName: "Disciplina",
      accuracy,
      results: results.map((r: any) => ({
        correct: r.correct,
        errorOrigin: r.errorOrigin,
      })),
      totalQuestions: results.length,
    });
  };

  if (postMortem) {
    const toneColors: Record<string, string> = {
      alerta: "border-amber-500/30 bg-amber-500/[0.03] text-amber-500",
      critico: "border-rose-500/30 bg-rose-500/[0.03] text-rose-500",
      incentivo: "border-emerald-500/30 bg-emerald-500/[0.03] text-emerald-500",
    };
    const color = toneColors[postMortem.tone] || toneColors.incentivo;

    return (
      <div
        className={`soe-card p-8 border-2 animate-in zoom-in-95 duration-500 relative overflow-hidden ${color}`}
      >
        <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
          <Sparkles className="w-40 h-40" />
        </div>
        <div className="relative z-10 space-y-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-white/10 shadow-inner">
              <Brain size={28} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">
                IA Post-Mortem
              </p>
              <h3 className="text-xl font-black">{postMortem.diagnosis}</h3>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-sm font-medium leading-relaxed opacity-90 border-l-2 border-current/20 pl-4 py-1">
              {postMortem.briefing}
            </p>

            {postMortem.analogy && (
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 italic text-sm">
                <span className="opacity-40 not-italic font-black text-[10px] uppercase block mb-1">
                  Analogia "Suja":
                </span>
                "{postMortem.analogy}"
              </div>
            )}

            <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
              <Target size={18} className="shrink-0" />
              <p className="text-xs font-bold">
                <span className="opacity-40 uppercase tracking-widest mr-2">
                  Próximo Passo:
                </span>
                {postMortem.nextStep}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="soe-card p-10 border-dashed border-white/10 flex flex-col items-center text-center space-y-6">
      <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-[var(--primary)] shadow-lg shadow-white/5">
        <Sparkles
          size={32}
          className={analyzeMut.isPending ? "animate-pulse" : ""}
        />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-black tracking-tight">
          Análise Estratégica com IA
        </h3>
        <p className="text-xs opacity-40 max-w-sm mx-auto leading-relaxed font-medium">
          O Mentor pode analisar o padrão dos seus erros nesta sessão e gerar um
          dossiê tático para desbloquear seu desempenho.
        </p>
      </div>
      <button
        onClick={handleAnalyze}
        disabled={analyzeMut.isPending}
        className="px-8 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-white/10 active:scale-95 transition-all flex items-center gap-3"
      >
        {analyzeMut.isPending ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" /> Analisando...
          </>
        ) : (
          <>
            <Zap className="w-4 h-4 text-amber-400" /> Gerar Post-Mortem
          </>
        )}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
