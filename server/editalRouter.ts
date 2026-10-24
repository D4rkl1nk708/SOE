import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as storage from "./jsonStorage";
import { callAiProvider } from "./aiProviders";
import { extractJSON } from "./mentorRouter";
import {
  inspectEdital,
  loadEditalText,
  parseEditalWithAi,
} from "./editalParser";

export const editalRouter = router({
  /**
   * Inspeciona o PDF/texto sem IA: detecta título, páginas, tamanho do
   * conteúdo programático e cargos/especialidades disponíveis.
   */
  inspect: protectedProcedure
    .input(
      z.object({
        text: z.string().optional(),
        pdfBase64: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return inspectEdital(input);
    }),

  /**
   * Analisa o texto do edital (ou extraído de PDF) via IA para gerar a grade
   * de estudos. O conteúdo programático é localizado no edital e dividido em
   * blocos antes de ir para a IA; antes o código cortava os primeiros 15 mil
   * caracteres e nunca chegava ao item "DOS OBJETOS DE AVALIAÇÃO".
   */
  parseEdital: protectedProcedure
    .input(
      z.object({
        text: z.string().optional(),
        pdfBase64: z.string().optional(),
        role: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { text } = await loadEditalText(input);
      const content = text || "";

      if (!content || content.trim().length < 50) {
        throw new Error(
          "Conteúdo insuficiente para análise. Certifique-se de que o texto ou PDF contém o conteúdo programático.",
        );
      }

      const userSettings = await storage.getUserSettings(ctx.user.id);
      const provider = (userSettings?.aiProvider || "gemini") as
        | "gemini"
        | "openai"
        | "claude";
      const apiKey = userSettings?.aiApiKey || "";
      if (!apiKey) {
        throw new Error(
          "Configure sua chave de IA em Perfil > Configurações de IA para importar o edital.",
        );
      }

      const parsed = await parseEditalWithAi({
        text: content,
        role: input.role,
        apiKey,
        provider,
        callAi: callAiProvider,
      });

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error(
          "A IA não encontrou tópicos. Verifique se o PDF contém o conteúdo programático e selecione o cargo correto.",
        );
      }

      return parsed;
    }),

  /**
   * Adição rápida via texto colado (manual, sem IA)
   */
  quickAddManual: protectedProcedure
    .input(
      z.object({
        discipline: z.string(),
        topicsText: z.string(), // Texto separado por linhas ou vírgulas
      }),
    )
    .mutation(async ({ input }) => {
      const topics = input.topicsText
        .split(/[\n,;]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      return topics.map((topic, idx) => ({
        id: `manual-${Date.now()}-${idx}`,
        discipline: input.discipline,
        topic: topic,
        completed: false,
        isHeader: false,
      }));
    }),

  /**
   * Otimiza o ciclo de estudos via IA com base no desempenho atual
   */
  optimizeCycle: protectedProcedure
    .input(
      z.object({
        disciplines: z.array(
          z.object({
            id: z.number(),
            name: z.string(),
            accuracy: z.number().nullable(),
            questionsResolved: z.number(),
            studyTimeSeconds: z.number(),
          }),
        ),
        cycleLength: z.number().min(1).max(14),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const prompt = `
Você é um estrategista de estudos de alto desempenho. Sua missão é organizar um CICLO DE ESTUDOS otimizado.

DISCIPLINAS E DESEMPENHO ATUAL:
${input.disciplines.map((d) => `- ${d.name}: Acerto ${d.accuracy ?? 0}%, Questões: ${d.questionsResolved}, Tempo: ${Math.round(d.studyTimeSeconds / 3600)}h`).join("\n")}

CONFIGURAÇÃO DO CICLO:
- Total de slots no ciclo: ${input.cycleLength}

REGRAS DE OTIMIZAÇÃO:
1. Disciplinas com MENOR acerto devem aparecer MAIS VEZES ou em posições estratégicas.
2. Disciplinas com MUITO tempo de estudo mas POUCO acerto precisam de reforço (mais slots).
3. Disciplinas com ALTO acerto e MUITO estudo podem ter menos slots (manutenção).
4. Tente intercalar matérias de naturezas diferentes (ex: Direito com Exatas).

RETORNE APENAS UM JSON no seguinte formato:
[
  { "slotIndex": 0, "disciplineId": 123, "reason": "Explicação curta da estratégia" },
  ...
]
Retorne exatamente ${input.cycleLength} slots.
`;

      const userSettings = await storage.getUserSettings(ctx.user.id);
      const provider = userSettings?.aiProvider || "gemini";
      const apiKey = userSettings?.aiApiKey || "";

      const response = await callAiProvider(provider, apiKey, prompt, 2000);
      const parsed = extractJSON(response) as any[];

      return parsed.map((item) => ({
        cycleKey: `cycle-${item.slotIndex}`,
        disciplineId: item.disciplineId,
        reason: item.reason,
      }));
    }),
});
