import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as storage from "./jsonStorage";
import { callAiProvider } from "./aiProviders";
import { extractJSON } from "./mentorRouter";

export const essayRouter = router({
  list: protectedProcedure
    .input(z.object({ disciplineId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return storage.getEssaysByUser(ctx.user.id, input?.disciplineId);
    }),
  transcribe: protectedProcedure
    .input(
      z.object({
        image: z.string(), // base64
        apiKey: z.string().min(1),
        provider: z.enum(["gemini", "openai", "claude"]).default("gemini"),
      }),
    )
    .mutation(async ({ input }) => {
      const prompt =
        "Você é um especialista em OCR e transcrição de textos manuscritos. Transcreva EXATAMENTE o texto contido na imagem fornecida, mantendo parágrafos e pontuação originais. Retorne APENAS o texto limpo, sem introduções ou explicações.";
      try {
        const result = await callAiProvider(
          input.provider,
          input.apiKey,
          prompt,
          2048,
          input.image,
        );
        return { transcription: result };
      } catch (err: unknown) {
        throw new Error(
          `Falha na transcrição: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),
  save: protectedProcedure
    .input(
      z.object({
        disciplineId: z.number(),
        topicId: z.number().optional(),
        title: z.string().min(1),
        banca: z.string().min(1),
        transcription: z.string().default(""),
        originalImage: z.string().optional(),
        status: z.enum(["draft", "pending", "corrected"]).default("draft"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return storage.saveEssay({ ...input, userId: ctx.user.id });
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        transcription: z.string().optional(),
        status: z.enum(["draft", "pending", "corrected"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return storage.updateEssay(id, ctx.user.id, data);
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await storage.deleteEssay(input.id, ctx.user.id);
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
      const essay = await storage.getEssayById(input.id, ctx.user.id);
      if (!essay) throw new Error("Redação não encontrada.");
      if (!essay.transcription || essay.transcription.trim().length < 10) {
        throw new Error(
          "A redação precisa ter uma transcrição (mínimo 10 caracteres) para ser analisada pela IA.",
        );
      }

      const prompt = `Você é um examinador sênior de redações para concursos públicos brasileiros com 20 anos de experiência, especialista na banca ${essay.banca}.
Sua avaliação deve ser tão detalhada, pedagógica e técnica quanto a de um professor particular de cursinho de elite.

TEMA: ${essay.title}
BANCA: ${essay.banca}
TEXTO DO ALUNO:
---
${essay.transcription}
---

CRITÉRIOS DE CORREÇÃO:
1. Nota Global de 0 a 10 (uma casa decimal).
2. Avalie cada critério com nota de 0 a 2.0 e uma justificativa de 1-2 linhas:
   - Domínio do Tema e Argumentação
   - Estrutura e Coesão Textual
   - Norma Culta (gramática, concordância, pontuação, ortografia)
   - Vocabulário e Registro Formal
   - Conclusão e Proposta de Intervenção
3. Se CESPE/Cebraspe: calcule a diluição de erros (NC - K×NE/TL) e explique o cálculo no feedback.
4. Erros identificados: aponte cada erro com tipo, trecho exato entre aspas, por que é errado e sugestão de correção.
5. Pontos positivos: liste ao menos 3 acertos reais e específicos do texto.
6. Plano de melhoria: liste 5 ações concretas e mensuráveis para o aluno praticar.
7. Feedback narrativo em Markdown rico usando ###, **negrito**, listas e > para citar trechos.

ESTRUTURA JSON OBRIGATÓRIA (retorne APENAS o JSON, sem markdown externo):
{
  "score": 7.5,
  "gradeBreakdown": {
    "Domínio do Tema e Argumentação": 1.5,
    "Estrutura e Coesão Textual": 1.5,
    "Norma Culta (Gramática)": 1.5,
    "Vocabulário e Registro": 1.5,
    "Conclusão/Proposta": 1.5
  },
  "gradeJustification": {
    "Domínio do Tema e Argumentação": "O aluno demonstrou conhecimento do tema mas a argumentação ficou superficial...",
    "Estrutura e Coesão Textual": "Boa organização em parágrafos, porém faltou transições entre as ideias..."
  },
  "desvios": [
    { "tipo": "Gramática", "trecho_original": "as pessoa foram", "sugestao": "as pessoas foram", "explicacao": "Erro de concordância nominal" }
  ],
  "estatisticas": {
    "caracteres": 1200,
    "palavras": 250,
    "frases": 15,
    "paragrafos": 4,
    "conectivos": 8,
    "tempoLeitura": "1 min",
    "nivelComplexidade": "Intermediário"
  },
  "strengths": [
    "Introdução bem contextualizada com dados relevantes",
    "Proposta de intervenção concreta no parágrafo final"
  ],
  "improvementPlan": [
    "Pratique 10 exercícios semanais de concordância verbal e nominal",
    "Dedique 15 min/dia à revisão gramatical focada em regência verbal e nominal"
  ],
  "feedback": "### Parecer Geral do Examinador\\n\\nSua redação demonstra..."
}

Responda apenas o JSON.`;

      try {
        const raw = await callAiProvider(
          input.provider,
          input.apiKey,
          prompt,
          4000,
        );
        const parsed = extractJSON(raw) as any;

        await storage.updateEssay(input.id, ctx.user.id, {
          correction: parsed,
          status: "corrected",
        });

        return parsed;
      } catch (err: unknown) {
        throw new Error(
          `Falha na correção da IA: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),
});
