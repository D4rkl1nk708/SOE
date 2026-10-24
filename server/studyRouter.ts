import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getStudyOverview } from "./studyIntelligence";

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
});
