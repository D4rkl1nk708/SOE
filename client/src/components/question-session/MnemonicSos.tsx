import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Brain, RefreshCw, Zap } from "lucide-react";

export function MnemonicSos({ topicId }: { topicId: number | null }) {
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const settings = stats?.settings as any;
  const apiKey =
    settings?.aiApiKey || localStorage.getItem("soe_mentor_api_key") || "";
  const provider = (settings?.aiProvider ||
    localStorage.getItem("soe_mentor_provider") ||
    "gemini") as any;

  const [result, setResult] = useState<any>(null);

  const genMut = trpc.mentor.generateMnemonicForConfusion.useMutation({
    onSuccess: (data: any) => setResult(data),
    onError: (err) => toast.error("Falha ao gerar mnemônico: " + err.message),
  });

  const handleGenerate = () => {
    if (!apiKey) {
      toast.error("Configure sua API Key no Perfil!");
      return;
    }
    const topicName =
      stats?.disciplineStats
        ?.flatMap((d) => d.topics || [])
        .find((t) => t.id === topicId)?.name || "Assunto";
    genMut.mutate({
      apiKey,
      provider,
      conceptA: topicName,
      conceptB: "o que eu acabei de errar",
      explanation:
        "O aluno errou uma questão sobre este tema e precisa de uma analogia suja ou mnemônico bizarro para fixar.",
    });
  };

  if (result) {
    return (
      <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 space-y-3 animate-in slide-in-from-top-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
            <Brain size={12} /> Mnemônico & Analogia
          </div>
          <button
            onClick={() => setResult(null)}
            className="text-[9px] opacity-40 uppercase font-black hover:opacity-100"
          >
            Fechar
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <span className="text-[8px] font-black uppercase opacity-40">
              Mnemônico
            </span>
            <p className="text-sm font-bold leading-relaxed">
              {result.mnemonic}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-[8px] font-black uppercase opacity-40">
              Analogia "Suja"
            </span>
            <p className="text-sm font-medium italic leading-relaxed opacity-80">
              "{result.analogy}"
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleGenerate}
      disabled={genMut.isPending}
      className="w-full py-3 rounded-xl border border-dashed border-rose-500/30 hover:bg-rose-500/10 transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-rose-400"
    >
      {genMut.isPending ? (
        <RefreshCw className="w-3 h-3 animate-spin" />
      ) : (
        <Zap className="w-3 h-3" />
      )}
      {genMut.isPending ? "Criando Mnemônico..." : "Gerar Mnemônico SOS"}
    </button>
  );
}
