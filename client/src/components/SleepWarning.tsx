import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Moon, X } from "lucide-react";

export function SleepWarning() {
  const [dismissed, setDismissed] = useState(false);
  const [currentHour, setCurrentHour] = useState(new Date().getHours());
  const logStudyEnd = trpc.v10.logStudyEnd.useMutation();

  useEffect(() => {
    const interval = setInterval(
      () => setCurrentHour(new Date().getHours()),
      60000,
    );
    return () => clearInterval(interval);
  }, []);

  // Warn if studying between 23h and 2h
  const isLateNight = currentHour >= 23 || currentHour <= 2;

  useEffect(() => {
    if (isLateNight && !dismissed) {
      logStudyEnd.mutate({ endHour: currentHour, alertIssued: true });
    }
  }, [isLateNight]);

  if (!isLateNight || dismissed) return null;

  return (
    <div className="flex items-start gap-3 p-4 rounded-md border border-primary/20 bg-primary/5 mb-6">
      <Moon className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
      <div className="flex-1 text-sm">
        <p className="font-bold text-primary">
          São {currentHour}h — considere parar por hoje
        </p>
        <p className="text-xs mt-1 text-foreground leading-relaxed">
          <span className="font-bold">O sono consolida a memória</span>. O que
          você estudou hoje vai se fixar melhor durante o sono do que se você
          continuar estudando agora. Prefira revisar amanhã cedo com o cérebro
          descansado.
        </p>
        <p className="text-[10px] mt-1.5 text-primary/60 font-medium">
          Ref: Diekelmann & Born (2010), Mazza et al. (2016)
        </p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="opacity-40 hover:opacity-100 transition-opacity"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
