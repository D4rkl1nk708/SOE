import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as storage from "./db";
// @ts-ignore
import pdf from "pdf-parse/lib/pdf-parse.js";
import { callAiProvider } from "./aiProviders";
import { extractJSON } from "./mentorRouter";

export const editalRouter = router({
  /**
   * Analisa o texto do edital (ou extraído de PDF) via IA para gerar a grade de estudos
   */
  parseEdital: protectedProcedure
    .input(
      z.object({
        text: z.string().optional(),
        pdfBase64: z.string().optional(),
        role: z.string().optional(), // Cargo pretendido
      }),
    )
    .mutation(async ({ input, ctx }) => {
      let content = input.text || "";

      if (input.pdfBase64) {
        const buffer = Buffer.from(input.pdfBase64, "base64");
        const data = await pdf(buffer);
        content = data.text;
      }

      if (!content || content.trim().length < 50) {
        throw new Error(
          "Conteúdo insuficiente para análise. Certifique-se de que o texto ou PDF contém o conteúdo programático.",
        );
      }

      // Prompt para a IA
      const prompt = `
Você é um especialista em concursos públicos e organização de editais.
Sua tarefa é ler o conteúdo programático abaixo e extrair uma lista estruturada de DISCIPLINAS e seus respectivos TÓPICOS.

CARGO PRETENDIDO: ${input.role || "Não especificado"}

CONTEÚDO DO EDITAL:
---
${content.substring(0, 15000)} // Limitando para não estourar tokens se o edital for gigante
---

REGRAS DE EXTRAÇÃO:
1. Identifique claramente o nome da DISCIPLINA (ex: Direito Administrativo, Língua Portuguesa).
2. Para cada disciplina, liste os TÓPICOS de estudo de forma concisa.
3. Se houver muitos sub-tópicos, agrupe-os em tópicos principais para não gerar uma lista infinita.
4. Ignore partes que não sejam conteúdo de estudo (ex: cronogramas de prova, requisitos do cargo, etc).
5. Foque APENAS no cargo "${input.role}" se houver múltiplos cargos no texto.

RETORNE APENAS UM JSON no seguinte formato (sem texto antes ou depois):
[
  { "discipline": "NOME DA DISCIPLINA", "topic": "NOME DO TÓPICO 1" },
  { "discipline": "NOME DA DISCIPLINA", "topic": "NOME DO TÓPICO 2" },
  ...
]

DICA: Se o texto for confuso, use sua base de conhecimento sobre concursos para inferir a divisão correta das matérias comuns.
`;

      const userSettings = await storage.getUserSettings(ctx.user.id);
      const provider = userSettings?.aiProvider || "gemini";
      const apiKey = userSettings?.aiApiKey || "";

      const response = await callAiProvider(provider, apiKey, prompt, 3000);
      const parsed = extractJSON(response) as any[];

      if (!Array.isArray(parsed)) {
        throw new Error("A IA não retornou um formato de lista válido.");
      }

      // Mapear para o formato do EditalTopico do frontend (ids temporários)
      return parsed.map((item: any, idx: any) => ({
        id: `ai-${Date.now()}-${idx}`,
        discipline: item.discipline,
        topic: item.topic,
        completed: false,
        isHeader: false,
      }));
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
        .map((t: any) => t.trim())
        .filter((t: any) => t.length > 0);

      return topics.map((topic: any, idx: any) => ({
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
${input.disciplines.map((d: any) => `- ${d.name}: Acerto ${d.accuracy ?? 0}%, Questões: ${d.questionsResolved}, Tempo: ${Math.round(d.studyTimeSeconds / 3600)}h`).join("\n")}

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

      return parsed.map((item: any) => ({
        cycleKey: `cycle-${item.slotIndex}`,
        disciplineId: item.disciplineId,
        reason: item.reason,
      }));
    }),
});
