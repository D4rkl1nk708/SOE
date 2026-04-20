import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as storage from "./jsonStorage";
import { mentorRouter, extractJSON } from "./mentorRouter";
import { callAiProvider } from "./aiProviders";
import { buildSchedule, formatDateForDb, getScheduleParams } from "../shared/scheduling";
import {
  getDashboardStats,
  getWeeklyStats,
  getPeriodComparison,
  getNeglectedDisciplines,
  getStudyHeatmap,
  getTodayStudyMinutes,
  getDisciplineRebalanceReport,
  getForgettingVelocityByDiscipline,
  getPeakHoursAnalysis,
  getTecRegressions,
  getWeakTopicsFromSnapshot,
} from "./analyticsService";
import { parseXlsxBuffer, parseHtml, processImportRows } from "./tecImportService";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    updateSettings: protectedProcedure
      .input(z.object({
        theme: z.enum(["light", "dark"]).optional(),
        examDate: z.string().optional(),
        examName: z.string().optional(),
        exams: z.array(z.object({
          id: z.string(),
          name: z.string(),
          date: z.string(),
        })).optional(),
        editalCycle: z.array(z.object({
          id: z.string(),
          title: z.string(),
          durationMinutes: z.number().min(1),
          done: z.boolean(),
        })).optional(),
        editalRows: z.array(z.object({
          id: z.string(),
          discipline: z.string(),
          topic: z.string(),
          completed: z.boolean(),
          notes: z.string().optional(),
          incidencia: z.number().optional(),
          quantidade: z.number().optional(),
          acerto: z.number().optional(),
          revisar: z.boolean().optional(),
          avancar: z.boolean().optional(),
          discursiva: z.boolean().optional(),
          isHeader: z.boolean().optional(),
        })).optional(),
        cycleConfig: z.object({
          type: z.enum(["numbered", "weekdays"]),
          count: z.number().min(1).max(7),
          selectedDays: z.array(z.number()).optional(),
          assignments: z.array(z.object({
            cycleKey: z.string(),
            disciplineId: z.number(),
          })).optional(),
        }).optional(),
        testIntervalDays: z.number().min(1).max(30).optional(),
        revisionIntervalDays: z.number().min(0).max(365).optional(),
        revisionSecondPhaseDays: z.number().min(1).max(365).optional(),
        dailyGoalMinutes: z.number().min(0).max(1440).optional(),
        onboardingCompleted: z.boolean().optional(),
        dashboardConfig: z.object({
          hiddenWidgets: z.array(z.string()).optional(),
          extraWidgets: z.array(z.string()).optional(),
        }).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await storage.updateUserSettings(ctx.user.id, input);
        return { success: true };
      }),
  }),
  exam: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const settings = await storage.getUserSettings(ctx.user.id);
      return settings?.exams || [];
    }),
    upsert: protectedProcedure
      .input(z.object({
        id: z.string().optional(),
        name: z.string().min(1).max(255),
        date: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const settings = await storage.getUserSettings(ctx.user.id);
        const exams = settings?.exams || [];
        const nextId = input.id || `exam-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
        const exists = exams.some((e) => e.id === nextId);
        const updatedExams = exists
          ? exams.map((e) => e.id === nextId ? { ...e, name: input.name, date: input.date } : e)
          : [...exams, { id: nextId, name: input.name, date: input.date }];
        await storage.updateUserSettings(ctx.user.id, { exams: updatedExams });
        return { success: true, id: nextId };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const settings = await storage.getUserSettings(ctx.user.id);
        const exams = settings?.exams || [];
        const updatedExams = exams.filter((e) => e.id !== input.id);
        await storage.updateUserSettings(ctx.user.id, { exams: updatedExams });
        return { success: true };
      }),
  }),

  // ============ DISCIPLINE PROCEDURES ============
  discipline: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return storage.getDisciplinesByUser(ctx.user.id);
    }),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(255),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#3B82F6"),
        weight: z.number().min(1).max(10).default(1),
      }))
      .mutation(async ({ ctx, input }) => {
        return storage.createDiscipline({
          userId: ctx.user.id,
          name: input.name,
          color: input.color,
          weight: input.weight,
        });
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        color: z.string().optional(),
        weight: z.number().optional(),
        studyTimeSeconds: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        await storage.updateDiscipline(id, ctx.user.id, data);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await storage.deleteDiscipline(input.id, ctx.user.id);
        return { success: true };
      }),
    reorder: protectedProcedure
      .input(z.object({ orderedIds: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => {
        await storage.reorderDisciplines(ctx.user.id, input.orderedIds);
        return { success: true };
      }),
  }),

  // ============ TOPIC PROCEDURES ============
  topic: router({
    list: protectedProcedure
      .input(z.object({ disciplineId: z.number().optional(), search: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const topics = await storage.getTopicsByUser(ctx.user.id, input);
        const disciplines = await storage.getDisciplinesByUser(ctx.user.id);
        return { topics, disciplines };
      }),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(500),
        disciplineId: z.number(),
        studyDate: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const studyDate = input.studyDate || formatDateForDb(new Date());
        const { id: topicId } = await storage.createTopic({
          userId: ctx.user.id,
          disciplineId: input.disciplineId,
          name: input.name,
          studyDate,
          notes: input.notes || null,
        });
        const settings = await storage.getUserSettings(ctx.user.id);
        const params = getScheduleParams(settings);
        const activities = buildSchedule(new Date(studyDate), params);
        const revisionRecords = activities.map(activity => ({
          userId: ctx.user.id,
          topicId,
          scheduledDate: formatDateForDb(activity.date),
          type: activity.type as "revision" | "test",
          revisionNumber: activity.revisionNumber,
          completed: false,
        }));
        await storage.createRevisions(revisionRecords);
        return { id: topicId, revisionsCreated: revisionRecords.length };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await storage.deleteTopic(input.id, ctx.user.id);
        return { success: true };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        disciplineId: z.number().optional(),
        notes: z.string().optional(),
        studyTimeSeconds: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        await storage.updateTopic(id, ctx.user.id, data);
        return { success: true };
      }),
    setPerformance: protectedProcedure
      .input(z.object({
        topicId: z.number(),
        correctCount: z.number().min(0),
        errorCount: z.number().min(0),
        errorByAttention: z.number().min(0).optional(),
        errorByForgetting: z.number().min(0).optional(),
        errorByTheory: z.number().min(0).optional(),
        errorByTrap: z.number().min(0).optional(),
        fastErrors: z.number().min(0).optional(),
        slowErrors: z.number().min(0).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await storage.setTopicPerformance(input.topicId, ctx.user.id, {
          correctCount: input.correctCount,
          errorCount: input.errorCount,
          errorByAttention: input.errorByAttention,
          errorByForgetting: input.errorByForgetting,
          errorByTheory: input.errorByTheory,
          errorByTrap: input.errorByTrap,
          fastErrors: input.fastErrors,
          slowErrors: input.slowErrors,
        });
        return { success: true };
      }),
    updateTopicNotes: protectedProcedure
      .input(z.object({
        topicId: z.number(),
        mantras: z.array(z.string()),
      }))
      .mutation(async ({ ctx, input }) => {
        await storage.updateTopicNotes(input.topicId, ctx.user.id, input.mantras);
        return { success: true };
      }),
    reorder: protectedProcedure
      .input(z.object({
        disciplineId: z.number(),
        orderedIds: z.array(z.number()),
      }))
      .mutation(async ({ ctx, input }) => {
        await storage.reorderTopics(ctx.user.id, input.disciplineId, input.orderedIds);
        return { success: true };
      }),
    resetAllStats: protectedProcedure
      .mutation(async ({ ctx }) => {
        await storage.resetAllTopicStats(ctx.user.id);
        return { success: true };
      }),
    addStudyTime: protectedProcedure
      .input(z.object({ topicId: z.number(), seconds: z.number().min(1) }))
      .mutation(async ({ ctx, input }) => {
        await storage.addTopicStudyTime(input.topicId, ctx.user.id, input.seconds);
        return { success: true };
      }),
  }),

  // ============ REVISION PROCEDURES ============
  revision: router({
    list: protectedProcedure
      .input(z.object({ completed: z.boolean().optional(), ignored: z.boolean().optional() }).optional())
      .query(async ({ ctx, input }) => {
        return storage.getRevisionsByUser(ctx.user.id, input);
      }),
    markCompleted: protectedProcedure
      .input(z.object({ id: z.number(), completed: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await storage.markRevisionCompleted(input.id, ctx.user.id, input.completed);
        return { success: true };
      }),
    updateLink: protectedProcedure
      .input(z.object({ id: z.number(), link: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await storage.updateRevisionLink(input.id, ctx.user.id, input.link);
        return { success: true };
      }),
    markIgnored: protectedProcedure
      .input(z.object({ id: z.number(), ignored: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await storage.markRevisionIgnored(input.id, ctx.user.id, input.ignored);
        return { success: true };
      }),
    reschedule: protectedProcedure
      .input(z.object({ id: z.number(), newDate: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await storage.rescheduleRevision(input.id, ctx.user.id, input.newDate);
        return { success: true };
      }),
  }),

  // ============ IMPORT PROCEDURES ============
  import: router({
    tecConcursos: protectedProcedure
      .input(z.object({ base64: z.string(), fileName: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const buffer = Buffer.from(input.base64, "base64");
          const rows = parseXlsxBuffer(buffer);
          const result = await processImportRows(ctx.user.id, rows);
          return { success: true, ...result };
        } catch (error: unknown) {
          throw new Error("Erro ao processar planilha: " + (error instanceof Error ? error.message : String(error)));
        }
      }),
    /**
     * tecConcursosScrape — importa desempenho diretamente da URL do perfil TEC.
     */
    tecConcursosScrape: protectedProcedure
      .input(z.object({ url: z.string().url() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const resp = await fetch(input.url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "Accept": "text/html,application/xhtml+xml",
              "Accept-Language": "pt-BR,pt;q=0.9",
            },
          });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}: não foi possível acessar a URL fornecida`);
          const html = await resp.text();
          const rows = parseHtml(html);
          if (rows.length === 0) {
            throw new Error(
              "Não foi possível extrair dados da URL fornecida. " +
              "Verifique se a URL é da página de Desempenho por Assunto do TEC Concursos e se você está logado. " +
              "Dica: para páginas que requerem login, use a importação via XLSX."
            );
          }
          const result = await processImportRows(ctx.user.id, rows);
          return { success: true, rowsParsed: rows.length, ...result };
        } catch (error: unknown) {
          throw new Error("Erro no scraping TEC: " + (error instanceof Error ? error.message : String(error)));
        }
      }),
    /**
     * generatePushToken — gera um token secreto para autenticar o userscript Tampermonkey.
     * O token é salvo nas settings do usuário e enviado pelo userscript no header X-SOE-Token.
     */
    generatePushToken: protectedProcedure.mutation(async ({ ctx }) => {
      const token = await storage.generatePushToken(ctx.user.id);
      return { token };
    }),

    /**
     * listCadernos — retorna os cadernos TEC já sincronizados via userscript.
     */
    listCadernos: protectedProcedure.query(async ({ ctx }) => {
      return storage.getCadernosTec(ctx.user.id);
    }),

    /**
     * deleteCaderno — remove um caderno da lista de sincronizados.
     */
    deleteCaderno: protectedProcedure
      .input(z.object({ cadernoId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await storage.deleteCadernoTec(ctx.user.id, input.cadernoId);
        return { success: true };
      }),

    /**
     * getPushToken — retorna o token de push atual do usuário (para exibir no painel).
     */
    getPushToken: protectedProcedure.query(async ({ ctx }) => {
      const settings = await storage.getUserSettings(ctx.user.id);
      return { token: settings?.pushToken ?? null };
    }),

    /**
     * getICalUrl — retorna a URL do feed iCal das revisões pendentes.
     * Gera um pushToken automaticamente se o usuário ainda não tiver um.
     */
    getICalUrl: protectedProcedure.query(async ({ ctx }) => {
      let settings = await storage.getUserSettings(ctx.user.id);
      let token = settings?.pushToken;
      if (!token) {
        token = await storage.generatePushToken(ctx.user.id);
      }
      return { token, path: `/api/ical/${token}` };
    }),

    exportBackup: protectedProcedure.query(async () => {
      return storage.exportDatabase();
    }),
    importBackup: protectedProcedure
      .input(z.object({ json: z.string() }))
      .mutation(async ({ input }) => {
        await storage.importDatabase(input.json);
        return { success: true };
      }),
  }),

  // ============ MOCK EXAM PROCEDURES ============
  mockExam: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return storage.getMockExamsByUser(ctx.user.id);
    }),
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        date: z.string(),
        correct: z.number(),
        wrong: z.number(),
        blank: z.number(),
        totalQuestions: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const score = input.correct - input.wrong;
        return storage.createMockExam({ ...input, userId: ctx.user.id, score });
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        date: z.string().optional(),
        correct: z.number().optional(),
        wrong: z.number().optional(),
        blank: z.number().optional(),
        totalQuestions: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        // Fetch current exam to compute score correctly when only one field changes
        const exams = await storage.getMockExamsByUser(ctx.user.id);
        const current = exams.find(e => e.id === id);
        const newCorrect = data.correct ?? current?.correct ?? 0;
        const newWrong = data.wrong ?? current?.wrong ?? 0;
        await storage.updateMockExam(id, ctx.user.id, { ...data, score: newCorrect - newWrong });
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await storage.deleteMockExam(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  // ============ NOTE PROCEDURES ============
  note: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return storage.getNotesByUser(ctx.user.id);
    }),
    upsert: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        disciplineId: z.number(),
        topicId: z.number().optional(),
        title: z.string(),
        content: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        await storage.upsertNote({ ...input, userId: ctx.user.id });
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        await storage.deleteNote(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  // ============ DASHBOARD & CALENDAR ============
  calendar: router({
    getData: protectedProcedure
      .input(z.object({ startDate: z.string(), endDate: z.string() }))
      .query(async ({ ctx, input }) => {
        return storage.getCalendarData(ctx.user.id, input.startDate, input.endDate);
      }),
  }),
  dashboard: router({
    getStats: protectedProcedure.query(async ({ ctx }) => {
      return getDashboardStats(ctx.user.id);
    }),
    getWeeklyStats: protectedProcedure.query(async ({ ctx }) => {
      return getWeeklyStats(ctx.user.id);
    }),
    getPeriodComparison: protectedProcedure
      .input(z.object({ days: z.number().default(7) }))
      .query(async ({ ctx, input }) => {
        return getPeriodComparison(ctx.user.id, input.days);
      }),
    getNeglectedDisciplines: protectedProcedure
      .input(z.object({ thresholdDays: z.number().default(7) }))
      .query(async ({ ctx, input }) => {
        return getNeglectedDisciplines(ctx.user.id, input.thresholdDays);
      }),
    getHeatmap: protectedProcedure
      .input(z.object({ months: z.number().default(12) }))
      .query(async ({ ctx, input }) => {
        return getStudyHeatmap(ctx.user.id, input.months);
      }),
    getTodayMinutes: protectedProcedure.query(async ({ ctx }) => {
      return { minutes: await getTodayStudyMinutes(ctx.user.id) };
    }),
  }),
  flashcard: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return storage.getFlashcardsByUser(ctx.user.id);
    }),
    create: protectedProcedure
      .input(z.object({
        disciplineId: z.number(),
        topicId: z.number().optional(),
        noteId: z.number().optional(),
        front: z.string().min(1),
        back: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        return storage.createFlashcard({ ...input, userId: ctx.user.id });
      }),
    update: protectedProcedure
      .input(z.object({ id: z.number(), front: z.string().optional(), back: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        await storage.updateFlashcard(input.id, ctx.user.id, { front: input.front, back: input.back });
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await storage.deleteFlashcard(input.id, ctx.user.id);
        return { success: true };
      }),
    review: protectedProcedure
      .input(z.object({ id: z.number(), quality: z.number().min(0).max(5) }))
      .mutation(async ({ ctx, input }) => {
        return storage.reviewFlashcard(input.id, ctx.user.id, input.quality);
      }),
  }),

  questionError: router({
    save: protectedProcedure
      .input(z.object({
        topicId: z.number(),
        disciplineId: z.number(),
        questionId: z.string().optional(),
        banca: z.string().optional(),
        year: z.number().optional(),
        contest: z.string().optional(),
        statement: z.string().min(1),
        alternatives: z.array(z.object({ letter: z.string(), text: z.string() })),
        userAnswer: z.string().optional(),
        correctAnswer: z.string().optional(),
        errorOrigin: z.enum(["attention", "forgetting", "theory", "trap"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return storage.saveQuestionError({ ...input, userId: ctx.user.id });
      }),

    list: protectedProcedure
      .input(z.object({
        topicId: z.number().optional(),
        disciplineId: z.number().optional(),
        limit: z.number().min(1).max(200).optional(),
        offset: z.number().min(0).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        return storage.getQuestionErrorsByUser(ctx.user.id, input ?? {});
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await storage.deleteQuestionError(input.id, ctx.user.id);
        return { success: true };
      }),

    analyze: protectedProcedure
      .input(z.object({
        id: z.number(),
        apiKey: z.string().min(1),
        provider: z.enum(["gemini", "openai", "claude"]).default("gemini"),
      }))
      .mutation(async ({ ctx, input }) => {
        const { items: errors } = await storage.getQuestionErrorsByUser(ctx.user.id, { limit: 200 });
        const e = errors.find(err => err.id === input.id);
        if (!e) throw new Error("Questão não encontrada.");

        const chosenText  = e.alternatives?.find(a => a.letter === e.userAnswer)?.text || "";
        const correctText = e.alternatives?.find(a => a.letter === e.correctAnswer)?.text || "";

        const prompt = `Você é um professor especialista em concursos públicos brasileiros.

Analise a questão abaixo que o aluno errou e faça um diagnóstico cirúrgico e objetivo.

--- Questão ${e.questionId || ""} (${e.banca || ""} ${e.year || ""}) ---
${e.statement}

${e.alternatives?.map(a => `${a.letter}) ${a.text}`).join("\n")}

${e.userAnswer ? `Aluno marcou: ${e.userAnswer}${chosenText ? ` — "${chosenText}"` : ""}` : ""}
${e.correctAnswer ? `Gabarito: ${e.correctAnswer}${correctText ? ` — "${correctText}"` : ""}` : ""}
${e.errorOrigin ? `Tipo do erro classificado: ${e.errorOrigin}` : ""}

Com base na questão acima, responda de forma direta e técnica:

1. **Onde está o erro**: Explique EXATAMENTE por que a alternativa correta é a correta e por que a marcada está errada. Use os próprios textos das alternativas — não fale de forma genérica.

2. **Conceito cobrado**: Qual é o ponto de lei, doutrina ou jurisprudência que essa questão testa? Enuncie-o de forma clara.

3. **Como não errar de novo**: Uma regra mnemônica, distinção-chave ou dica prática específica para esse conteúdo.

Responda em português, máximo 300 palavras. Sem introduções — vá direto ao diagnóstico.`;

        try {
          const analysisText = await callAiProvider(input.provider, input.apiKey, prompt, 1024);
          if (!analysisText) throw new Error("Resposta vazia da IA.");
          await storage.saveQuestionErrorAnalysis(input.id, ctx.user.id, analysisText);
          return { analysis: analysisText };
        } catch (err: unknown) {
          throw new Error(`Falha ao chamar IA: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),

    revisionTip: protectedProcedure
      .input(z.object({
        id: z.number(),
        apiKey: z.string().min(1),
        provider: z.enum(["gemini", "openai", "claude"]).default("gemini"),
      }))
      .mutation(async ({ ctx, input }) => {
        const { items: errors } = await storage.getQuestionErrorsByUser(ctx.user.id, { limit: 200 });
        const e = errors.find(err => err.id === input.id);
        if (!e) throw new Error("Questão não encontrada.");

        const correctText = e.alternatives?.find(a => a.letter === e.correctAnswer)?.text || "";

        const prompt = `Você é um professor de concursos públicos. Com base na questão abaixo que o aluno errou, escreva uma DICA DE REVISÃO curta e memorável.

Questão: ${e.statement}
Gabarito correto: ${e.correctAnswer}${correctText ? ` — "${correctText}"` : ""}
${e.errorOrigin ? `Tipo do erro: ${e.errorOrigin}` : ""}

Escreva uma dica de revisão com exatamente este formato:
    - 1 linha de título em negrito com o conceito-chave
    - Explicação detalhada da regra ou distinção fundamental de forma direta e completa
    - 1 linha de macete ou frase para fixar na memória (pode usar emoji se ajudar)
    
    Sem limite de palavras, seja completo e didático. Sem introdução. Vá direto ao ponto.`;

        try {
          const tip = await callAiProvider(input.provider, input.apiKey, prompt, 2048);
          if (!tip) throw new Error("Resposta vazia da IA.");
          await storage.saveQuestionErrorRevisionTip(input.id, ctx.user.id, tip);
          return { tip };
        } catch (err: unknown) {
          throw new Error(`Falha ao chamar IA: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),

    similarQuestions: protectedProcedure
      .input(z.object({
        id: z.number(),
        apiKey: z.string().min(1),
        provider: z.enum(["gemini", "openai", "claude"]).default("gemini"),
      }))
      .mutation(async ({ ctx, input }) => {
        const { items: errors } = await storage.getQuestionErrorsByUser(ctx.user.id, { limit: 200 });
        const e = errors.find(err => err.id === input.id);
        if (!e) throw new Error("Questão não encontrada.");

        const prompt = `Você é um professor de concursos públicos. Com base na questão abaixo, sugira 3 questões similares que o aluno deveria buscar para praticar.

Questão original (${e.banca || "banca"} ${e.year || ""}):
${e.statement}
Gabarito: ${e.correctAnswer}
${e.errorOrigin ? `Tipo do erro: ${e.errorOrigin}` : ""}

Retorne EXATAMENTE neste formato (sem introdução, sem comentários extras):

**Questão 1**
Banca: [nome da banca]
Tema: [tema específico cobrado]
O que buscar no TEC: [termo de busca exato para encontrar no TEC Concursos]
Por que praticar: [1 linha explicando o que essa questão vai reforçar]

**Questão 2**
Banca: [nome da banca]
Tema: [tema específico cobrado]
O que buscar no TEC: [termo de busca exato]
Por que praticar: [1 linha]

**Questão 3**
Banca: [nome da banca]
Tema: [tema específico cobrado]
O que buscar no TEC: [termo de busca exato]
Por que praticar: [1 linha]`;

        try {
          const similar = await callAiProvider(input.provider, input.apiKey, prompt, 2048);
          if (!similar) throw new Error("Resposta vazia da IA.");
          await storage.saveQuestionErrorSimilarQuestions(input.id, ctx.user.id, similar);
          return { similar };
        } catch (err: unknown) {
          throw new Error(`Falha ao chamar IA: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),

    generateFlashcard: protectedProcedure
      .input(z.object({
        id: z.number(),
        apiKey: z.string().min(1),
        provider: z.enum(["gemini", "openai", "claude"]).default("gemini"),
      }))
      .mutation(async ({ ctx, input }) => {
        const { items: errors } = await storage.getQuestionErrorsByUser(ctx.user.id, { limit: 200 });
        const e = errors.find(err => err.id === input.id);
        if (!e) throw new Error("Questão não encontrada.");

        const correctText = e.alternatives?.find(a => a.letter === e.correctAnswer)?.text || "";

        const prompt = `Você é um professor de concursos públicos. Com base na questão abaixo que o aluno errou, crie UM flashcard para memorização.

Questão: ${e.statement}
Gabarito: ${e.correctAnswer}${correctText ? ` — "${correctText}"` : ""}

Retorne APENAS um JSON válido, sem markdown, sem explicação, exatamente assim:
{"front": "pergunta direta e objetiva que testa o conceito cobrado (máx 2 linhas)", "back": "resposta clara e completa com a regra ou distinção fundamental (máx 3 linhas)"}`;

        try {
          const raw = await callAiProvider(input.provider, input.apiKey, prompt, 512);
          if (!raw) throw new Error("Resposta vazia da IA.");
          let parsed;
          try {
            parsed = extractJSON(raw) as { front: string; back: string };
          } catch (parseErr: unknown) {
            console.error("JSON parsing failed for flashcard:", parseErr.message);
            console.error("Raw AI response:", raw);
            throw new Error(`Falha ao processar flashcard da IA: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}. Resposta crua: ${raw.substring(0, 100)}...`);
          }
          if (!parsed.front || !parsed.back) throw new Error("Flashcard inválido gerado pela IA.");

          // Salva o flashcard no banco
          await storage.createFlashcard({
            userId: ctx.user.id,
            disciplineId: e.disciplineId,
            topicId: e.topicId || undefined,
            front: parsed.front,
            back: parsed.back,
          });
          await storage.markQuestionErrorFlashcardGenerated(input.id, ctx.user.id);
          return { front: parsed.front, back: parsed.back };
        } catch (err: unknown) {
          throw new Error(`Falha ao gerar flashcard: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
  }),

  ai: router({
    analyzeErrors: protectedProcedure
      .input(z.object({
        topicId: z.number().optional(),
        disciplineId: z.number().optional(),
        apiKey: z.string().min(1),
        provider: z.enum(["gemini", "openai", "claude"]).default("gemini"),
      }))
      .mutation(async ({ ctx, input }) => {
        const { items: errors } = await storage.getQuestionErrorsByUser(ctx.user.id, {
          topicId: input.topicId,
          disciplineId: input.disciplineId,
          limit: 30,
        });

        if (errors.length === 0) {
          return { analysis: "Nenhuma questão registrada ainda. Registre questões erradas no Modo Questões para obter diagnóstico." };
        }

        const grouped: Record<string, typeof errors> = {};
        for (const e of errors) {
          const key = `${e.topicId}`;
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(e);
        }

        const sections = Object.entries(grouped).map(([, errs]) => {
          const lines = errs.map(e => {
            const chosen = e.userAnswer ? `Você marcou: ${e.userAnswer}` : "";
            const correct = e.correctAnswer ? `Gabarito: ${e.correctAnswer}` : "";
            const chosenText = e.alternatives.find(a => a.letter === e.userAnswer)?.text || "";
            const correctText = e.alternatives.find(a => a.letter === e.correctAnswer)?.text || "";
            const origin = e.errorOrigin ? `Tipo do erro: ${e.errorOrigin}` : "";
            return [
              `--- Questão ${e.questionId || ""} (${e.banca || ""} ${e.year || ""}) ---`,
              e.statement,
              e.alternatives.map(a => `${a.letter}) ${a.text}`).join("\n"),
              chosen + (chosenText ? ` — "${chosenText}"` : ""),
              correct + (correctText ? ` — "${correctText}"` : ""),
              origin,
            ].filter(Boolean).join("\n");
          });
          const topicId = errs[0]?.topicId;
          return `=== TÓPICO ID ${topicId} (${errs.length} erro(s)) ===\n${lines.join("\n\n")}`;
        }).join("\n\n");

        const prompt = `Você é um professor especialista em concursos públicos brasileiros.

Analise as questões abaixo que o aluno errou e faça um diagnóstico cirúrgico dos padrões de confusão conceitual.

${sections}

Com base nas questões acima, responda:

1. **Diagnóstico preciso**: Para cada tópico com erros, identifique EXATAMENTE qual conceito o aluno está confundindo. Não fale em termos gerais — use os próprios enunciados e alternativas para explicar onde está o erro conceitual. Ex: "No Tópico X, você marcou B mas a correta é C porque você confundiu Y com Z — a diferença fundamental é..."

2. **Padrão de erro**: Há um padrão transversal? (ex: confunde institutos parecidos, cai em pegadinhas de banca, erra por distração no enunciado, etc.)

3. **O que estudar agora**: Liste os conceitos específicos que precisam ser revisados, com foco cirúrgico. Não diga "revise Direito Administrativo" — diga "revise a distinção entre X e Y, especialmente no que diz respeito a Z".

4. **Dica de prova**: Uma estratégia prática para não cair nesses erros na hora da prova.

Responda em português, de forma direta e técnica como um professor de cursinho. Máximo 500 palavras.`;

        try {
          const analysis = await callAiProvider(input.provider, input.apiKey, prompt, 1024);
          return { analysis };
        } catch (err: unknown) {
          throw new Error(`Falha ao chamar IA: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
  }),

  // ============ V10 NEW FEATURE ROUTES ============
  v10: router({
    saveRecallRating: protectedProcedure
      .input(z.object({
        revisionId: z.number(),
        rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
        freeRecallText: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await storage.saveRevisionRecallRating(input.revisionId, ctx.user.id, input.rating, input.freeRecallText);
        return { success: true };
      }),

    checkEarlyRevision: protectedProcedure
      .input(z.object({ topicId: z.number(), minDays: z.number().default(3) }))
      .query(async ({ ctx, input }) => {
        const lastDate = await storage.getLastRevisionDate(input.topicId, ctx.user.id);
        if (!lastDate) return { tooEarly: false, daysSince: null };
        const daysSince = Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000);
        return { tooEarly: daysSince < input.minDays, daysSince };
      }),

    logEmotion: protectedProcedure
      .input(z.object({ mood: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]) }))
      .mutation(async ({ ctx, input }) => {
        await storage.logEmotion(ctx.user.id, input.mood);
        return { success: true };
      }),

    getEmotionCorrelation: protectedProcedure
      .query(async ({ ctx }) => {
        const settings = await storage.getUserSettings(ctx.user.id);
        const log = settings?.emotionLog ?? [];
        const sessions = settings?.studySessionLog ?? [];
        const correlations: Array<{ mood: number; avgAccuracy: number; count: number }> = [];
        for (let mood = 1; mood <= 5; mood++) {
          const moodDays = log.filter(e => e.mood === mood).map(e => e.date.split("T")[0]);
          const accs = sessions.filter(s => moodDays.includes(s.date) && s.accuracy > 0).map(s => s.accuracy);
          if (accs.length > 0) {
            correlations.push({ mood, avgAccuracy: Math.round(accs.reduce((a, b) => a + b, 0) / accs.length * 100) / 100, count: accs.length });
          }
        }
        return correlations;
      }),

    logStudySession: protectedProcedure
      .input(z.object({
        hourStart: z.number().min(0).max(23),
        durationMin: z.number().min(1),
        accuracy: z.number().min(0).max(1),
        disciplineId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await storage.logStudySession(ctx.user.id, input.hourStart, input.durationMin, input.accuracy, input.disciplineId);
        return { success: true };
      }),

    getPeakHours: protectedProcedure
      .query(async ({ ctx }) => {
        return getPeakHoursAnalysis(ctx.user.id);
      }),

    logStudyEnd: protectedProcedure
      .input(z.object({ endHour: z.number().min(0).max(23), alertIssued: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await storage.logStudyEndTime(ctx.user.id, input.endHour, input.alertIssued);
        return { success: true };
      }),

    getDisciplineRebalance: protectedProcedure
      .query(async ({ ctx }) => {
        return getDisciplineRebalanceReport(ctx.user.id);
      }),

    getForgettingVelocity: protectedProcedure
      .query(async ({ ctx }) => {
        return getForgettingVelocityByDiscipline(ctx.user.id);
      }),

    checkMassStudy: protectedProcedure
      .query(async ({ ctx }) => {
        const db_topics = await storage.getTopicsByUser(ctx.user.id);
        const today = new Date().toISOString().split("T")[0];
        const todayTopics = db_topics.filter(t => t.studyDate === today);
        const countByDiscipline: Record<number, number> = {};
        for (const t of todayTopics) {
          countByDiscipline[t.disciplineId] = (countByDiscipline[t.disciplineId] || 0) + 1;
        }
        const flagged = Object.entries(countByDiscipline)
          .filter(([_, count]) => count >= 4)
          .map(([id, count]) => ({ disciplineId: parseInt(id), count }));
        return { flagged };
      }),

    getPreExamStatus: protectedProcedure
      .query(async ({ ctx }) => {
        const settings = await storage.getUserSettings(ctx.user.id);
        const preExamDays = settings?.preExamDays ?? 7;
        const exams = [...(settings?.exams || [])];
        if (settings?.examDate) exams.push({ id: "main", name: settings.examName || "Concurso", date: settings.examDate });
        type ExamWithDays = { id: string; name: string; date: string; daysLeft: number };
        const upcoming: ExamWithDays[] = exams
          .map(e => ({ ...e, daysLeft: Math.ceil((new Date(e.date).getTime() - Date.now()) / 86400000) }))
          .filter(e => e.daysLeft >= 0 && e.daysLeft <= preExamDays)
          .sort((a, b) => a.daysLeft - b.daysLeft);
        return { active: upcoming.length > 0, exams: upcoming, preExamDays };
      }),

    updateV10Settings: protectedProcedure
      .input(z.object({
        attentionAlertMinutes: z.number().min(5).max(180).optional(),
        delayedFeedback: z.boolean().optional(),
        preExamDays: z.number().min(1).max(60).optional(),
        aiApiKey: z.string().optional(),
        aiProvider: z.enum(["gemini", "openai", "claude"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await storage.updateUserSettings(ctx.user.id, input as Partial<import("./jsonStorage").UserSettings>);
        return { success: true };
      }),
  }),

  mentor: mentorRouter,

  history: router({
    get: protectedProcedure
      .input(z.object({
        disciplineId: z.number().optional(),
        search: z.string().optional(),
        type: z.enum(["revision", "test"]).optional(),
        completed: z.boolean().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const [revisions, topics, disciplines] = await Promise.all([
          storage.getRevisionsByUser(ctx.user.id),
          storage.getTopicsByUser(ctx.user.id),
          storage.getDisciplinesByUser(ctx.user.id),
        ]);

        let filtered = revisions;

        if (input?.completed !== undefined) {
          filtered = filtered.filter(r => r.completed === input.completed);
        }
        if (input?.type) {
          filtered = filtered.filter(r => r.type === input.type);
        }
        if (input?.startDate) {
          filtered = filtered.filter(r => r.scheduledDate >= input.startDate!);
        }
        if (input?.endDate) {
          filtered = filtered.filter(r => r.scheduledDate <= input.endDate!);
        }
        if (input?.disciplineId) {
          const discTopicIds = new Set(topics.filter(t => t.disciplineId === input.disciplineId).map(t => t.id));
          filtered = filtered.filter(r => discTopicIds.has(r.topicId));
        }
        if (input?.search) {
          const q = input.search.toLowerCase();
          const matchingTopicIds = new Set(
            topics.filter(t => t.name.toLowerCase().includes(q)).map(t => t.id)
          );
          filtered = filtered.filter(r => matchingTopicIds.has(r.topicId));
        }

        return {
          revisions: filtered,
          topics,
          disciplines,
        };
      }),
  }),

  export: router({
    getSchedule: protectedProcedure
      .input(z.object({
        disciplineId: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const [revisions, topics, disciplines] = await Promise.all([
          storage.getRevisionsByUser(ctx.user.id),
          storage.getTopicsByUser(ctx.user.id),
          storage.getDisciplinesByUser(ctx.user.id),
        ]);

        let filtered = revisions;

        if (input?.startDate) {
          filtered = filtered.filter(r => r.scheduledDate >= input.startDate!);
        }
        if (input?.endDate) {
          filtered = filtered.filter(r => r.scheduledDate <= input.endDate!);
        }
        if (input?.disciplineId) {
          const discTopicIds = new Set(topics.filter(t => t.disciplineId === input.disciplineId).map(t => t.id));
          filtered = filtered.filter(r => discTopicIds.has(r.topicId));
        }

        const schedule = filtered.map(r => {
          const topic = topics.find(t => t.id === r.topicId);
          const discipline = disciplines.find(d => d.id === topic?.disciplineId);
          return {
            date: r.scheduledDate,
            type: r.type,
            revisionNumber: r.revisionNumber,
            topicName: topic?.name ?? "—",
            disciplineName: discipline?.name ?? "—",
            completed: r.completed,
            ignored: r.ignored,
          };
        }).sort((a, b) => a.date.localeCompare(b.date));

        return { schedule };
      }),
  }),
});

export type AppRouter = typeof appRouter;
