import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { 
  X, ChevronLeft, ChevronRight, CheckCircle2, 
  XCircle, Send, Trophy, BarChart2
} from "lucide-react";
import { toast } from "sonner";

export default function MinedResolutionPanel({ onClose }: { onClose: () => void }) {
  const { data: questions, isLoading } = trpc.lab.getIntegratedQuestions.useQuery();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAlt, setSelectedAlt] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [answers, setAnswers] = useState<Record<number, { selected: string, correct: boolean }>>({});

  const currentQ = questions?.[currentIndex];

  const handleRespond = () => {
    if (!selectedAlt || !currentQ) return;
    const isCorrect = selectedAlt === currentQ.correctAnswer;
    setAnswers(prev => ({ ...prev, [currentQ.id]: { selected: selectedAlt, correct: isCorrect } }));
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

  if (isLoading) return (
    <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center">
      <Loader2 className="animate-spin text-primary" size={32} />
    </div>
  );

  if (!questions || questions.length === 0) return (
    <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full soe-card text-center space-y-6 py-12">
        <h2 className="text-2xl font-semibold">Nenhuma prova ativa</h2>
        <p className="text-muted-foreground text-sm">Ative as provas na sua biblioteca para carregar as questões no filtro.</p>
        <button onClick={onClose} className="btn-apple-primary w-full h-12">
          Voltar e Ativar
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col animate-in fade-in duration-300">
      {/* Header oficial SOE */}
      <header className="h-16 shrink-0 border-b border-border bg-background/80 backdrop-blur-md flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary transition-colors">
            <X size={20} />
          </button>
          <div className="h-4 w-px bg-border" />
          <h5 className="font-semibold text-sm">Treino de Elite</h5>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary border border-border">
            <BarChart2 size={14} className="text-muted-foreground" />
            <span className="text-xs font-medium tabular-nums">{currentIndex + 1} / {questions.length}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-green/10 text-accent-green border border-accent-green/20">
             <Trophy size={14} />
             <span className="text-xs font-bold">{Object.values(answers).filter(a => a.correct).length}</span>
          </div>
        </div>
      </header>

      {/* Área de Resolução */}
      <main className="flex-1 overflow-y-auto p-6 md:p-12">
        <div className="max-w-3xl mx-auto space-y-8">
          
          <div className="space-y-4">
             <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                <span>{currentQ.subject}</span>
                <span className="w-1 h-1 rounded-full bg-border" />
                <span>ID #{currentQ.id}</span>
             </div>
             
             {/* Texto de Apoio (Caso exista) */}
             {currentQ.supportText && (
               <div className="p-6 rounded-2xl bg-secondary/30 border-l-4 border-primary/50 text-sm leading-relaxed opacity-80 whitespace-pre-wrap font-serif italic mb-6">
                 {currentQ.supportText}
               </div>
             )}

             <h3 className="text-xl font-medium leading-relaxed text-foreground whitespace-pre-wrap">
               {currentQ.statement}
             </h3>
          </div>

          <div className="space-y-3">
             {currentQ.alternatives.map((alt) => {
               const isSelected = selectedAlt === alt.letter;
               const isCorrect = alt.letter === currentQ.correctAnswer;
               const showAsWrong = showResult && isSelected && !isCorrect;
               const showAsCorrect = showResult && isCorrect;

               return (
                 <button 
                  key={alt.letter}
                  disabled={showResult}
                  onClick={() => setSelectedAlt(alt.letter)}
                  className={`w-full p-4 rounded-xl text-left flex items-start gap-4 transition-all border-2 ${
                    showAsCorrect ? 'bg-accent-green/5 border-accent-green' :
                    showAsWrong ? 'bg-destructive/5 border-destructive' :
                    isSelected ? 'bg-primary/5 border-primary' :
                    'bg-secondary/50 border-transparent hover:border-border'
                  }`}
                 >
                   <div className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center font-bold text-xs transition-colors ${
                     showAsCorrect ? 'bg-accent-green text-white' :
                     showAsWrong ? 'bg-destructive text-white' :
                     isSelected ? 'bg-primary text-white' :
                     'bg-secondary text-muted-foreground'
                   }`}>
                     {alt.letter}
                   </div>
                   <div className="text-sm leading-relaxed pt-0.5 opacity-90">
                     {alt.text}
                   </div>
                   {showResult && isCorrect && <CheckCircle2 className="ml-auto text-accent-green shrink-0" size={18} />}
                   {showResult && isSelected && !isCorrect && <XCircle className="ml-auto text-destructive shrink-0" size={18} />}
                 </button>
               );
             })}
          </div>

          {!showResult ? (
            <button 
              onClick={handleRespond}
              disabled={!selectedAlt}
              className="btn-apple-primary w-full h-14 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-30"
            >
              Responder
            </button>
          ) : (
            <div className="flex gap-3">
              <button onClick={() => setShowResult(false)} className="flex-1 h-12 rounded-xl bg-secondary hover:bg-muted text-xs font-bold transition-colors">
                Revisar
              </button>
              <button onClick={nextQuestion} className="flex-[2] h-12 btn-apple-primary text-xs font-bold flex items-center justify-center gap-2">
                Próxima Questão <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Navegação Inferior */}
      <footer className="h-14 shrink-0 border-t border-border flex items-center justify-center gap-6 px-6">
        <button onClick={prevQuestion} disabled={currentIndex === 0} className="p-2 rounded-lg hover:bg-secondary disabled:opacity-20 transition-colors">
          <ChevronLeft size={24} />
        </button>
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">SOE Intelligent Mining</span>
        <button onClick={nextQuestion} disabled={currentIndex === questions.length - 1} className="p-2 rounded-lg hover:bg-secondary disabled:opacity-20 transition-colors">
          <ChevronRight size={24} />
        </button>
      </footer>
    </div>
  );
}

function Loader2({ className, size }: { className?: string, size?: number }) {
  return <div className={`animate-spin rounded-full border-4 border-primary border-t-transparent ${className}`} style={{ width: size, height: size }} />;
}
