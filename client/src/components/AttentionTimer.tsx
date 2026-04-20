/**
 * AttentionTimer - F07 Timer com Alerta de Saturação Atencional
 *
 * Base científica (Cap 5.3 + 5.11):
 * - "A atenção não pode ser mantida por longos períodos" — fenômeno natural
 * - A intercalação reativa a atenção: trocar de disciplina após saturação melhora retenção
 * - "Quando intercalamos os assuntos, conseguimos reativar a atenção" (Chaves, Cap 5.11)
 * - Referência: Agarwal & Agostinelli (2020), prática intercalada potencia aprendizado
 *
 * Diferente do Pomodoro: não é um timer fixo, é baseado em saturação por disciplina.
 */
import { useState, useEffect, useRef } from "react";
import { Clock, RotateCcw, AlertTriangle, Play, Pause, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface AttentionTimerProps {
  disciplineName?: string;
  alertMinutes?: number; // default 45
  onSwitchRequested?: () => void;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function AttentionTimer({ disciplineName, alertMinutes = 45, onSwitchRequested }: AttentionTimerProps) {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [alerted, setAlerted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const alertAt = alertMinutes * 60;

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds(s => {
          const next = s + 1;
          if (next === alertAt && !alerted) {
            setAlerted(true);
            toast.warning(
              `⚠️ ${alertMinutes} min na mesma disciplina — hora de intercalar!`,
              { duration: 8000, description: "Troque de matéria para reativar a atenção e melhorar a retenção." }
            );
          }
          return next;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, alerted, alertAt]);

  const progress = Math.min(seconds / alertAt, 1);
  const isOver = seconds >= alertAt;
  const color = isOver ? "var(--accent-red)" : seconds > alertAt * 0.75 ? "#f97316" : "var(--primary)";

  const reset = () => {
    setSeconds(0);
    setAlerted(false);
    setDismissed(false);
    setRunning(false);
  };

  return (
    <div
      className="p-4 rounded-xl border space-y-3"
      style={{ background: "var(--stat-bg)", borderColor: "var(--card-border)" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4" style={{ color }} />
          <span className="text-sm font-semibold" style={{ color: "var(--app-fg)" }}>
            Timer de Atenção
            {disciplineName && <span style={{ color: "var(--muted-text)" }}> · {disciplineName}</span>}
          </span>
        </div>
        <span className="text-xl font-mono font-black" style={{ color }}>
          {formatTime(seconds)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--card-border)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${progress * 100}%`, background: color }}
        />
      </div>

      {isOver && !dismissed && (
        <div
          className="flex items-start gap-2 p-2 rounded-lg text-xs"
          style={{ background: "color-mix(in srgb, var(--accent-red) 10%, transparent)", color: "var(--accent-red)" }}
        >
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            <strong>Atenção saturada.</strong> Trocar de disciplina agora vai reativar o foco e aumentar a retenção do que você acabou de estudar.
          </span>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={running ? "outline" : "default"}
          onClick={() => setRunning(r => !r)}
          className="flex-1"
        >
          {running ? <><Pause className="h-3.5 w-3.5 mr-1" /> Pausar</> : <><Play className="h-3.5 w-3.5 mr-1" /> Iniciar</>}
        </Button>
        <Button size="sm" variant="ghost" onClick={reset} title="Resetar (mudou de disciplina)">
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
        {isOver && onSwitchRequested && (
          <Button
            size="sm"
            onClick={() => { onSwitchRequested(); reset(); }}
            style={{ background: "var(--accent-red)", color: "white" }}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Intercalar
          </Button>
        )}
      </div>

      <p className="text-xs" style={{ color: "var(--muted-text)" }}>
        Alerta em {alertMinutes}min · Baseado em Agarwal & Agostinelli (2020)
      </p>
    </div>
  );
}
