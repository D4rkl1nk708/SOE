import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as storage from "./jsonStorage";
import { getStudyLedger } from "./studyLedger";
import {
  findBestDisciplineMatch,
  findBestTopicMatch,
} from "./tecDisciplineMatcher";
import {
  getDataHealth,
  getErrorIntelligence,
  getStudyOverview,
  getWeeklyReview,
  previewFsrsSchedule,
} from "./studyIntelligence";

const confidenceSchema = z.enum(["chute", "acho", "certeza"]).nullable();

export const studyRouter = router({
  ledger: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(500).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return getStudyLedger(ctx.user.id, input?.limit);
    }),

  overview: protectedProcedure
    .input(
      z
        .object({
          minutes: z.number().min(30).max(720).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return getStudyOverview(ctx.user.id, input?.minutes);
    }),

  recordAttempt: protectedProcedure
    .input(
      z.object({
        topicId: z.number(),
        disciplineId: z.number().optional(),
        questionId: z.string().optional(),
        banca: z.string().optional(),
        answered: z.boolean(),
        correct: z.boolean(),
        confidence: confidenceSchema,
        confidencePhase: z
          .enum(["before_result", "after_result"])
          .nullable()
          .optional(),
        seconds: z.number().min(0).max(86400).optional(),
        source: z.enum(["manual", "tec", "simulado"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return storage.recordQuestionAttempt(ctx.user.id, {
        ...input,
        confidencePhase: input.confidence
          ? (input.confidencePhase ?? "before_result")
          : null,
      });
    }),

  /**
   * Registra a resposta vinda da captura do TEC com o grau de confiança
   * informado pelo usuário (chute / dúvida / certeza).
   */
  recordTecAnswer: protectedProcedure
    .input(
      z.object({
        disciplina: z.string().min(1),
        assunto: z.string().min(1),
        correct: z.boolean(),
        confidence: confidenceSchema,
        seconds: z.number().min(0).max(86400).optional(),
        questionId: z.string().optional(),
        banca: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [disciplines, topics, settings] = await Promise.all([
        storage.getDisciplinesByUser(ctx.user.id),
        storage.getTopicsByUser(ctx.user.id),
        storage.getUserSettings(ctx.user.id),
      ]);

      const discMatch = findBestDisciplineMatch(
        disciplines,
        input.disciplina,
        input.assunto,
        settings?.tecDisciplineAliases,
        topics,
      );
      const discipline = discMatch.discipline;
      if (!discipline) return { ok: false, reason: "discipline_not_found" };

      const topicMatch = findBestTopicMatch(
        topics,
        input.assunto,
        discipline.id,
      );
      const topic = topicMatch.topic;
      if (!topic) return { ok: false, reason: "topic_not_found" };

      const attempt = await storage.recordQuestionAttempt(ctx.user.id, {
        topicId: topic.id,
        disciplineId: discipline.id,
        answered: true,
        correct: input.correct,
        confidence: input.confidence ?? null,
        confidencePhase: input.confidence ? "after_result" : null,
        seconds: input.seconds,
        questionId: input.questionId,
        banca: input.banca,
        source: "tec",
      });

      return {
        ok: true,
        attemptId: attempt.id,
        topicId: topic.id,
        topicName: topic.name,
      };
    }),

  calibration: protectedProcedure.query(async ({ ctx }) => {
    const overview = await getStudyOverview(ctx.user.id);
    return overview.calibration;
  }),

  errorPatterns: protectedProcedure.query(async ({ ctx }) => {
    return getErrorIntelligence(ctx.user.id);
  }),

  dataHealth: protectedProcedure.query(async ({ ctx }) => {
    return getDataHealth(ctx.user.id);
  }),

  weeklyReview: protectedProcedure.query(async ({ ctx }) => {
    return getWeeklyReview(ctx.user.id);
  }),

  fsrsPreview: protectedProcedure
    .input(z.object({ days: z.number().min(7).max(120).optional() }).optional())
    .query(async ({ ctx, input }) => {
      return previewFsrsSchedule(ctx.user.id, input?.days ?? 30);
    }),
});
