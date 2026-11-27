/**
 * Link tRPC que executa procedimentos localmente (IndexedDB) quando em Capacitor/Android.
 * Permite o app rodar 100% offline no celular.
 */
import { observable } from "@trpc/server/observable";
import { transformResult } from "@trpc/server/unstable-core-do-not-import";
import { TRPCClientError } from "@trpc/client";
import superjson from "superjson";
import type { TRPCLink } from "@trpc/client";
import type { AppRouter } from "../../../server/routers";
import {
  localAuthMe,
  localUpdateSettings,
  localExamList,
  localExamUpsert,
  localExamRemove,
  localDisciplineList,
  localDisciplineCreate,
  localDisciplineUpdate,
  localDisciplineDelete,
  localDisciplineReorder,
  localTopicList,
  localTopicCreate,
  localTopicDelete,
  localTopicUpdate,
  localTopicSetPerformance,
  localTopicAddStudyTime,
  localTopicReorder,
  localTopicResetAllStats,
  localRevisionList,
  localRevisionMarkCompleted,
  localRevisionTopicBacklog,
  localRevisionCompleteTopicBacklog,
  localRevisionMarkIgnored,
  localImportExportBackup,
  localImportImportBackup,
  localCalendarGetData,
  localCalendarGetActivities,
  localCalendarSaveLink,
  localDashboardGetStats,
  localMockExamList,
  localMockExamCreate,
  localNoteList,
  localNoteUpsert,
  localNoteDelete,
  localMockExamUpdate,
  localMockExamDelete,
  localDashboardGetWeeklyStats,
  localSaveQuestionError,
  localGetQuestionErrors,
  localDeleteQuestionError,
  localFlashcardList,
  localFlashcardCreate,
  localFlashcardUpdate,
  localFlashcardDelete,
  localFlashcardReview,
  localGetTecRegressions,
  localMentorChat,
  localGenerateAdaptiveQuestion,
  localTestAiKey,
  localReviewSimulado,
  localStudyWeeklyReview,
  localRecordQuestionAttempt,
  localRecordTecAnswer,
  localImportCaderno,
  localStudyOverview,
  localStudyRecordSession,
  localStudyMasterySnapshot,
  localStudyErrorPatterns,
  localStudyCalibration,
  localBuildLeiSeca,
  localLeiSecaToday,
  localDisciplineConsolidationPreview,
  localConsolidateDisciplines,
  localEssayList,
  localEssaySave,
  localEssayUpdate,
  localEssayDelete,
  localSaveSubjectiveAnswer,
  localGetSubjectiveAnswers,
  localDeleteSubjectiveAnswer,
  localGetWeakProfile,
  localGetDailyBriefing,
  localDiagnoseError,
  localProcessText,
  localGenerateFlashcardsFromText,
  localGetConceptConfusions,
  localSaveConceptConfusion,
  localStudyAttemptTrends,
  localGenerateFlashcardsFromErrors,
  localEditalOverview,
  localEditalSetActiveExam,
  localEditalCoverage,
  localEditalSuggestLinks,
  localEditalLinkRow,
  localTecLiveActivity,
  localTecAddManualAnswer,
  localTecUndoLastAnswer,
  localTecPendingClassifications,
  localTecResolvePending,
  localLearningList,
  localLearningGet,
  localLearningRemove,
  localLearningImportPdf,
  localLearningAnalogies,
  localLearningSaveAnalogy,
  localLearningMicroWorlds,
  localLearningSaveMicroWorld,
  localLearningLessons,
  localLearningSaveLesson,
  localLearningDeleteLesson,
  localLessonStudiedToday,
  localMarkLessonStudied,
  localStartGeneration,
  localGenerationStatus,
  localCancelGeneration,
  localApplySpacingGuard,
  localStartPretest,
  localSavePrediction,
  localStudyRetentionMetrics,
  localSaveSectionRecall,
  localGetSectionRecalls,
  localSetQuestionErrorCause,
  localGetErrorCauses,
} from "./localDb";

