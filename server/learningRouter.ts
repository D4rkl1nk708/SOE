/**
 * Caderno Vivo — leitura que vira estudo.
 *
 * O PDF entra inteiro, sai dividido em seções, e cada seção tem três saídas:
 * perguntas de recuperação (não resumo), analogias ancoradas no que o usuário
 * já domina (com o limite explícito de cada uma) e, quando o tema é
 * procedimental, um micro-mundo manipulável.
 */
import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { callAiProvider } from "./aiProviders";
import { extractJSON } from "./mentorRouter";
import { parseAiJson } from "./aiJson";
import * as learning from "./learningService";
import * as store from "./learningStore";
import { matchCadernoForDiscipline, cadernoUrlFor } from "./tecLink";
import * as storage from "./jsonStorage";

const providerSchema = z.enum(["claude", "gemini", "openai"]).default("gemini");

async function callAI(
  provider: "claude" | "gemini" | "openai",
  apiKeyString: string,
  prompt: string,
  maxTokens = 1600,
): Promise<string> {
  // JSON estruturado e sem "thinking": no Gemini 2.5 o thinking consumia o
  // orçamento de saída e o JSON chegava truncado (o erro que o usuário viu).
  return callAiProvider(
    provider,
    apiKeyString,
    prompt,
    Math.max(maxTokens, 4000),
    undefined,
    { noThinking: true, json: true },
  );
}

/**
 * Chave efetiva: a que o cliente mandou ou, de preferência, a salva nas
 * configurações do usuário (o app não precisa expor a chave no browser).
 */
async function resolveApiKey(
  userId: number,
  provided?: string,
): Promise<string> {
  const direct = String(provided || "").trim();
  if (direct) return direct;
  const settings = await storage.getUserSettings(userId);
  return String(settings?.aiApiKey || "").trim();
}

function toStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

