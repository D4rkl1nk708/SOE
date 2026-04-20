/**
 * TeachYourselfMode - F11 Modo "Ensinar para Si Mesmo"
 *
 * Base científica (Cap 5.7 + 7.3):
 * - "Lecionar um conteúdo para alguém é mais vantajoso do que escrever um resumo" (Chaves)
 * - Explicar exige amplitude total de recordação — máximo esforço cognitivo
 * - Técnica Feynman aplicada corretamente com espaçamento (o que o livro critica na Feynman
 *   pura é a ausência de espaçamento — aqui integramos ao método 25/50)
 * - McDaniel et al. (2009): read-recite-review — recitar é mais eficaz que reler
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GraduationCap, Mic, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface TeachYourselfProps {
  open: boolean;
  onClose: () => void;
  topicName: string;
  disciplineName?: string;
}

const PROMPTS = [
  "Explique esse tema como se estivesse ensinando a um aluno de ensino médio que nunca viu o assunto.",
  "Dê 3 exemplos práticos desse tema que um leigo conseguiria entender.",
  "Quais são os pontos que uma banca examinadora mais costuma cobrar nesse tema? Por quê?",
  "Se você tivesse 2 minutos para explicar esse tema numa entrevista oral, o que diria?",
  "Quais são os erros mais comuns que concurseiros cometem nesse tema?",
];

export function TeachYourselfMode({ open, onClose, topicName, disciplineName }: TeachYourselfProps) {
  const [text, setText] = useState("");
  const [promptIdx, setPromptIdx] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [wordCount, setWordCount] = useState(0);

  const handleChange = (v: string) => {
    setText(v);
    setWordCount(v.trim().split(/\s+/).filter(Boolean).length);
  };

  const handleSubmit = () => {
    if (wordCount < 20) {
      toast.error("Tente desenvolver mais — pelo menos 20 palavras.");
      return;
    }
    setSubmitted(true);
  };

  const handleClose = () => {
    setText("");
    setSubmitted(false);
    setWordCount(0);
    setPromptIdx(0);
    onClose();
  };

  const nextPrompt = () => {
    setText("");
    setWordCount(0);
    setSubmitted(false);
    setPromptIdx(i => (i + 1) % PROMPTS.length);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" style={{ color: "var(--primary)" }} />
            Ensinar para Si Mesmo — {topicName}
          </DialogTitle>
          <DialogDescription>
            {disciplineName && <span style={{ color: "var(--primary)" }}>{disciplineName} · </span>}
            Explicar em voz própria é o método de revisão com maior esforço cognitivo.
            Isso fortalece a memória mais do que qualquer releitura. (McDaniel et al., 2009)
          </DialogDescription>
        </DialogHeader>

        {!submitted ? (
          <div className="space-y-4">
            {/* Prompt */}
            <div className="p-3 rounded-lg" style={{ background: "color-mix(in srgb, var(--primary) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 25%, transparent)" }}>
              <p className="text-sm font-medium" style={{ color: "var(--primary)" }}>
                📌 {PROMPTS[promptIdx]}
              </p>
            </div>

            <Textarea
              placeholder="Escreva sua explicação aqui... seja direto como se estivesse falando para alguém."
              value={text}
              onChange={e => handleChange(e.target.value)}
              rows={7}
              className="resize-none"
            />

            <div className="flex items-center justify-between text-xs" style={{ color: "var(--muted-text)" }}>
              <span>{wordCount} palavra{wordCount !== 1 ? "s" : ""} {wordCount >= 20 ? "✓" : "(mínimo 20)"}</span>
              <button onClick={nextPrompt} className="flex items-center gap-1 hover:opacity-80 transition-opacity">
                <RefreshCw className="h-3 w-3" /> Outra pergunta
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: "color-mix(in srgb, var(--accent-green) 15%, transparent)" }}>
                <CheckCircle2 className="h-8 w-8" style={{ color: "var(--accent-green)" }} />
              </div>
              <p className="text-lg font-bold text-center" style={{ color: "var(--app-fg)" }}>
                Excelente! Você ensinou {topicName}.
              </p>
              <p className="text-sm text-center" style={{ color: "var(--muted-text)" }}>
                Cada vez que você explica em suas próprias palavras, as conexões neurais
                ficam mais fortes e a evocação futura fica mais fácil.
              </p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
              <p className="text-xs font-semibold mb-1" style={{ color: "var(--muted-text)" }}>Você escreveu:</p>
              <p className="text-sm italic" style={{ color: "var(--app-fg)" }}>{text}</p>
            </div>
            <Button variant="outline" onClick={nextPrompt} className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" /> Tentar outra perspectiva
            </Button>
          </div>
        )}

        <DialogFooter>
          {!submitted ? (
            <>
              <Button variant="ghost" onClick={handleClose}>Fechar</Button>
              <Button onClick={handleSubmit} disabled={wordCount < 5}>
                Enviei minha explicação
              </Button>
            </>
          ) : (
            <Button onClick={handleClose} className="w-full">
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
