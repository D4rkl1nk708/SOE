/**
 * PreExamBanner - F16 Modo Pré-Prova
 *
 * Base científica (Cap 7.3):
 * - Perto do concurso, a estratégia correta é SOMENTE revisar o que foi estudado
 * - Não aprender conteúdo novo perto da prova — o cérebro precisa consolidar
 * - Priorizar revisões com maior índice de dificuldade de evocação
 */
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CalendarClock } from "lucide-react";

export function PreExamBanner() {
  const { data } = trpc.v10.getPreExamStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  if (!data?.active) return null;

  const exam = data.exams[0];
  const daysLeft = exam?.daysLeft ?? 0;

  return (
    <div
      className="flex items-start gap-3 p-4 rounded-xl mb-4 border-2"
      style={{
        background: "color-mix(in srgb, var(--accent-red) 8%, transparent)",
        borderColor: "color-mix(in srgb, var(--accent-red) 40%, transparent)",
      }}
    >
      <CalendarClock className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: "var(--accent-red)" }} />
      <div>
        <p className="font-bold text-sm" style={{ color: "var(--accent-red)" }}>
          🚨 MODO PRÉ-PROVA ATIVO — {daysLeft === 0 ? "É HOJE!" : `${daysLeft} dia${daysLeft > 1 ? "s" : ""} para ${exam?.name}`}
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--app-fg)" }}>
          A ciência indica: <strong>não estude conteúdo novo agora</strong>. Foque 100% nas revisões pendentes, priorizando os temas com maior dificuldade de evocação.
          <span style={{ color: "var(--muted-text)" }}> (Chaves, Cap. 7.3 — baseado em Karpicke & Roediger, 2008)</span>
        </p>
        <p className="text-xs mt-1 font-medium" style={{ color: "var(--accent-red)" }}>
          ✓ Conclua revisões pendentes &nbsp;·&nbsp; ✓ Resolva questões por temas fracos &nbsp;·&nbsp; ✗ Evite cadastrar temas novos
        </p>
      </div>
    </div>
  );
}
