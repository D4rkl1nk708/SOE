/**
 * Uma única fonte de verdade para invalidar o estado de estudo (v6.9.8, item 2.1).
 *
 * O bug que o aluno viu nasceu aqui: cada tela invalidava um pedacinho do cache.
 * Revisions invalidava `dashboard` e `calendar`, History invalidava `history` e
 * `dashboard`, GuidedSession não invalidava NADA — e o plano (`study.overview`)
 * continuava mostrando o tópico que ele tinha acabado de concluir.
 *
 * Regra: quem muda revisão, tentativa ou sessão chama `invalidateStudyState`.
 * O conjunto é sempre o completo; `scope` existe só para incluir os caches
 * extras daquele tipo de ação (nunca para reduzir o conjunto base).
 */
import type { trpc } from "./trpc";

type TrpcUtils = ReturnType<typeof trpc.useUtils>;

export type StudyStateScope = "revision" | "attempt" | "session" | "all";

/** Caches que SEMPRE precisam ser invalidados quando o estado de estudo muda. */
export const STUDY_STATE_QUERIES = [
  "study.overview",
  "dashboard.getStats",
  "revision.list",
  "calendar.getActivities",
  "calendar.getData",
  "history.get",
  "tec.liveActivity",
] as const;

export function invalidateStudyState(
  utils: TrpcUtils,
  scope: StudyStateScope = "all",
): Promise<void> {
  const jobs: Array<Promise<unknown>> = [
    utils.study.overview.invalidate(),
    utils.dashboard.getStats.invalidate(),
    utils.revision.list.invalidate(),
    utils.calendar.getActivities.invalidate(),
    utils.calendar.getData.invalidate(),
    utils.history.get.invalidate(),
    utils.tec.liveActivity.invalidate(),
    // O relatório da sessão sai do delta de domínio por tópico.
    utils.study.masterySnapshot.invalidate(),
  ];

  if (scope === "all" || scope === "attempt") {
    jobs.push(utils.study.calibration.invalidate());
    jobs.push(utils.study.attemptTrends.invalidate());
  }
  if (scope === "all" || scope === "session") {
    jobs.push(utils.study.recentSessions.invalidate());
  }

  return Promise.all(jobs).then(() => undefined);
}
