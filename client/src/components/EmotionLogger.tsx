/**
 * EmotionLogger - F09
 * Registro de estado emocional antes de estudar.
 *
 * Base científica (Cap 5.1/5.2):
 * - "Emoções e estados de ânimo regulam diretamente a formação de memória" (Ivan Izquierdo)
 * - "Aluno estressado não forma corretamente as memórias" (Izquierdo et al., 1998)
 * - Correlacionar humor com desempenho subsequente gera metacognição valiosa
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const MOODS = [
  { value: 1 as const, emoji: "😫", label: "Péssimo" },
  { value: 2 as const, emoji: "😕", label: "Mal" },
  { value: 3 as const, emoji: "😐", label: "Neutro" },
  { value: 4 as const, emoji: "🙂", label: "Bem" },
  { value: 5 as const, emoji: "😄", label: "Ótimo" },
];

interface EmotionLoggerProps {
  onLogged?: () => void;
  compact?: boolean;
}

export function EmotionLogger({ onLogged, compact = false }: EmotionLoggerProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [logged, setLogged] = useState(false);

  const logEmotion = trpc.v10.logEmotion.useMutation({
    onSuccess: () => {
      setLogged(true);
      toast.success("Estado registrado! Isso ajuda a entender quando você aprende melhor.");
      onLogged?.();
    },
  });

  const handleSelect = (mood: 1|2|3|4|5) => {
    setSelected(mood);
    logEmotion.mutate({ mood });
  };

  if (logged) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--muted-text)" }}>
        <span>✓ Estado registrado</span>
        <button onClick={() => { setLogged(false); setSelected(null); }} className="text-xs underline">alterar</button>
      </div>
    );
  }

  return (
    <div className={compact ? "flex items-center gap-2" : "space-y-2"}>
      {!compact && (
        <p className="text-sm font-medium" style={{ color: "var(--muted-text)" }}>
          Como você está agora? (opcional — melhora suas estatísticas)
        </p>
      )}
      <div className="flex gap-2">
        {MOODS.map(m => (
          <button
            key={m.value}
            onClick={() => handleSelect(m.value)}
            disabled={logEmotion.isPending}
            title={m.label}
            className="flex flex-col items-center gap-0.5 p-2 rounded-lg transition-all hover:scale-110"
            style={{
              background: selected === m.value ? "var(--stat-bg)" : "transparent",
              border: selected === m.value ? "2px solid var(--primary)" : "2px solid transparent",
              opacity: logEmotion.isPending ? 0.6 : 1,
            }}
          >
            <span className="text-xl">{m.emoji}</span>
            {!compact && <span className="text-xs" style={{ color: "var(--muted-text)" }}>{m.label}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
