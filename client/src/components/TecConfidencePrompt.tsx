import { useEffect, useState } from "react";
import { Dices, HelpCircle, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Confidence = "chute" | "acho" | "certeza";

interface TecAnswerDetail {
  disciplina: string;
  assunto: string;
  correct: boolean;
  seconds?: number;
  questionId?: string;
  banca?: string;
}

const OPTIONS: Array<{
  id: Confidence;
  label: string;
  hint: string;
  icon: typeof ShieldCheck;
  key: string;
}> = [
  {
    id: "certeza",
    label: "Sabia com certeza",
    hint: "Domínio do assunto",
    icon: ShieldCheck,
    key: "1",
  },
  {
    id: "acho",
    label: "Fiquei na dúvida",
    hint: "Eliminei alternativas",
    icon: HelpCircle,
    key: "2",
  },
  {
    id: "chute",
    label: "Chutei",
    hint: "Sem base para decidir",
    icon: Dices,
    key: "3",
  },
];

/**
 * Pergunta o grau de confiança logo depois que o TEC registra uma resposta.
 * É o que alimenta a calibração (chute x certeza) do SOE.
 */
export function TecConfidencePrompt() {
  const [pending, setPending] = useState<TecAnswerDetail | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<TecAnswerDetail>).detail;
      if (detail?.assunto) setPending(detail);
    };
    window.addEventListener("soe-tec-answer", handler);
    return () => window.removeEventListener("soe-tec-answer", handler);
  }, []);

  const record = trpc.study.recordTecAnswer.useMutation({
    onSuccess: (result) => {
      if (result?.ok) {
        toast.success("Confiança registrada.", { position: "bottom-center" });
      } else {
        toast.info("Resposta registrada sem confiança.", {
          position: "bottom-center",
        });
      }
      setPending(null);
    },
    onError: () => {
      toast.error("Não consegui registrar agora — tente de novo.", {
        position: "bottom-center",
      });
    },
  });

  const choose = (confidence: Confidence) => {
    if (!pending) return;
    record.mutate({
      disciplina: pending.disciplina,
      assunto: pending.assunto,
      correct: pending.correct,
      confidence,
      seconds: pending.seconds,
      questionId: pending.questionId,
      banca: pending.banca,
    });
  };

  useEffect(() => {
    if (!pending) return;
    const onKey = (event: KeyboardEvent) => {
      const option = OPTIONS.find((item) => item.key === event.key);
      if (option) {
        event.preventDefault();
        choose(option.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  return (
    <Dialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
      <DialogContent
        showCloseButton={false}
        className="!max-w-[380px] gap-0 overflow-hidden rounded-[16px] border-border !bg-card p-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-2 duration-200"
      >
        <div className="px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Captura TEC
              </p>
              <DialogTitle
                className={cn(
                  "mt-1 text-[16px] font-semibold tracking-[-0.02em]",
                  pending?.correct
                    ? "text-[var(--accent-green)]"
                    : "text-[var(--accent-red)]",
                )}
              >
                {pending?.correct ? "Você acertou" : "Você errou"}
              </DialogTitle>
              <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                {pending?.assunto}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60"
              aria-label="Fechar"
            >
              <X size={15} />
            </button>
          </div>

          <p className="mt-4 text-[12.5px] text-foreground">Como foi essa?</p>

          <div className="mt-2 space-y-1.5">
            {OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={record.isPending}
                  onClick={() => choose(option.id)}
                  className="flex w-full items-center gap-3 rounded-[10px] border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-secondary/60 disabled:opacity-50"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-secondary text-muted-foreground">
                    <Icon size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium text-foreground">
                      {option.label}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {option.hint}
                    </span>
                  </span>
                  <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {option.key}
                  </kbd>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setPending(null)}
            className="mt-3 w-full text-center text-[11.5px] text-muted-foreground hover:text-foreground"
          >
            Pular por agora
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
