/**
 * MassStudyAlert - F05 Detecção de Estudo em Massa
 *
 * Base científica (Cap 5.10):
 * - "Estudo intensivo de um conteúdo não propicia boa aprendizagem" (Chaves)
 * - Aprendizagem em massa ≡ bulimia cognitiva — retém pouco a longo prazo
 * - Prática distribuída melhora recuperação em até 150% vs concentrada
 * - Referência: Cepeda et al. (2006), Psychological Bulletin
 */
import { trpc } from "@/lib/trpc";
import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";

interface MassStudyAlertProps {
  disciplineId?: number;
  disciplineName?: string;
}

export function MassStudyAlert({ disciplineId, disciplineName }: MassStudyAlertProps) {
  const [dismissed, setDismissed] = useState(false);
  const { data } = trpc.v10.checkMassStudy.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  if (dismissed || !data?.flagged?.length) return null;

  const flagged = disciplineId
    ? data.flagged.filter(f => f.disciplineId === disciplineId)
    : data.flagged;

  if (!flagged.length) return null;

  return (
    <div
      className="flex items-start gap-3 p-3 rounded-lg border"
      style={{
        background: "color-mix(in srgb, #f97316 8%, transparent)",
        borderColor: "color-mix(in srgb, #f97316 30%, transparent)",
      }}
    >
      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "#f97316" }} />
      <div className="flex-1 text-sm">
        <p className="font-semibold" style={{ color: "#f97316" }}>Atenção: estudo em massa detectado</p>
        <p className="text-xs mt-0.5" style={{ color: "var(--app-fg)" }}>
          Você cadastrou {flagged[0].count}+ temas de{" "}
          <strong>{disciplineName || "uma mesma disciplina"}</strong> hoje. A ciência mostra
          que concentrar o estudo em uma única sessão prejudica a retenção a longo prazo.
        </p>
        <p className="text-xs mt-1 font-medium" style={{ color: "#f97316" }}>
          Recomendação: distribua os próximos temas em dias diferentes.
        </p>
      </div>
      <button onClick={() => setDismissed(true)} className="opacity-50 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
