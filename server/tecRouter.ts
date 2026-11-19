import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as storage from "./jsonStorage";
import {
  addManualAnswer,
  buildTecLiveActivity,
  listPendingClassifications,
  resolvePendingClassification,
  undoLastAnswer,
} from "./tecCaptureService";

/**
 * Router da captura do TEC (v6.9.5).
 *
 * O que o app móvel usa (contador ao vivo, +Acertei/+Errei, desfazer) tem
 * paridade offline em `client/src/lib/localDb.ts` + `localLink.ts`. A
 * classificação pendente depende da IA/servidor: offline ela responde vazio com
 * a mensagem de que é preciso estar online, sem quebrar a tela.
 */
export const tecRouter = router({
  /** Contador ao vivo da sessão: tentativas dentro de [since, until]. */
  liveActivity: protectedProcedure
    .input(
      z.object({
        since: z.string(),
        until: z.string().optional(),
        limit: z.number().min(1).max(30).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return buildTecLiveActivity(
        ctx.user.id,
        input.since,
        input.until,
        input.limit,
      );
    }),

  /** Rótulos do TEC que aguardam classificação (a pergunta ao usuário). */
  pendingClassifications: protectedProcedure.query(async ({ ctx }) => {
    return listPendingClassifications(ctx.user.id);
  }),

  /**
   * Decisão do usuário sobre um rótulo: escolher tópico existente, criar tópico
   * novo em uma disciplina ou ignorar. Grava o alias e reatribui as tentativas
   * pendentes do mesmo rótulo.
   */
  resolvePending: protectedProcedure
    .input(
      z.object({
        tecLabel: z.string().min(1),
        action: z.enum(["assign", "create", "ignore"]),
        topicId: z.number().nullish(),
        newTopicName: z.string().max(160).optional(),
        disciplineId: z.number().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return resolvePendingClassification(ctx.user.id, input);
    }),

  /** +Acertei / +Errei manuais para o que a captura não pegou. */
  addManualAnswer: protectedProcedure
    .input(
      z.object({
        correct: z.boolean(),
        topicId: z.number().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return addManualAnswer(ctx.user.id, {
        correct: input.correct,
        topicId: input.topicId ?? null,
      });
    }),

  /** Desfaz a última tentativa da janela (erro de clique, captura duplicada). */
  undoLastAnswer: protectedProcedure
    .input(z.object({ since: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return undoLastAnswer(ctx.user.id, { since: input.since });
    }),

  /** Quantas questões de um tópico concluem a revisão de teste (0 = desligado). */
  setAutoCompleteAfter: protectedProcedure
    .input(z.object({ value: z.number().min(0).max(50) }))
    .mutation(async ({ ctx, input }) => {
      await storage.updateUserSettings(ctx.user.id, {
        autoCompleteTestAfter: Math.trunc(input.value),
      });
      return { ok: true, value: Math.trunc(input.value) };
    }),
});
