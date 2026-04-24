import { trpc } from "@/lib/trpc";
import { Radar, AlertTriangle, Sparkles, Brain, Lightbulb, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const API_KEY_STORAGE = "soe_mentor_api_key";
const API_PROVIDER_STORAGE = "soe_mentor_provider";

export function PlateauRadarWidget() {
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const { data: plateauedTopics, isLoading } = trpc.mentor.getPlateauedTopics.useQuery();
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
      const isExpired = err.message.toLowerCase().includes("expired") || err.message.toLowerCase().includes("key");
      toast.error(
        <div className="flex flex-col gap-2">
          <p>Falha ao gerar dossiê: {err.message}</p>
          {isExpired && (
            <Button 
              size="sm" 
              variant="outline" 
              className="mt-2 text-xs font-black uppercase tracking-widest border-rose-500/50 text-rose-500"
              onClick={() => window.location.hash = "#settings"}
            >
              Renovar Chave no Perfil
            </Button>
          )}
        </div>
      );
    }
  });

  if (isLoading || !plateauedTopics || plateauedTopics.length === 0) return null;

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
        provider
      });
    }
  };

  return (
    <div className="soe-card p-6 space-y-4 border-rose-500/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radar className="h-5 w-5 text-rose-500 animate-pulse" />
          <h2 className="text-lg font-black tracking-tight">Radar de Estagnação</h2>
        </div>
        <Badge variant="outline" className="bg-rose-500/10 text-rose-500 border-rose-500/20">
          {plateauedTopics.length} Platôs
        </Badge>
      </div>

      <p className="text-xs opacity-60 leading-relaxed">
        Tópicos com alta taxa de esforço (revisões/questões) mas com desempenho travado abaixo de 65%. A IA recomenda uma intervenção imediata.
      </p>

      <div className="grid gap-3">
        {plateauedTopics.slice(0, 3).map((t, i) => (
          <div 
            key={i} 
            className="group p-4 rounded-xl bg-rose-500/[0.02] border border-rose-500/10 hover:border-rose-500/30 transition-all cursor-pointer flex justify-between items-center"
            onClick={() => {
              setSelected(t);
              setDossier(null);
            }}
          >
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-rose-400/80">{t.disciplineName}</span>
              <p className="text-sm font-bold truncate mt-0.5">{t.topicName}</p>
            </div>
            <div className="flex flex-col items-end shrink-0 pl-4">
              <span className="text-lg font-black text-rose-500 tabular-nums">{t.accuracy}%</span>
              <span className="text-[9px] opacity-40 font-bold uppercase tracking-widest">{t.questionsResolved}q | {t.revisionCount} revs</span>
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
            <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
                <span className="text-lg font-black text-rose-500">{selected?.accuracy}%</span>
              </div>
              <div>
                <p className="text-sm font-bold leading-tight">Estagnação Detectada</p>
                <p className="text-xs opacity-60 mt-1">Você já fez {selected?.questionsResolved} questões e {selected?.revisionCount} revisões, mas o acerto não evolui. Continuar lendo as mesmas coisas não vai resolver.</p>
              </div>
            </div>

            {dossier ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
                {dossier.map((item: any, i: number) => (
                  <div key={i} className="p-5 rounded-2xl bg-[var(--app-bg)] border border-white/5 shadow-inner space-y-3 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                      {item.type === 'analogy' ? <Lightbulb className="w-16 h-16" /> : item.type === 'mnemonic' ? <Brain className="w-16 h-16" /> : <Sparkles className="w-16 h-16" />}
                    </div>
                    <div className="flex items-center gap-2 text-[var(--primary)] font-black text-xs uppercase tracking-widest">
                      {item.type === 'analogy' ? <Lightbulb size={14} /> : item.type === 'mnemonic' ? <Brain size={14} /> : <Sparkles size={14} />}
                      {item.title}
                    </div>
                    <p className="text-sm leading-relaxed opacity-90 relative z-10">{item.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 space-y-4 text-center">
                <div className="w-16 h-16 rounded-full bg-[var(--primary)]/10 flex items-center justify-center text-[var(--primary)] shadow-lg shadow-[var(--primary)]/20">
                  <Brain className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-lg">Solicitar Dossiê de Desbloqueio</p>
                  <p className="text-sm opacity-50 max-w-sm mx-auto">A IA vai gerar analogias absurdas, mnemônicos inusitados e desafios práticos para reprogramar seu entendimento sobre este assunto.</p>
                </div>
                <Button 
                  size="lg"
                  className="mt-4 gap-2 font-black uppercase tracking-widest shadow-xl shadow-[var(--primary-shadow)]"
                  onClick={handleGenerateDossier}
                  disabled={generateDossier.isPending}
                >
                  {generateDossier.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                  {generateDossier.isPending ? "Criando Dossiê..." : "Gerar Dossiê"}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
