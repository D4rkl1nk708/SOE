/**
 * SleepWarning - F15 Cronômetro de Sono
 *
 * Base científica (Cap 5.4):
 * - "O sono é um influente regulador da memória" (Diekelmann & Born, 2010)
 * - "A privação do sono certamente prejudica ou impede a consolidação" (Chaves)
 * - Mazza et al. (2016): Relearn Faster and Retain Longer — prática espaçada + sono = retenção máxima
 * - Ben Simon et al. (2020): privação de sono amplifica ansiedade e prejudica codificação
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Moon, X } from "lucide-react";

export function SleepWarning() {
  const [dismissed, setDismissed] = useState(false);
  const [currentHour, setCurrentHour] = useState(new Date().getHours());
  const logStudyEnd = trpc.v10.logStudyEnd.useMutation();

  useEffect(() => {
    const interval = setInterval(() => setCurrentHour(new Date().getHours()), 60000);
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
    <div
      className="flex items-start gap-3 p-3 rounded-lg border mb-3"
      style={{
        background: "color-mix(in srgb, #8b5cf6 8%, transparent)",
        borderColor: "color-mix(in srgb, #8b5cf6 30%, transparent)",
      }}
    >
      <Moon className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "#8b5cf6" }} />
      <div className="flex-1 text-sm">
        <p className="font-semibold" style={{ color: "#8b5cf6" }}>
          São {currentHour}h — considere parar por hoje
        </p>
        <p className="text-xs mt-0.5" style={{ color: "var(--app-fg)" }}>
          A ciência é clara: <strong>o sono consolida a memória</strong>. O que você estudou hoje
          vai se fixar melhor durante o sono do que se você continuar estudando agora.
          Prefira revisar amanhã cedo com o cérebro descansado.
        </p>
        <p className="text-xs mt-1" style={{ color: "#8b5cf6" }}>
          Ref: Diekelmann & Born (2010), Mazza et al. (2016)
        </p>
      </div>
      <button onClick={() => setDismissed(true)} className="opacity-50 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
