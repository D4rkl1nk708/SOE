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
  "revision.markIgnored": (i) =>
    localRevisionMarkIgnored(i as { id: number; ignored: boolean }),
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
  // Mentor / Flashcards (v10 Standalone)
  "mentor.chat": (i) => localMentorChat(i as any),
  "mentor.getTecRegressions": (i) => localGetTecRegressions(i as any),
  "flashcard.list": () => localFlashcardList(),
  "flashcard.create": (i) => localFlashcardCreate(i as any),
  "flashcard.update": (i) => localFlashcardUpdate(i as any),
  "flashcard.delete": (i) => localFlashcardDelete(i as any),
  "flashcard.review": (i) => localFlashcardReview(i as any),
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
  "v10.updateV10Settings": (i) =>
    localUpdateSettings(i as Record<string, unknown>),
  "v10.saveRecallRating": (i) => Promise.resolve({ success: true }),
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
