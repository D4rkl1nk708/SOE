import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Trophy,
  BarChart2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function MinedResolutionPanel({
  onClose,
  topicId,
}: {
  onClose: () => void;
  topicId?: number;
}) {
  const { data: questions, isLoading } =
    trpc.lab.getIntegratedQuestions.useQuery({ topicId });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAlt, setSelectedAlt] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [answers, setAnswers] = useState<
    Record<number, { selected: string; correct: boolean }>
  >({});

  const currentQ = questions?.[currentIndex];
  const registerResponse = trpc.lab.registerIntegratedResponse.useMutation();

  const handleRespond = async () => {
    if (!selectedAlt || !currentQ) return;
    const isCorrect = selectedAlt === currentQ.correctAnswer;

    if (topicId) {
      registerResponse.mutate({ topicId, isCorrect });
    }

    setAnswers((prev) => ({
      ...prev,
      [currentQ.id]: { selected: selectedAlt, correct: isCorrect },
    }));
    setShowResult(true);
    if (isCorrect) toast.success("Correto");
    else toast.error("Incorreto");
  };

  const nextQuestion = () => {
    if (currentIndex < (questions?.length || 0) - 1) {
      setCurrentIndex(currentIndex + 1);
      const next = answers[questions![currentIndex + 1].id];
      setSelectedAlt(next ? next.selected : null);
      setShowResult(!!next);
    }
  };

  const prevQuestion = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      const prev = answers[questions![currentIndex - 1].id];
      setSelectedAlt(prev ? prev.selected : null);
      setShowResult(!!prev);
    }
  };

  if (isLoading)
    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin text-primary" size={32} />
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">
          Carregando Treino...
        </p>
      </div>
    );

  if (!questions || questions.length === 0)
    return (
      <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full soe-card text-center space-y-6 py-12 px-8">
          <div className="w-16 h-16 rounded-lg bg-secondary flex items-center justify-center mx-auto mb-4 border border-border">
            <XCircle size={32} className="text-muted-foreground opacity-30" />
          </div>
          <h2 className="text-xl font-bold text-foreground">
            Nenhuma prova ativa
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Ative as provas na sua biblioteca para carregar as questões
            mineradas no filtro do Treino de Elite.
          </p>
          <Button
            onClick={onClose}
            className="w-full h-11 rounded-md font-bold text-[10px] uppercase tracking-wider"
          >
            Voltar e Ativar
          </Button>
        </div>
      </div>
    );

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col animate-in fade-in duration-300">
      <header className="h-14 shrink-0 border-b border-border bg-background/50 backdrop-blur-md flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
          >
            <X size={18} />
          </button>
          <div className="h-4 w-px bg-border" />
          <h5 className="font-bold text-[11px] uppercase tracking-wider text-foreground/80">
            Treino de Elite
          </h5>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-secondary/50 border border-border">
            <BarChart2 size={14} className="text-muted-foreground opacity-60" />
            <span className="text-[10px] font-bold tabular-nums">
              {currentIndex + 1} / {questions.length}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <Trophy size={14} />
            <span className="text-[10px] font-bold tabular-nums">
              {Object.values(answers).filter((a) => a.correct).length}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 md:p-12 custom-scrollbar">
        <div className="max-w-3xl mx-auto space-y-10">
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-[9px] font-bold text-muted-foreground uppercase tracking-widest opacity-60">
              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-sm">
                {currentQ.subject}
              </span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span>Questão #{currentQ.id}</span>
            </div>

            {currentQ.supportText && (
              <div className="p-6 rounded-md bg-secondary/20 border-l-2 border-primary/40 text-[13px] leading-relaxed text-foreground/70 whitespace-pre-wrap italic mb-8">
                {currentQ.supportText}
              </div>
            )}

            <h3 className="text-xl font-bold leading-relaxed text-foreground tracking-tight whitespace-pre-wrap">
              {currentQ.statement}
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {currentQ.alternatives.map((alt: any) => {
              const isSelected = selectedAlt === alt.letter;
              const isCorrect = alt.letter === currentQ.correctAnswer;
              const showAsWrong = showResult && isSelected && !isCorrect;
              const showAsCorrect = showResult && isCorrect;

              return (
                <button
                  key={alt.letter}
                  disabled={showResult}
                  onClick={() => setSelectedAlt(alt.letter)}
                  className={cn(
                    "w-full p-4 rounded-md text-left flex items-start gap-4 transition-all border-2",
                    showAsCorrect
                      ? "bg-emerald-500/5 border-emerald-500 text-emerald-500"
                      : showAsWrong
                        ? "bg-destructive/5 border-destructive text-destructive"
                        : isSelected
                          ? "bg-primary/5 border-primary text-primary"
                          : "bg-secondary/30 border-transparent hover:border-border/50",
                  )}
                >
                  <div
                    className={cn(
                      "shrink-0 w-8 h-8 rounded-md flex items-center justify-center font-bold text-xs border transition-all",
                      showAsCorrect
                        ? "bg-emerald-500 text-white border-emerald-400"
                        : showAsWrong
                          ? "bg-destructive text-white border-destructive/80"
                          : isSelected
                            ? "bg-primary text-white border-primary"
                            : "bg-background border-border text-muted-foreground",
                    )}
                  >
                    {alt.letter}
                  </div>
                  <div className="text-sm font-semibold leading-relaxed pt-1 flex-1">
                    {alt.text}
                  </div>
                  {showResult && isCorrect && (
                    <CheckCircle2
                      className="ml-auto text-emerald-500 shrink-0"
                      size={18}
                    />
                  )}
                  {showResult && isSelected && !isCorrect && (
                    <XCircle
                      className="ml-auto text-destructive shrink-0"
                      size={18}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="pt-6">
            {!showResult ? (
              <Button
                onClick={handleRespond}
                disabled={!selectedAlt}
                className="w-full h-14 text-[11px] font-bold uppercase tracking-widest rounded-md"
              >
                Confirmar Resposta
              </Button>
            ) : (
              <div className="flex gap-4">
                <Button
                  variant="outline"
                  onClick={() => setShowResult(false)}
                  className="flex-1 h-14 rounded-md text-[11px] font-bold uppercase tracking-widest bg-secondary/30"
                >
                  Revisar
                </Button>
                <Button
                  onClick={nextQuestion}
                  className="flex-[2] h-14 rounded-md text-[11px] font-bold uppercase tracking-widest"
                >
                  Próxima Questão <ChevronRight size={16} className="ml-2" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="h-12 shrink-0 border-t border-border bg-secondary/10 flex items-center justify-center gap-12 px-6">
        <button
          onClick={prevQuestion}
          disabled={currentIndex === 0}
          className="p-1.5 rounded-md hover:bg-secondary disabled:opacity-20 transition-all"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.3em] opacity-40">
          SOE Intelligent Mining
        </span>
        <button
          onClick={nextQuestion}
          disabled={currentIndex === questions.length - 1}
          className="p-1.5 rounded-md hover:bg-secondary disabled:opacity-20 transition-all"
        >
          <ChevronRight size={20} />
        </button>
      </footer>
    </div>
  );
}
