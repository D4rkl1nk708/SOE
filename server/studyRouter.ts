import { protectedProcedure, router } from "./_core/trpc";
import { callAiProvider } from "./aiProviders";
import { extractJSON } from "./mentorRouter";
import { computeRetentionMetrics } from "../shared/retention";
import { calibrationCurve, summarizePredictions } from "../shared/prediction";
import { z } from "zod";
import * as storage from "./jsonStorage";
import { getStudyLedger } from "./studyLedger";
import {
  backlogSummary,
  planSessionReschedule,
  selectBacklog,
  suggestBacklogAction,
} from "./revisionPlanning";
import { formatDateForDb } from "../shared/scheduling";
import { computeDisciplineTrends } from "../shared/attemptTrends";
import {
  findBestDisciplineMatch,
  findBestTopicMatch,
} from "./tecDisciplineMatcher";
import {
  getDataHealth,
  getErrorIntelligence,
  getMasterySnapshot,
  getStudyOverview,
  getWeeklyReview,
  previewFsrsSchedule,
} from "./studyIntelligence";
import {
  calibrationAdvice,
  summarizeCalibration,
  summarizeCalibrationByDiscipline,
} from "../shared/calibration";

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

  /** Domínio por tópico (resolvidas/acertos/prontidão) para medir a sessão. */
  masterySnapshot: protectedProcedure.query(async ({ ctx }) => {
    return { topics: await getMasterySnapshot(ctx.user.id) };
  }),

  /** Registra a sessão guiada como dado (início, fim, tópico, resultado). */
  recordSession: protectedProcedure
    .input(
      z.object({
        startedAt: z.string(),
        endedAt: z.string(),
        minutes: z.number().min(0).max(1440),
        accuracy: z.number().min(0).max(100),
        questions: z.number().min(0),
        correct: z.number().min(0),
        topicId: z.number().optional(),
        topicName: z.string().optional(),
        disciplineId: z.number().optional(),
        blockId: z.string().optional(),
        revisionCompleted: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await storage.logGuidedSession(ctx.user.id, input);
      return { success: true };
    }),

  /** Resumo do backlog de revisões vencidas (triagem honesta, sem mexer no 25/50). */
  revisionBacklog: protectedProcedure.query(async ({ ctx }) => {
    const revisions = await storage.getRevisionsByUser(ctx.user.id);
    const today = formatDateForDb(new Date());
    const summary = backlogSummary(revisions as any, today);
    return { ...summary, suggestion: suggestBacklogAction(summary) };
  }),

  /**
   * Triagem explícita do backlog. `arquivar` marca como ignoradas; `reagendar`
   * espalha as pendências antigas nos próximos 14 dias. Nunca cria revisão nova
   * e nunca altera a lógica 25/50.
   */
  triageBacklog: protectedProcedure
    .input(
      z.object({
        action: z.enum(["arquivar", "reagendar"]),
        olderThanDays: z.number().min(1).max(3650).default(90),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const revisions = await storage.getRevisionsByUser(ctx.user.id);
      const today = formatDateForDb(new Date());
      const selected = selectBacklog(
        revisions as any,
        today,
        input.olderThanDays,
      );
      for (let index = 0; index < selected.length; index += 1) {
        if (input.action === "arquivar") {
          await storage.markRevisionIgnored(
            selected[index].id,
            ctx.user.id,
            true,
          );
        } else {
          const target = new Date();
          target.setDate(target.getDate() + 1 + Math.floor(index / 10));
          await storage.rescheduleRevision(
            selected[index].id,
            ctx.user.id,
            formatDateForDb(target),
          );
        }
      }
      return { affected: selected.length, action: input.action };
    }),

  /** Reagenda a revisão pendente do tópico para a data sugerida pela sessão. */
  applySessionRevision: protectedProcedure
    .input(
      z.object({
        topicId: z.number(),
        suggestedDate: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const revisions = await storage.getRevisionsByUser(ctx.user.id);
      const today = formatDateForDb(new Date());
      const plan = planSessionReschedule(
        revisions as any,
        input.topicId,
        input.suggestedDate,
        today,
      );
      if (!plan) return { rescheduled: false as const };
      await storage.rescheduleRevision(
        plan.revisionId,
        ctx.user.id,
        plan.newDate,
      );
      return {
        rescheduled: true as const,
        revisionId: plan.revisionId,
        newDate: plan.newDate,
      };
    }),

  /** Últimas sessões registradas. */
  recentSessions: protectedProcedure
    .input(
      z.object({ limit: z.number().min(1).max(100).optional() }).optional(),
    )
    .query(async ({ ctx, input }) => {
      return storage.getRecentStudySessions(ctx.user.id, input?.limit ?? 20);
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
      if (!discipline) {
        // v6.9.7 (item 1.3): sem disciplina classificada a confiança ainda é
        // anotada na resposta capturada — perder o dado era o bug do item.
        const attached = await storage.attachConfidenceToLatestTecAttempt(
          ctx.user.id,
          input.correct,
          input.confidence,
          input.seconds,
        );
        return attached
          ? { ok: true, attached: true, attemptId: attached.id }
          : { ok: false, reason: "discipline_not_found" };
      }

      const topicMatch = findBestTopicMatch(
        topics,
        input.assunto,
        discipline.id,
      );
      const topic = topicMatch.topic;
      if (!topic) {
        const attached = await storage.attachConfidenceToLatestTecAttempt(
          ctx.user.id,
          input.correct,
          input.confidence,
          input.seconds,
        );
        return attached
          ? { ok: true, attached: true, attemptId: attached.id }
          : { ok: false, reason: "topic_not_found" };
      }

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

  /**
   * Importação explícita de um caderno do TEC (opcional, iniciada pelo usuário).
   * Só grava totais absolutos por tópico — nunca sobrescreve para baixo.
   */
  importCaderno: protectedProcedure
    .input(
      z.object({
        rows: z
          .array(
            z.object({
              disciplina: z.string().min(1),
              assunto: z.string().min(1),
              acertos: z.number().min(0).max(100000),
              erros: z.number().min(0).max(100000),
            }),
          )
          .min(1)
          .max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [disciplines, topics, settings] = await Promise.all([
        storage.getDisciplinesByUser(ctx.user.id),
        storage.getTopicsByUser(ctx.user.id),
        storage.getUserSettings(ctx.user.id),
      ]);

      let imported = 0;
      let skipped = 0;
      const details: Array<{
        assunto: string;
        disciplina: string;
        before?: number;
        after?: number;
        reason?: string;
      }> = [];

      for (const row of input.rows) {
        const discMatch = findBestDisciplineMatch(
          disciplines,
          row.disciplina,
          row.assunto,
          settings?.tecDisciplineAliases,
          topics,
        );
        const discipline = discMatch.discipline;
        if (!discipline) {
          skipped += 1;
          details.push({
            assunto: row.assunto,
            disciplina: row.disciplina,
            reason: "discipline_not_found",
          });
          continue;
        }

        const topicMatch = findBestTopicMatch(
          topics,
          row.assunto,
          discipline.id,
        );
        const topic = topicMatch.topic;
        if (!topic) {
          skipped += 1;
          details.push({
            assunto: row.assunto,
            disciplina: row.disciplina,
            reason: "topic_not_found",
          });
          continue;
        }

        const prevCorrect = Number(topic.performance?.correctCount) || 0;
        const prevErrors = Number(topic.performance?.errorCount) || 0;
        const nextCorrect = Math.max(prevCorrect, row.acertos);
        const nextErrors = Math.max(prevErrors, row.erros);

        if (nextCorrect === prevCorrect && nextErrors === prevErrors) {
          skipped += 1;
          details.push({
            assunto: topic.name,
            disciplina: discipline.name,
            before: prevCorrect + prevErrors,
            after: prevCorrect + prevErrors,
            reason: "already_up_to_date",
          });
          continue;
        }

        await storage.setTopicPerformance(topic.id, ctx.user.id, {
          correctCount: nextCorrect,
          errorCount: nextErrors,
        });
        imported += 1;
        details.push({
          assunto: topic.name,
          disciplina: discipline.name,
          before: prevCorrect + prevErrors,
          after: nextCorrect + nextErrors,
        });
      }

      return {
        ok: true,
        imported,
        skipped,
        total: input.rows.length,
        details: details.slice(0, 50),
      };
    }),

  /**
   * Acerto por disciplina: últimos 7 dias vs os 30 dias anteriores.
   * Com menos de 10 tentativas em qualquer janela a resposta é "sem dados
   * suficientes" — nunca uma seta em cima de 2 questões.
   */
  attemptTrends: protectedProcedure.query(async ({ ctx }) => {
    const [attempts, disciplines, topics] = await Promise.all([
      storage.getAllQuestionAttempts(ctx.user.id),
      storage.getDisciplinesByUser(ctx.user.id),
      storage.getTopicsByUser(ctx.user.id),
    ]);
    const trends = computeDisciplineTrends(
      attempts as any,
      disciplines.map((discipline) => ({
        id: discipline.id,
        name: discipline.name,
      })),
      topics.map((topic) => ({
        id: topic.id,
        disciplineId: topic.disciplineId,
      })),
    );
    return {
      trends,
      totalAttempts: attempts.length,
      windowDays: 7,
      baselineDays: 30,
    };
  }),

  /**
   * v6.9.7 (item 1): calibração certeza × acerto.
   *
   * Devolve o resumo do usuário, o recorte por disciplina (top 5 com dados),
   * as frases de risco e o número de tentativas sem confiança declarada —
   * a UI usa isso para convidar o aluno em vez de mostrar gráfico vazio.
   */
  calibration: protectedProcedure.query(async ({ ctx }) => {
    const [attempts, disciplines, legacyOverview, settings] = await Promise.all(
      [
        storage.getAllQuestionAttempts(ctx.user.id),
        storage.getDisciplinesByUser(ctx.user.id),
        getStudyOverview(ctx.user.id),
        storage.getUserSettings(ctx.user.id),
      ],
    );
    // v6.9.11 (B1): pré-teste é linha de base, não entra na acurácia.
    const graded = (attempts as any[]).filter(
      (attempt) => attempt.context !== "pretest",
    );
    const summary = summarizeCalibration(graded as any);
    const predictions = summarizePredictions(
      (settings?.accuracyPredictions || [])
        .filter((item) => typeof item.actualPct === "number")
        .map((item) => ({
          predictedPct: item.predictedPct,
          actualPct: item.actualPct as number,
        })),
    );
    const predictionRecords = (settings?.accuracyPredictions || [])
      .filter((item) => typeof item.actualPct === "number")
      .map((item) => ({
        predictedPct: item.predictedPct,
        actualPct: item.actualPct as number,
      }));
    const brierValue =
      predictionRecords.length > 0
        ? Number(
            (
              predictionRecords.reduce((sum, item) => {
                const predicted = item.predictedPct / 100;
                const actual = item.actualPct / 100;
                return sum + (predicted - actual) ** 2;
              }, 0) / predictionRecords.length
            ).toFixed(3),
          )
        : null;
    return {
      ...summary,
      brier: brierValue,
      predictionCurve: calibrationCurve(predictionRecords),
      advice: calibrationAdvice(summary),
      byDiscipline: summarizeCalibrationByDiscipline(
        graded as any,
        disciplines.map((discipline) => ({
          id: discipline.id,
          name: discipline.name,
        })),
        5,
      ),
      /** v6.9.11 (B4/4.7): previsão × obtido + erro em pontos percentuais. */
      predictions,
      /** Brier/overconfidence da versão anterior (StudyPlan ainda usa). */
      legacy: legacyOverview.calibration,
      generatedAt: new Date().toISOString(),
    };
  }),

  errorPatterns: protectedProcedure.query(async ({ ctx }) => {
    return getErrorIntelligence(ctx.user.id);
  }),

  dataHealth: protectedProcedure.query(async ({ ctx }) => {
    return getDataHealth(ctx.user.id);
  }),

  /**
   * v6.9.8 (item 2.4): correção segura de um achado do cartão "Saúde dos
   * dados". Sempre com backup antes de gravar. Nada destrutivo.
   */
  fixDataHealth: protectedProcedure
    .input(
      z.object({
        fix: z.enum([
          "reorder-disciplines",
          "delete-empty-mock-exams",
          "mark-errors-statement-pending",
          "reschedule-stale-flashcards",
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return storage.applyDataHealthFix(
        ctx.user.id,
        input.fix,
        formatDateForDb(new Date()),
      );
    }),

  weeklyReview: protectedProcedure.query(async ({ ctx }) => {
    return getWeeklyReview(ctx.user.id);
  }),

  fsrsPreview: protectedProcedure
    .input(z.object({ days: z.number().min(7).max(120).optional() }).optional())
    .query(async ({ ctx, input }) => {
      return previewFsrsSchedule(ctx.user.id, input?.days ?? 30);
    }),

  /**
   * v6.9.11 (B1/4.4): pré-teste de 5 questões antes do conteúdo.
   * Banco de erros do tópico primeiro; IA só quando faltar questão E houver
   * chave cadastrada (uma única chamada). Sem nada, { available: 0 }.
   */
  startPretest: protectedProcedure
    .input(z.object({ topicId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const bank = await storage.startPretest(ctx.user.id, input.topicId);
      if (bank.available > 0) return bank;

      const settings = await storage.getUserSettings(ctx.user.id);
      const apiKey = String(settings?.aiApiKey || "").trim();
      if (!apiKey) return bank;

      const topics = await storage.getTopicsByUser(ctx.user.id);
      const topic = topics.find((item) => item.id === input.topicId);
      const disciplines = await storage.getDisciplinesByUser(ctx.user.id);
      const discipline = disciplines.find(
        (item) => item.id === topic?.disciplineId,
      );
      try {
        const raw = await callAiProvider(
          (settings?.aiProvider as "gemini" | "openai" | "claude") || "gemini",
          apiKey,
          `Você é professor de concursos públicos. Gere 5 questões de múltipla escolha (A-D) sobre o tópico "${topic?.name || "tópico"}"${discipline ? ` da disciplina "${discipline.name}"` : ""}.
Regras: uma única alternativa correta; sem "todas as anteriores"; nível de banca.
Responda SOMENTE JSON: {"questions":[{"statement":"...","alternatives":[{"letter":"A","text":"..."}],"correctAnswer":"A"}]}`,
          1600,
        );
        const parsed = extractJSON(raw) as any;
        const questions = (
          Array.isArray(parsed?.questions) ? parsed.questions : []
        )
          .slice(0, 5)
          .map((item: any, index: number) => ({
            id: `pretest-ai-${index + 1}`,
            statement: String(item?.statement || ""),
            alternatives: Array.isArray(item?.alternatives)
              ? item.alternatives.map((alt: any) => ({
                  letter: String(alt?.letter || ""),
                  text: String(alt?.text || ""),
                }))
              : [],
            correctAnswer: item?.correctAnswer
              ? String(item.correctAnswer)
              : undefined,
            topicId: input.topicId,
            disciplineId: discipline?.id || 0,
            source: "ai" as const,
          }))
          .filter(
            (item: any) => item.statement && item.alternatives.length >= 2,
          );
        if (questions.length === 0) return bank;
        return {
          available: questions.length,
          questions,
          source: "ai" as const,
          topicName: bank.topicName,
        };
      } catch {
        // Falha de IA não pode quebrar o início do tópico.
        return bank;
      }
    }),

  /** v6.9.11 (B4/4.7): grava a previsão antes do bloco e fecha com o obtido. */
  savePrediction: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        predictedPct: z.number().min(0).max(100),
        actualPct: z.number().min(0).max(100).optional(),
        questions: z.number().min(0).optional(),
        topicId: z.number().nullable().optional(),
        disciplineId: z.number().nullable().optional(),
        source: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return storage.savePrediction(ctx.user.id, input);
    }),

  /**
   * v6.9.11 (C4 / seção 6): métricas de retenção. Amostra pequena devolve
   * "amostra insuficiente (n=X)" — nunca número inventado.
   */
  retentionMetrics: protectedProcedure.query(async ({ ctx }) => {
    const [attempts, settings, overview] = await Promise.all([
      storage.getAllQuestionAttempts(ctx.user.id),
      storage.getUserSettings(ctx.user.id),
      getStudyOverview(ctx.user.id),
    ]);
    const sessions = Array.isArray(settings?.studySessionLog)
      ? settings!.studySessionLog!
      : [];
    const studySeconds = sessions.reduce(
      (sum, session) =>
        sum + Math.max(0, Number(session.durationMin) || 0) * 60,
      0,
    );
    const graded = (attempts as any[]).filter(
      (attempt) => attempt.context !== "pretest",
    );
    return computeRetentionMetrics({
      attempts: graded as any,
      studySeconds,
      predictions: (settings?.accuracyPredictions || [])
        .filter((item) => typeof item.actualPct === "number")
        .map((item) => ({
          predictedPct: item.predictedPct,
          actualPct: item.actualPct as number,
        })),
      weightedCoveragePct: overview.coverage.weightedCoveragePct,
      proficiency: overview.coverage.readiness,
    });
  }),
});
