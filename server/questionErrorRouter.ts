import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as storage from "./jsonStorage";
import { callAiProvider } from "./aiProviders";
import { extractJSON } from "./mentorRouter";

export const questionErrorRouter = router({
  save: protectedProcedure
    .input(
      z.object({
        topicId: z.number(),
        disciplineId: z.number(),
        questionId: z.string().optional(),
        banca: z.string().optional(),
        year: z.number().optional(),
        contest: z.string().optional(),
        statement: z.string().min(1),
        alternatives: z.array(
          z.object({ letter: z.string(), text: z.string() }),
        ),
        userAnswer: z.string().optional(),
        correctAnswer: z.string().optional(),
        errorOrigin: z
          .enum(["attention", "forgetting", "theory", "trap"])
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return storage.saveQuestionError({ ...input, userId: ctx.user.id });
    }),

  list: protectedProcedure
    .input(
      z
        .object({
          topicId: z.number().optional(),
          disciplineId: z.number().optional(),
          limit: z.number().min(1).max(200).optional(),
          offset: z.number().min(0).optional(),
        })
        .optional(),
    )
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
    .input(
      z.object({
        id: z.number(),
        apiKey: z.string().min(1),
        provider: z.enum(["gemini", "openai", "claude"]).default("gemini"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { items: errors } = await storage.getQuestionErrorsByUser(
        ctx.user.id,
        { limit: 200 },
      );
      const e = errors.find((err) => err.id === input.id);
      if (!e) throw new Error("Questão não encontrada.");

      const chosenText =
        e.alternatives?.find((a: any) => a.letter === e.userAnswer)?.text || "";
      const correctText =
        e.alternatives?.find((a: any) => a.letter === e.correctAnswer)?.text ||
        "";

      const prompt = `Você é um professor especialista em concursos públicos brasileiros.

Analise a questão abaixo que o aluno errou e faça um diagnóstico cirúrgico e objetivo.

--- Questão ${e.questionId || ""} (${e.banca || ""} ${e.year || ""}) ---
${e.statement}

${e.alternatives?.map((a: any) => `${a.letter}) ${a.text}`).join("\n")}

${e.userAnswer ? `Aluno marcou: ${e.userAnswer}${chosenText ? ` — "${chosenText}"` : ""}` : ""}
${e.correctAnswer ? `Gabarito: ${e.correctAnswer}${correctText ? ` — "${correctText}"` : ""}` : ""}
${e.errorOrigin ? `Tipo do erro classificado: ${e.errorOrigin}` : ""}

Com base na questão acima, responda de forma direta e técnica:

1. **Onde está o erro**: Explique EXATAMENTE por que a alternativa correta é a correta e por que a marcada está errada. Use os próprios textos das alternativas — não fale de forma genérica.

2. **Conceito cobrado**: Qual é o ponto de lei, doutrina ou jurisprudência que essa questão testa? Enuncie-o de forma clara.

3. **Como não errar de novo**: Uma regra mnemônica, distinção-chave ou dica prática específica para esse conteúdo.

Responda em português, máximo 300 palavras. Sem introduções — vá direto ao diagnóstico.`;

      try {
        const analysisText = await callAiProvider(
          input.provider,
          input.apiKey,
          prompt,
          1024,
        );
        if (!analysisText) throw new Error("Resposta vazia da IA.");
        await storage.saveQuestionErrorAnalysis(
          input.id,
          ctx.user.id,
          analysisText,
        );
        return { analysis: analysisText };
      } catch (err: unknown) {
        throw new Error(
          `Falha ao chamar IA: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),

  revisionTip: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        apiKey: z.string().min(1),
        provider: z.enum(["gemini", "openai", "claude"]).default("gemini"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { items: errors } = await storage.getQuestionErrorsByUser(
        ctx.user.id,
        { limit: 200 },
      );
      const e = errors.find((err) => err.id === input.id);
      if (!e) throw new Error("Questão não encontrada.");

      const correctText =
        e.alternatives?.find((a: any) => a.letter === e.correctAnswer)?.text ||
        "";

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
        const tip = await callAiProvider(
          input.provider,
          input.apiKey,
          prompt,
          2048,
        );
        if (!tip) throw new Error("Resposta vazia da IA.");
        await storage.saveQuestionErrorRevisionTip(input.id, ctx.user.id, tip);
        return { tip };
      } catch (err: unknown) {
        throw new Error(
          `Falha ao chamar IA: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),

  similarQuestions: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        apiKey: z.string().min(1),
        provider: z.enum(["gemini", "openai", "claude"]).default("gemini"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { items: errors } = await storage.getQuestionErrorsByUser(
        ctx.user.id,
        { limit: 200 },
      );
      const e = errors.find((err) => err.id === input.id);
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
        const similar = await callAiProvider(
          input.provider,
          input.apiKey,
          prompt,
          2048,
        );
        if (!similar) throw new Error("Resposta vazia da IA.");
        await storage.saveQuestionErrorSimilarQuestions(
          input.id,
          ctx.user.id,
          similar,
        );
        return { similar };
      } catch (err: unknown) {
        throw new Error(
          `Falha ao chamar IA: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),

  generateFlashcard: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        apiKey: z.string().min(1),
        provider: z.enum(["gemini", "openai", "claude"]).default("gemini"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { items: errors } = await storage.getQuestionErrorsByUser(
        ctx.user.id,
        { limit: 200 },
      );
      const e = errors.find((err) => err.id === input.id);
      if (!e) throw new Error("Questão não encontrada.");

      const correctText =
        e.alternatives?.find((a: any) => a.letter === e.correctAnswer)?.text ||
        "";

      const prompt = `Você é um professor de concursos públicos. Com base na questão abaixo que o aluno errou, crie UM flashcard para memorização.

Questão: ${e.statement}
Gabarito: ${e.correctAnswer}${correctText ? ` — "${correctText}"` : ""}

Retorne APENAS um JSON válido, sem markdown, sem explicação, exatamente assim:
{"front": "pergunta direta e objetiva que testa o conceito cobrado (máx 2 linhas)", "back": "resposta clara e completa com a regra ou distinção fundamental (máx 3 linhas)"}`;

      try {
        const raw = await callAiProvider(
          input.provider,
          input.apiKey,
          prompt,
          512,
        );
        if (!raw) throw new Error("Resposta vazia da IA.");
        let parsed;
        try {
          parsed = extractJSON(raw) as { front: string; back: string };
        } catch (parseErr: unknown) {
          console.error(
            "JSON parsing failed for flashcard:",
            (parseErr as any).message,
          );
          console.error("Raw AI response:", raw);
          throw new Error(
            `Falha ao processar flashcard da IA: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}. Resposta crua: ${raw.substring(0, 100)}...`,
          );
        }
        if (!parsed.front || !parsed.back)
          throw new Error("Flashcard inválido gerado pela IA.");

        // Salva o flashcard no banco
        await storage.createFlashcard({
          userId: ctx.user.id,
          disciplineId: e.disciplineId,
          topicId: e.topicId || undefined,
          front: parsed.front,
          back: parsed.back,
        });
        await storage.markQuestionErrorFlashcardGenerated(
          input.id,
          ctx.user.id,
        );
        return { front: parsed.front, back: parsed.back };
      } catch (err: unknown) {
        throw new Error(
          `Falha ao gerar flashcard: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),
});
