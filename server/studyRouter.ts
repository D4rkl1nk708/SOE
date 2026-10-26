import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as storage from "./jsonStorage";
import {
  getDataHealth,
  getErrorIntelligence,
  getStudyOverview,
  getWeeklyReview,
  previewFsrsSchedule,
} from "./studyIntelligence";

const confidenceSchema = z.enum(["chute", "acho", "certeza"]).nullable();

export const studyRouter = router({
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
