import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { notify } from "@/lib/notify";

/** Onde o resultado da verificação automática fica guardado. */
export const DATA_HEALTH_STORAGE_KEY = "soe_data_health";

/**
 * Verificação de saúde dos dados na abertura do app (v6.9.8, item 2.4).
 *
 * Roda uma vez por sessão, grava o resultado e só avisa o aluno quando existe
 * alguma correção segura a fazer — sem alarme vazio em base saudável.
 */
export function useDataHealthWatch(): void {
  const { data } = trpc.study.dataHealth.useQuery(undefined, {
    staleTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!data) return;
    try {
      localStorage.setItem(
        DATA_HEALTH_STORAGE_KEY,
        JSON.stringify({
          at: new Date().toISOString(),
          healthy: data.healthy,
          actions: data.actions,
          findings: {
            errorsWithoutStatement: data.errorsWithoutStatement,
            emptyMockExams: data.emptyMockExams,
            staleFlashcards: data.staleFlashcards,
            duplicateOrder: data.duplicateOrder,
            topicBacklog: data.topicBacklog,
            incoherentPerformance: data.incoherentPerformance,
            attemptsWithoutTopic: data.attemptsWithoutTopic,
          },
        }),
      );
    } catch {
      /* localStorage indisponível: a verificação ainda vale para esta sessão */
    }

    if (data.healthy || data.actions.length === 0) return;
    notify.once(
      "data-health-open",
      "Saúde dos dados: há correções seguras pendentes.",
      {
        variant: "info",
        duration: 9000,
        description: data.actions
          .map((action) => `${action.label} (${action.count})`)
          .join(" · "),
      },
    );
  }, [data]);
}
