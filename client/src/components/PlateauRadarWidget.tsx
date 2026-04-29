import { trpc } from "@/lib/trpc";
import {
  Radar,
  AlertTriangle,
  Sparkles,
  Brain,
  Lightbulb,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const API_KEY_STORAGE = "soe_mentor_api_key";
const API_PROVIDER_STORAGE = "soe_mentor_provider";

export function PlateauRadarWidget() {
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const { data: plateauedTopics, isLoading } =
    trpc.mentor.getPlateauedTopics.useQuery();
  const [selected, setSelected] = useState<any>(null);
  const [dossier, setDossier] = useState<any[] | null>(null);

  const settings = stats?.settings as any;
  const apiKey = settings?.aiApiKey || "";
  const provider = (settings?.aiProvider as any) || "gemini";

  const generateDossier = trpc.mentor.generateBreakthroughDossier.useMutation({
    onSuccess: (data) => {
      setDossier(data);
      toast.success("Dossiê de Desbloqueio gerado!");
    },
    onError: (err) => {
      const isExpired =
        err.message.toLowerCase().includes("expired") ||
        err.message.toLowerCase().includes("key");
      toast.error(
        <div className="flex flex-col gap-2">
          <p>Falha ao gerar dossiê: {err.message}</p>
          {isExpired && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2 text-xs font-black uppercase tracking-widest border-rose-500/50 text-rose-500"
              onClick={() => (window.location.hash = "#settings")}
            >
              Renovar Chave no Perfil
            </Button>
          )}
        </div>,
      );
    },
  });

  if (isLoading || !plateauedTopics || plateauedTopics.length === 0)
    return null;

  const handleGenerateDossier = () => {
    if (!apiKey) {
      toast.error("Configure sua API Key na aba Sistema (Perfil) primeiro!");
      window.location.hash = "#settings";
      return;
    }
    if (selected) {
      generateDossier.mutate({
        topicName: selected.topicName,
        disciplineName: selected.disciplineName,
        apiKey,
        provider,
      });
    }
  };

  return (
    <div className="soe-card p-6 space-y-4 border-rose-500/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radar className="h-5 w-5 text-rose-500" />
          <h2 className="text-lg font-black tracking-tight">
            Radar de Estagnação
          </h2>
        </div>
        <Badge
          variant="outline"
          className="bg-rose-500/10 text-rose-500 border-rose-500/20"
        >
          {plateauedTopics.length} Temas Travados
        </Badge>
      </div>

      <p className="text-xs opacity-60 leading-relaxed">
        Tópicos com alta taxa de esforço (revisões/questões) mas com desempenho
        travado abaixo de 65%. A IA recomenda uma intervenção imediata.
      </p>

      <div className="space-y-3">
        {plateauedTopics.slice(0, 3).map((t: any, i: any) => (
          <div
            key={i}
            className="group relative p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-rose-500/30 transition-all cursor-pointer overflow-hidden"
            onClick={() => {
              setSelected(t);
              setDossier(null);
            }}
          >
            <div className="flex justify-between items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-1 h-1 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50" />
                  <span className="text-[0.65rem] font-black uppercase tracking-widest opacity-40">
                    {t.disciplineName}
                  </span>
                </div>
                <p className="text-xs font-bold leading-tight group-hover:text-rose-400 transition-colors">
                  {t.topicName}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-lg font-black text-rose-500 tabular-nums leading-none">
                  {t.accuracy}%
                </span>
                <div className="text-[0.6rem] font-black uppercase tracking-tighter opacity-30 mt-1">
                  Acerto
                </div>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
              <div className="flex gap-2">
                <div className="px-2 py-0.5 rounded-md bg-white/5 text-[0.6rem] font-black uppercase tracking-widest opacity-40">
                  {t.questionsResolved} Questões
                </div>
                <div className="px-2 py-0.5 rounded-md bg-white/5 text-[0.6rem] font-black uppercase tracking-widest opacity-40">
                  {t.revisionCount} Revs
                </div>
              </div>
              <ChevronRight
                size={12}
                className="opacity-20 group-hover:opacity-100 group-hover:translate-x-1 transition-all"
              />
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
              Intervenção: {selected?.topicName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-2">
            <div className="flex items-center gap-5 p-6 rounded-[2rem] bg-rose-500/[0.03] border border-rose-500/10">
              <div className="w-16 h-16 rounded-[1.5rem] bg-rose-500/10 flex items-center justify-center shrink-0 border border-rose-500/20 shadow-lg shadow-rose-500/5">
                <span className="text-xl font-black text-rose-500">
                  {selected?.accuracy}%
                </span>
              </div>
              <div>
                <p className="text-sm font-black uppercase tracking-widest text-rose-500 mb-1">
                  Ponto de Estagnação
                </p>
                <p className="text-xs opacity-70 leading-relaxed">
                  Desempenho travado após{" "}
                  <strong>{selected?.questionsResolved} questões</strong> e{" "}
                  <strong>{selected?.revisionCount} revisões</strong>. Sua
                  abordagem atual não está convertendo conhecimento em acertos.
                  Uma intervenção tática é obrigatória.
                </p>
              </div>
            </div>

            {dossier ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
                {dossier.map((item: any, i: number) => (
                  <div
                    key={i}
                    className="p-5 rounded-2xl bg-[var(--app-bg)] border border-white/5 shadow-inner space-y-3 relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                      {item.type === "analogy" ? (
                        <Lightbulb className="w-16 h-16" />
                      ) : item.type === "mnemonic" ? (
                        <Brain className="w-16 h-16" />
                      ) : (
                        <Sparkles className="w-16 h-16" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[var(--primary)] font-black text-xs uppercase tracking-widest">
                      {item.type === "analogy" ? (
                        <Lightbulb size={14} />
                      ) : item.type === "mnemonic" ? (
                        <Brain size={14} />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      {item.title}
                    </div>
                    <p className="text-sm leading-relaxed opacity-90 relative z-10">
                      {item.content}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 space-y-6 text-center">
                <div className="w-20 h-20 rounded-[2rem] bg-[var(--primary)]/10 flex items-center justify-center text-[var(--primary)] shadow-2xl shadow-[var(--primary)]/10 border border-[var(--primary)]/20 transform rotate-12">
                  <Brain className="w-10 h-10" />
                </div>
                <div className="space-y-2">
                  <p className="font-black text-xl tracking-tight">
                    Solicitar Plano de Desbloqueio
                  </p>
                  <p className="text-sm opacity-50 max-w-sm mx-auto leading-relaxed">
                    A IA vai analisar o padrão dos seus erros e gerar um
                    **Dossiê Tático** com mnemônicos e novos ângulos de visão
                    para quebrar este teto de performance.
                  </p>
                </div>
                <Button
                  size="lg"
                  className="mt-4 gap-2 font-black uppercase tracking-widest shadow-xl shadow-[var(--primary-shadow)]"
                  onClick={handleGenerateDossier}
                  disabled={generateDossier.isPending}
                >
                  {generateDossier.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Sparkles className="w-5 h-5" />
                  )}
                  {generateDossier.isPending
                    ? "Criando Dossiê..."
                    : "Gerar Dossiê"}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
