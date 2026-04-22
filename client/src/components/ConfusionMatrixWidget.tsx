import { trpc } from "@/lib/trpc";
import { Brain, AlertCircle, ChevronRight, HelpCircle, Sparkles, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

const API_KEY_STORAGE = "soe_mentor_api_key";
const API_PROVIDER_STORAGE = "soe_mentor_provider";

export function ConfusionMatrixWidget() {
  const { data: confusions, isLoading } = trpc.mentor.getConceptConfusions.useQuery();
  const [selected, setSelected] = useState<any>(null);
  const [mnemonic, setMnemonic] = useState<{ text: string; explanation: string } | null>(null);

  const [apiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) ?? "");
  const [provider] = useState<"claude" | "gemini" | "openai">(
    () => (localStorage.getItem(API_PROVIDER_STORAGE) as any) ?? "gemini"
  );

  const generateMnemonic = trpc.mentor.generateMnemonicForConfusion.useMutation({
    onSuccess: (data) => {
      setMnemonic({ text: data.mnemonic, explanation: data.explanation });
      toast.success("Mnemônico gerado com sucesso!");
    },
    onError: (err) => {
      toast.error("Falha ao gerar mnemônico: " + err.message);
    }
  });

  if (isLoading || !confusions || confusions.length === 0) return null;

  const handleGenerateMnemonic = () => {
    if (!apiKey) {
      toast.error("Configure sua API Key no Briefing da IA primeiro!");
      return;
    }
    if (selected) {
      generateMnemonic.mutate({
        conceptA: selected.conceptA,
        conceptB: selected.conceptB,
        explanation: selected.explanation,
        apiKey,
        provider
      });
    }
  };

  return (
    <div className="soe-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-purple-500" />
          <h2 className="text-lg font-black tracking-tight">Matriz de Confusão</h2>
        </div>
        <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/20">
          {confusions.length} Ponto(s) Cego(s)
        </Badge>
      </div>

      <p className="text-xs opacity-60">
        Conceitos que o Mentor identificou que você costuma trocar ou confundir:
      </p>

      <div className="grid gap-3">
        {confusions.slice(0, 3).map((c, i) => (
          <div 
            key={i} 
            className="group p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:border-purple-500/30 transition-all cursor-pointer"
            onClick={() => {
              setSelected(c);
              setMnemonic(null);
            }}
          >
            <div className="flex justify-between items-start mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-40">{c.discipline || "Geral"}</span>
              <span className="text-[10px] font-bold text-purple-500 bg-purple-500/10 px-2 py-0.5 rounded-full">
                {c.count}x detectado
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center justify-center gap-2 font-bold text-sm">
                <span className="text-red-400/80">{c.conceptA}</span>
                <span className="opacity-20">vs</span>
                <span className="text-blue-400/80">{c.conceptB}</span>
              </div>
              <ChevronRight className="h-4 w-4 opacity-20 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        ))}
      </div>

      {confusions.length > 3 && (
        <Button variant="ghost" className="w-full text-xs opacity-50 hover:opacity-100">
          Ver todos os pontos cegos
        </Button>
      )}

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-purple-500" />
              Diferença: {selected?.conceptA} vs {selected?.conceptB}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/10 text-sm leading-relaxed whitespace-pre-wrap">
              {selected?.explanation || "Aguardando diagnóstico detalhado do Mentor..."}
            </div>

            {mnemonic && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2 animate-in fade-in slide-in-from-top-4">
                <div className="flex items-center gap-2 text-amber-500 font-black text-xs uppercase tracking-widest">
                  <Sparkles size={14} />
                  Mnemônico Premium
                </div>
                <div className="text-lg font-black text-amber-200">
                  {mnemonic.text}
                </div>
                <div className="text-xs opacity-70 italic">
                  {mnemonic.explanation}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-4 border-t border-white/5">
              <Button 
                variant="outline" 
                className="gap-2"
                onClick={handleGenerateMnemonic}
                disabled={generateMnemonic.isPending}
              >
                {generateMnemonic.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 text-amber-500" />
                )}
                {mnemonic ? "Gerar outro" : "Criar Mnemônico"}
              </Button>
              <Button className="bg-purple-600 hover:bg-purple-700">Refazer questões</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
