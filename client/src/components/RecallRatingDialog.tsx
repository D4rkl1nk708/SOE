/**
 * RecallRatingDialog - F01 (Free Recall) + F04 (Índice de Dificuldade de Evocação)
 *
 * Fundamentado em:
 * - Cap 5.7: quanto maior o esforço de evocação, maior a retenção (Bjork, Kang et al.)
 * - Cap 5.8: feedback pós-evocação melhora retenção em 494% (Pashler et al.)
 * - Modo free recall (questão aberta) é superior a múltipla escolha em esforço cognitivo
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Brain, ChevronRight } from "lucide-react";

interface RecallRatingDialogProps {
  open: boolean;
  onClose: () => void;
  revisionId: number;
  topicName: string;
  onDone?: () => void;
}

const RECALL_LABELS: Record<number, { label: string; desc: string; color: string }> = {
  1: { label: "Não lembrei nada", desc: "A informação não veio à mente", color: "var(--accent-red)" },
  2: { label: "Lembrei pouco", desc: "Só detalhes vagos, muitos erros", color: "#f97316" },
  3: { label: "Lembrei parcialmente", desc: "Lembrei o essencial com esforço", color: "#eab308" },
  4: { label: "Lembrei bem", desc: "Boa evocação, pequenas lacunas", color: "#84cc16" },
  5: { label: "Lembrei fácil", desc: "Veio imediato, sem esforço", color: "var(--accent-green)" },
};

export function RecallRatingDialog({ open, onClose, revisionId, topicName, onDone }: RecallRatingDialogProps) {
  const utils = trpc.useUtils();
  const [step, setStep] = useState<"recall" | "rating">("recall");
  const [freeRecallText, setFreeRecallText] = useState("");
  const [rating, setRating] = useState<number | null>(null);

  const saveRating = trpc.v10.saveRecallRating.useMutation({
    onSuccess: () => {
      utils.revision.list.invalidate();
      toast.success("Avaliação salva! Isso ajuda a calibrar suas próximas revisões.");
      setStep("recall");
      setFreeRecallText("");
      setRating(null);
      onDone?.();
      onClose();
    },
  });

  const handleSubmit = () => {
    if (!rating) return;
    saveRating.mutate({ revisionId, rating: rating as 1|2|3|4|5, freeRecallText: freeRecallText || undefined });
  };

  const handleSkip = () => {
    if (!rating) return;
    saveRating.mutate({ revisionId, rating: rating as 1|2|3|4|5 });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" style={{ color: "var(--primary)" }} />
            Revisão Ativa — {topicName}
          </DialogTitle>
          <DialogDescription>
            {step === "recall"
              ? "Antes de ver o gabarito: escreva tudo que você lembra desse tema. Quanto mais esforço você fizer agora, maior a retenção (Bjork et al.)."
              : "Quanto esforço você precisou para lembrar?"}
          </DialogDescription>
        </DialogHeader>

        {step === "recall" ? (
          <div className="space-y-4">
            <Textarea
              placeholder="Escreva livremente tudo que você consegue lembrar sobre esse tema... (não precisa ser perfeito)"
              value={freeRecallText}
              onChange={e => setFreeRecallText(e.target.value)}
              rows={6}
              className="resize-none"
            />
            <p className="text-xs" style={{ color: "var(--muted-text)" }}>
              Dica: mesmo que você não lembre muito, a <em>tentativa</em> de recordar fortalece a memória.
            </p>
            <Button className="w-full" onClick={() => setStep("rating")}>
              Avançar para avaliação <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
            <Button variant="ghost" className="w-full text-xs" onClick={() => setStep("rating")}>
              Pular escrita e só avaliar
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2">
              {[1, 2, 3, 4, 5].map(n => {
                const info = RECALL_LABELS[n];
                const selected = rating === n;
                return (
                  <button
                    key={n}
                    onClick={() => setRating(n)}
                    className="flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all"
                    style={{
                      borderColor: selected ? info.color : "var(--card-border)",
                      background: selected ? `color-mix(in srgb, ${info.color} 12%, transparent)` : "transparent",
                    }}
                  >
                    <span className="text-2xl font-black w-8 text-center" style={{ color: info.color }}>{n}</span>
                    <div>
                      <p className="font-semibold text-sm">{info.label}</p>
                      <p className="text-xs" style={{ color: "var(--muted-text)" }}>{info.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            {freeRecallText && (
              <div className="p-3 rounded-lg text-xs" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
                <p className="font-semibold mb-1" style={{ color: "var(--muted-text)" }}>Você escreveu:</p>
                <p style={{ color: "var(--app-fg)" }}>{freeRecallText}</p>
              </div>
            )}
          </div>
        )}

        {step === "rating" && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStep("recall")}>Voltar</Button>
            <Button
              onClick={handleSubmit}
              disabled={!rating || saveRating.isPending}
              style={{ background: rating ? RECALL_LABELS[rating]?.color : undefined }}
            >
              {saveRating.isPending ? "Salvando..." : "Salvar avaliação"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