const PROCEDURES: Record<string, (input: unknown) => Promise<unknown>> = {
  "auth.me": () => localAuthMe(),
  "auth.updateSettings": (i) =>
    localUpdateSettings(i as Record<string, unknown>),
  "auth.logout": () => Promise.resolve({ success: true }),
  "exam.list": () => localExamList(),
  "exam.upsert": (i) =>
    localExamUpsert(i as { id?: string; name: string; date: string }),
  "exam.remove": (i) => localExamRemove(i as { id: string }),
  "discipline.list": () => localDisciplineList(),
  "discipline.create": (i) =>
    localDisciplineCreate(i as { name: string; color: string; weight: number }),
  "discipline.update": (i) =>
    localDisciplineUpdate(
      i as { id: number; name?: string; color?: string; weight?: number },
    ),
  "discipline.delete": (i) => localDisciplineDelete(i as { id: number }),
  "discipline.reorder": (i) =>
    localDisciplineReorder(i as { orderedIds: number[] }),
  "topic.list": (i) =>
    localTopicList(i as { disciplineId?: number; search?: string }),
  "topic.create": (i) =>
    localTopicCreate(
      i as {
        name: string;
        disciplineId: number;
        studyDate?: string;
        notes?: string;
      },
    ),
  "topic.delete": (i) => localTopicDelete(i as { id: number }),
  "topic.update": (i) =>
    localTopicUpdate(
      i as { id: number; name?: string; disciplineId?: number; notes?: string },
    ),
  "topic.setPerformance": (i) => localTopicSetPerformance(i as any),
  "topic.addStudyTime": (i) => localTopicAddStudyTime(i as any),
  "topic.reorder": (i) =>
    localTopicReorder(i as { disciplineId: number; orderedIds: number[] }),
  "topic.resetAllStats": () => localTopicResetAllStats(),
  "revision.list": (i) =>
    localRevisionList(i as { completed?: boolean; ignored?: boolean }),
  "revision.markCompleted": (i) =>
    localRevisionMarkCompleted(i as { id: number; completed: boolean }),
  // v6.9.11: espaçamento e pré-teste também no aparelho.
  "revision.applySpacingGuard": (i) =>
    localApplySpacingGuard(
      i as { today?: string; minGapDays?: number } | undefined,
    ),
  "revision.markIgnored": (i) =>
    localRevisionMarkIgnored(i as { id: number; ignored: boolean }),
  "revision.topicBacklog": (i) =>
    localRevisionTopicBacklog(i as { topicId: number }),
  "revision.completeTopicBacklog": (i) =>
    localRevisionCompleteTopicBacklog(i as { topicId: number; today?: string }),
  "import.exportBackup": () => localImportExportBackup(),
  "import.importBackup": (i) => localImportImportBackup(i as { json: string }),
  "import.tecConcursos": () =>
    Promise.reject(
      new Error(
        "Importação TEC disponível apenas na versão web. Use Exportar/Importar Banco para backup.",
      ),
    ),
  "import.tecConcursosScrape": () =>
    Promise.reject(
      new Error(
        "Importação TEC via URL disponível apenas na versão web. Use a importação XLSX para o modo offline.",
      ),
    ),
  "import.generatePushToken": () =>
    Promise.reject(new Error("Token de Push disponível apenas na versão web.")),
  "import.listCadernos": () => Promise.resolve([]),
  "import.deleteCaderno": () =>
    Promise.reject(new Error("Disponível apenas na versão web.")),
  "import.getPushToken": () => Promise.resolve({ token: null }),
  "calendar.getData": (i) =>
    localCalendarGetData(i as { startDate: string; endDate: string }),
  "calendar.getActivities": (i) => localCalendarGetActivities(i as any),
  "calendar.saveLink": (i) => localCalendarSaveLink(i as any),
  "calendar.markCompleted": (i) => {
    const input = i as { revisionId: number; completed: boolean };
    return localRevisionMarkCompleted({
      id: input.revisionId,
      completed: input.completed,
    });
  },
  "dashboard.getStats": () => localDashboardGetStats(),
  "dashboard.getWeeklyStats": () => localDashboardGetWeeklyStats(),
  "mockExam.list": () => localMockExamList(),
  "mockExam.create": (i) =>
    localMockExamCreate(
      i as {
        name: string;
        date: string;
        correct: number;
        wrong: number;
        blank: number;
        totalQuestions: number;
      },
    ),
  "note.list": () => localNoteList(),
  "note.upsert": (i) =>
    localNoteUpsert(
      i as {
        id?: number;
        userId: number;
        disciplineId: number;
        topicId?: number;
        title: string;
        content: string;
      },
    ),
  "note.delete": (i) => localNoteDelete(i as { id: number }),
  "mockExam.update": (i) =>
    localMockExamUpdate(
      i as {
        id: number;
        name?: string;
        date?: string;
        correct?: number;
        wrong?: number;
        blank?: number;
        totalQuestions?: number;
      },
    ),
  "mockExam.delete": (i) => localMockExamDelete(i as { id: number }),
  "questionError.save": (i) =>
    localSaveQuestionError(i as Parameters<typeof localSaveQuestionError>[0]),
  "questionError.list": (i) =>
    localGetQuestionErrors(
      i as
        | { topicId?: number; disciplineId?: number; limit?: number }
        | undefined,
    ),
  "questionError.delete": (i) => localDeleteQuestionError(i as { id: number }),
  "questionError.setCause": (i) => localSetQuestionErrorCause(i as any),
  "questionError.causes": () => localGetErrorCauses(),
  // Mentor / Flashcards (v10 Standalone)
  "mentor.chat": (i) => localMentorChat(i as any),
  "mentor.generateAdaptiveQuestion": (i) =>
    localGenerateAdaptiveQuestion(i as any),
  "mentor.testKey": (i) => localTestAiKey(i as any),
  "mentor.reviewSimulado": (i) => localReviewSimulado(i as any),
  "study.overview": (i) => localStudyOverview(i as any),
  "study.startPretest": (i) => localStartPretest(i as { topicId: number }),
  "study.savePrediction": (i) => localSavePrediction(i as any),
  "study.retentionMetrics": () => localStudyRetentionMetrics(),
  "study.weeklyReview": () => localStudyWeeklyReview(),
  "study.recordSession": (i) =>
    localStudyRecordSession(i as Parameters<typeof localStudyRecordSession>[0]),
  "study.masterySnapshot": () =>
    localStudyMasterySnapshot().then((topics) => ({ topics })),
  "study.recordAttempt": (i) =>
    localRecordQuestionAttempt(
      i as Parameters<typeof localRecordQuestionAttempt>[0],
    ),
  "study.recordTecAnswer": (i) =>
    localRecordTecAnswer(i as Parameters<typeof localRecordTecAnswer>[0]),
  "study.importCaderno": (i) =>
    localImportCaderno(i as Parameters<typeof localImportCaderno>[0]),
  "study.errorPatterns": () => localStudyErrorPatterns(),
  "mentor.getTecRegressions": (i) => localGetTecRegressions(i as any),
  "flashcard.list": () => localFlashcardList(),
  "flashcard.create": (i) => localFlashcardCreate(i as any),
  "flashcard.update": (i) => localFlashcardUpdate(i as any),
  "flashcard.delete": (i) => localFlashcardDelete(i as any),
  "flashcard.review": (i) => localFlashcardReview(i as any),
  "essay.list": (i) => localEssayList((i as any)?.disciplineId),
  "essay.save": (i) => localEssaySave(i as any),
  "essay.update": (i) => localEssayUpdate((i as any).id, (i as any).data),
  "essay.delete": (i) => localEssayDelete((i as any).id),
  "subjectiveAnswer.save": (i) => localSaveSubjectiveAnswer(i as any),
  "subjectiveAnswer.list": (i) => localGetSubjectiveAnswers(i as any),
  "subjectiveAnswer.delete": (i) => localDeleteSubjectiveAnswer(i as any),
  "mentor.getWeakProfile": () => localGetWeakProfile(),
  "mentor.getDailyBriefing": () => localGetDailyBriefing(),
  "mentor.diagnoseError": (i) => localDiagnoseError(i as any),
  "ai.processText": (i) => localProcessText(i as any),
  "ai.generateFlashcardsFromText": (i) =>
    localGenerateFlashcardsFromText(i as any),
  "mentor.getConceptConfusions": () => localGetConceptConfusions(),
  "mentor.saveConceptConfusion": (i) => localSaveConceptConfusion(i as any),
  "study.attemptTrends": () => localStudyAttemptTrends(),
  // v6.9.7: calibração, lei seca e consolidação no APK (mesmas funções puras).
  "study.calibration": () => localStudyCalibration(),
  "flashcard.buildLeiSeca": (i) =>
    localBuildLeiSeca(i as { topicIds?: number[] } | undefined),
  "flashcard.leiSecaToday": () => localLeiSecaToday(),
  "discipline.consolidationPreview": () =>
    localDisciplineConsolidationPreview(),
  "discipline.consolidate": () => localConsolidateDisciplines(),
  "mockExam.paceReport": () => Promise.resolve(null),
  "flashcard.generateFromErrors": (i) =>
    localGenerateFlashcardsFromErrors(i as { errorIds?: number[] } | undefined),
  "edital.overview": () => localEditalOverview(),
  "edital.setActiveExam": (i) =>
    localEditalSetActiveExam(i as { examId: string }),
  "edital.coverage": () => localEditalCoverage(),
  "edital.suggestLinks": (i) =>
    localEditalSuggestLinks(i as { apply?: boolean; threshold?: number }),
  "edital.linkRow": (i) => localEditalLinkRow(i as any),
  "v10.updateV10Settings": (i) =>
    localUpdateSettings(i as Record<string, unknown>),
  "v10.saveRecallRating": (i) => Promise.resolve({ success: true }),
  // v6.9.5: paridade offline da captura do TEC na Sessão Guiada.
  "tec.liveActivity": (i) =>
    localTecLiveActivity(
      i as { since: string; until?: string; limit?: number },
    ),
  "tec.addManualAnswer": (i) =>
    localTecAddManualAnswer(i as { correct: boolean; topicId?: number | null }),
  "tec.undoLastAnswer": (i) => localTecUndoLastAnswer(i as { since: string }),
  "tec.pendingClassifications": () => localTecPendingClassifications(),
  "tec.resolvePending": (i) => localTecResolvePending(i),
  "tec.setAutoCompleteAfter": () => Promise.resolve({ ok: true, value: 0 }),
  // v6.9.6: Caderno Vivo no APK — lê/cria o que é dado do aluno; o que depende
  // do servidor (PDF e IA) responde com uma explicação clara.
  "learning.list": () => localLearningList(),
  "learning.get": (i) => localLearningGet(i as { docId?: string }),
  "learning.remove": (i) => localLearningRemove(i as { docId: string }),
  // Mensagem honesta em vez de "Procedimento local não implementado".
  "learning.sectionQuestions": async () => {
    throw new Error(
      "Gerar perguntas de uma seção usa a sua chave de IA e precisa de internet.",
    );
  },
  "learning.analogies": async () => {
    throw new Error(
      "Criar analogias usa a sua chave de IA e precisa de internet.",
    );
  },
  "learning.microWorld": async () => {
    throw new Error(
      "Criar micro-mundo usa a sua chave de IA e precisa de internet.",
    );
  },
  "learning.importPdf": (i) =>
    localLearningImportPdf(i as { base64: string; fileName?: string }),
  "learning.analogiesFor": (i) =>
    localLearningAnalogies(i as { topicName?: string } | undefined),
  "learning.saveAnalogy": (i) =>
    localLearningSaveAnalogy(i as Record<string, unknown>),
  "learning.microWorldsFor": (i) =>
    localLearningMicroWorlds(i as { topicName?: string } | undefined),
  "learning.saveMicroWorld": (i) =>
    localLearningSaveMicroWorld(i as Record<string, unknown>),
  "learning.lessonsFor": (i) =>
    localLearningLessons(i as { topicName?: string } | undefined),
  "learning.saveLesson": (i) => localLearningSaveLesson(i as any),
  "learning.deleteLesson": (i) =>
    localLearningDeleteLesson(i as { lessonId: string }),
  "learning.lessonStudiedToday": (i) =>
    localLessonStudiedToday(i as { topicName: string }),
  "learning.markLessonStudied": (i) =>
    localMarkLessonStudied(i as { topicName: string; topicId?: number }),
  "learning.startGeneration": () => localStartGeneration(),
  "learning.generationStatus": () => localGenerationStatus(),
  "learning.cancelGeneration": () => localCancelGeneration(),
  // v6.9.11 (B7): micro-recuperação da seção também no aparelho.
  "learning.saveSectionRecall": (i) => localSaveSectionRecall(i as any),
  "learning.sectionRecalls": (i) =>
    localGetSectionRecalls(i as { docId: string }),
};

export function createLocalLink(): TRPCLink<AppRouter> {
  return () =>
    ({ op, next }) => {
      const handler = PROCEDURES[op.path];
      if (!handler) {
        return observable((observer) => {
          observer.error(
            TRPCClientError.from(
              new Error(`Procedimento local não implementado: ${op.path}`),
            ),
          );
        });
      }
      return observable((observer) => {
        handler(op.input)
          .then((data) => {
            try {
              const serialized = superjson.serialize(data);
              const json = { result: { data: serialized } };
              const transformed = transformResult(json, superjson);
              if (!transformed.ok) {
                observer.error(TRPCClientError.from(transformed.error));
                return;
              }
              observer.next({ result: transformed.result });
              observer.complete();
            } catch {
              // Fallback: pass raw data without transformation
              observer.next({ result: { type: "data", data } } as any);
              observer.complete();
            }
          })
          .catch((err) => {
            observer.error(
              err instanceof TRPCClientError ? err : TRPCClientError.from(err),
            );
          });
      });
    };
}