export const learningRouter = router({
  importPdf: protectedProcedure
    .input(
      z.object({
        base64: z.string().min(20),
        fileName: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return learning.importDocument(ctx.user.id, input.base64, input.fileName);
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return learning.listDocuments(ctx.user.id);
  }),

  get: protectedProcedure
    .input(z.object({ docId: z.string() }))
    .query(async ({ ctx, input }) => {
      const doc = await learning.getDocument(ctx.user.id, input.docId);
      if (!doc) throw new Error("Documento não encontrado.");
      await learning.touchDocument(ctx.user.id, input.docId);
      return doc;
    }),

  remove: protectedProcedure
    .input(z.object({ docId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await learning.deleteDocument(ctx.user.id, input.docId);
      return { success: true };
    }),

  /** Analogias já salvas (a que o aluno escolheu vira a explicação oficial do tema). */
  analogiesFor: protectedProcedure
    .input(z.object({ topicName: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return store.listAnalogies(ctx.user.id, input?.topicName);
    }),

  saveAnalogy: protectedProcedure
    .input(
      z.object({
        topicId: z.number().optional(),
        topicName: z.string().min(1),
        analogy: z.string().min(1),
        mapping: z.array(z.string()).default([]),
        breaks: z.string().default(""),
        bestFor: z.string().default(""),
        whyItWorks: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return store.saveAnalogy(ctx.user.id, input);
    }),

  microWorldsFor: protectedProcedure
    .input(z.object({ topicName: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return store.listMicroWorlds(ctx.user.id, input?.topicName);
    }),

  saveMicroWorld: protectedProcedure
    .input(
      z.object({
        topicId: z.number().optional(),
        topicName: z.string().min(1),
        title: z.string().min(1),
        html: z.string().min(20),
        controls: z.array(z.string()).default([]),
        challenges: z.array(z.string()).default([]),
        limits: z.array(z.string()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return store.saveMicroWorld(ctx.user.id, input);
    }),

  /**
   * Caderno do TEC da disciplina do tema — casamento por nome (o banco ainda não
   * tem vínculo tópico→caderno). Sem casamento, devolve só a dica de busca.
   */
  cadernoForDiscipline: protectedProcedure
    .input(z.object({ disciplineName: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const cadernos = await storage.getCadernosTec(ctx.user.id);
      const match = matchCadernoForDiscipline(
        cadernos as any,
        input.disciplineName,
      );
      return {
        url: match ? cadernoUrlFor(match) : null,
        caderno: match
          ? { cadernoId: match.cadernoId, disciplina: match.disciplina }
          : null,
      };
    }),

  /**
   * Perguntas de recuperação de uma seção.
   * Nunca pede resumo: pede pergunta que force recuperar da memória.
   */
  sectionQuestions: protectedProcedure
    .input(
      z.object({
        docId: z.string(),
        sectionIndex: z.number().min(0),
        apiKey: z.string().optional(),
        provider: providerSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const doc = await learning.getDocument(ctx.user.id, input.docId);
      if (!doc) throw new Error("Documento não encontrado.");
      const section = doc.sectionsData[input.sectionIndex];
      if (!section) throw new Error("Seção inválida.");

      const prompt = [
        "Você é um tutor de concursos montando leitura ativa.",
        "A partir do trecho abaixo, escreva 3 perguntas de RECUPERAÇÃO.",
        "Regras: nada de resumo; a resposta tem que estar no texto;",
        "cada pergunta cobra uma ideia diferente; use linguagem de prova.",
        "",
        `Seção: ${section.title} (páginas ${section.startPage}-${section.endPage})`,
        "<trecho>",
        learning.sectionPromptText(section),
        "</trecho>",
        "",
        "Responda SOMENTE JSON:",
        '{"questions":[{"question":"...","answerKey":["ponto 1","ponto 2"],',
        ' "pageFrom": 1, "pageTo": 2}]}',
        "pageFrom/pageTo: páginas reais (dentro do intervalo informado) onde a resposta está.",
      ].join("\n");

      const raw = await callAI(
        input.provider,
        await resolveApiKey(ctx.user.id, input.apiKey),
        prompt,
        1400,
      );
      const parsed = parseAiJson(raw) as any;
      const questions = Array.isArray(parsed?.questions)
        ? parsed.questions.slice(0, 5).map((item: any, index: number) => ({
            question: String(item?.question || "").trim(),
            answerKey: toStringList(item?.answerKey),
            pageFrom: Number(item?.pageFrom) || section.startPage,
            pageTo: Number(item?.pageTo) || section.endPage,
            order: index,
          }))
        : [];
      if (questions.length === 0) {
        throw new Error("A IA não devolveu perguntas legíveis. Tente de novo.");
      }
      return { sectionTitle: section.title, questions };
    }),

  /**
   * Analogias: três candidatas, com o mapeamento e o ponto onde cada uma quebra.
   * Comparar duas ou mais analogias é o que fixa o princípio (analogical encoding).
   */
  analogies: protectedProcedure
    .input(
      z.object({
        topicName: z.string().min(2),
        disciplineName: z.string().optional().default(""),
        context: z.string().optional().default(""),
        apiKey: z.string().optional(),
        provider: providerSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const prompt = [
        "Você ensina concursos usando analogias. Gere 3 analogias para o tema abaixo.",
        "Para cada uma: o mapeamento (o que corresponde a quê) e ONDE ELA QUEBRA.",
        "A comparação entre analogias é o que faz aprender — então elas devem competir:",
        "cada uma ilumina um aspecto diferente do mesmo conceito.",
        "",
        `Tema: ${input.topicName}`,
        input.disciplineName ? `Disciplina: ${input.disciplineName}` : "",
        input.context ? `Contexto do material do aluno: ${input.context}` : "",
        "",
        "Responda SOMENTE JSON:",
        '{"analogies":[{"analogy":"...","mapping":["A é B","C é D"],',
        ' "breaks":"onde a analogia deixa de valer","bestFor":"o que ela ilumina"}]}',
      ]
        .filter(Boolean)
        .join("\n");

      const raw = await callAI(
        input.provider,
        await resolveApiKey(ctx.user.id, input.apiKey),
        prompt,
        1400,
      );
      const parsed = parseAiJson(raw) as any;
      const analogies = Array.isArray(parsed?.analogies)
        ? parsed.analogies.slice(0, 3).map((item: any) => ({
            analogy: String(item?.analogy || "").trim(),
            mapping: toStringList(item?.mapping),
            breaks: String(item?.breaks || "").trim(),
            bestFor: String(item?.bestFor || "").trim(),
          }))
        : [];
      if (analogies.length === 0) {
        throw new Error("A IA não devolveu analogias legíveis. Tente de novo.");
      }
      return { analogies };
    }),

  /**
   * Micro-mundo: artefato HTML autocontido que o aluno opera.
   * Schema fixo — o componente SandboxFrame depende dele.
   */
  microWorld: protectedProcedure
    .input(
      z.object({
        topicName: z.string().min(2),
        disciplineName: z.string().optional().default(""),
        apiKey: z.string().optional(),
        provider: providerSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const prompt = [
        "Crie um MICRO-MUNDO: uma página HTML única, autocontida, sem dependências",
        "externas, sem internet, que mostre o conceito abaixo de forma manipulável.",
        "",
        `Conceito: ${input.topicName}`,
        input.disciplineName ? `Disciplina: ${input.disciplineName}` : "",
        "",
        "Requisitos rígidos:",
        "- 2 a 4 controles reais (slider, botão, select) e um efeito visível para cada;",
        "- um estado do conceito sempre visível (linha do tempo, diagrama, contador);",
        "- 3 desafios que o aluno resolve operando o artefato;",
        "- declare o que o modelo ignora;",
        "- CSS inline, dark background #0b0f1a, texto claro, sem fontes externas;",
        "- nada de fetch, nada de <script src>, nada de iframe.",
        "",
        "Responda SOMENTE JSON:",
        '{"title":"...","html":"<!doctype html>...",',
        ' "controls":["..."],"challenges":["..."],"limits":["..."]}',
      ]
        .filter(Boolean)
        .join("\n");

      const raw = await callAI(
        input.provider,
        await resolveApiKey(ctx.user.id, input.apiKey),
        prompt,
        12000,
      );
      const parsed = parseAiJson(raw) as any;
      const html = String(parsed?.html || "").trim();
      if (!html.toLowerCase().includes("<html")) {
        throw new Error("A IA não devolveu um HTML válido. Tente de novo.");
      }
      // Blindagem mínima: nada de rede nem de script externo no sandbox.
      if (/<script[^>]+src=/i.test(html) || /\bfetch\s*\(/i.test(html)) {
        throw new Error("O artefato gerado tentou usar rede. Gere novamente.");
      }
      return {
        id: `mw-${Date.now().toString(36)}`,
        title: String(parsed?.title || input.topicName).trim(),
        html,
        controls: toStringList(parsed?.controls),
        challenges: toStringList(parsed?.challenges),
        limits: toStringList(parsed?.limits),
      };
    }),
});
