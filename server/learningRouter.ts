/**
 * Caderno Vivo — leitura que vira estudo.
 *
 * O PDF entra inteiro, sai dividido em seções, e cada seção tem três saídas:
 * perguntas de recuperação (não resumo), analogias ancoradas no que o usuário
 * já domina (com o limite explícito de cada uma) e, quando o tema é
 * procedimental, um micro-mundo manipulável. Na v6.9.6 entrou a AULA
 * INTERATIVA: uma animação que ensina o conceito em passos.
 *
 * Toda geração de IA passa por `learningJobs` (job com id, estágio e %), mas as
 * mutações antigas continuam existindo para os clientes que já as chamavam.
 */
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { callAiProvider } from "./aiProviders";
import { parseAiJson } from "./aiJson";
import * as learning from "./learningService";
import * as store from "./learningStore";
import {
  beginModelCall,
  cancelJob,
  getJob,
  activeJobCount,
  mapGenerationError,
  startGenerationJob,
  viewJob,
  MAX_CONCURRENT_JOBS,
  type GenerationJob,
  type GenerationKind,
  type GenerationStage,
} from "./learningJobs";
import { parseLessonArtifact } from "./lessonArtifact";
import { matchCadernoForDiscipline, cadernoUrlFor } from "./tecLink";
import * as storage from "./jsonStorage";

const providerSchema = z.enum(["claude", "gemini", "openai"]).default("gemini");

type Provider = "claude" | "gemini" | "openai";

async function callAI(
  provider: Provider,
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
  return String((settings as any)?.aiApiKey || "").trim();
}

function toStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

/** Contexto do tópico/erro que o aluno mandou: no máximo 600 caracteres. */
function clampContext(value: string | undefined, limit = 600): string {
  const text = String(value || "").trim();
  return text.length > limit ? text.slice(0, limit) : text;
}

// ── Prompts ────────────────────────────────────────────────────────────────

function questionsPrompt(section: {
  title: string;
  startPage: number;
  endPage: number;
  text: string;
}): string {
  return [
    "Você é um tutor de concursos montando leitura ativa.",
    "A partir do trecho abaixo, escreva 3 perguntas de RECUPERAÇÃO.",
    "Regras: nada de resumo; a resposta tem que estar no texto;",
    "cada pergunta cobra uma ideia diferente; use linguagem de prova.",
    "",
    `Seção: ${section.title} (páginas ${section.startPage}-${section.endPage})`,
    "<trecho>",
    learning.sectionPromptText(section as any),
    "</trecho>",
    "",
    "Responda SOMENTE JSON:",
    '{"questions":[{"question":"...","answerKey":["ponto 1","ponto 2"],',
    ' "pageFrom": 1, "pageTo": 2}]}',
    "pageFrom/pageTo: páginas reais (dentro do intervalo informado) onde a resposta está.",
  ].join("\n");
}

function analogiesPrompt(input: {
  topicName: string;
  disciplineName?: string;
  context?: string;
}): string {
  return [
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
}

function microWorldPrompt(input: {
  topicName: string;
  disciplineName?: string;
}): string {
  return [
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
}

/**
 * Contrato da AULA INTERATIVA. O que este prompt pede é exatamente o que o
 * validador (`lessonArtifact.ts`) cobra — os dois andam juntos.
 */
function lessonPrompt(input: {
  topicName: string;
  disciplineName?: string;
  context?: string;
}): string {
  return [
    "Crie uma AULA INTERATIVA: uma página HTML única e AUTOCONTIDA que ENSINE",
    "o conceito abaixo por animação, não por texto parado.",
    "",
    `Conceito: ${input.topicName}`,
    input.disciplineName ? `Disciplina: ${input.disciplineName}` : "",
    input.context
      ? `Contexto (trecho do material do aluno): ${input.context}`
      : "",
    "",
    "A página precisa ter, obrigatoriamente:",
    "1. <canvas> ou <svg> animado com requestAnimationFrame, botões Play/Pause/Reiniciar",
    "   e seletor de velocidade 0.5x / 1x / 2x;",
    "2. narração em 3 a 6 passos com botões 'Próximo passo' e 'Anterior': cada passo",
    "   tem título curto e UMA frase, aparece numerado e destacado ('2. Cascata de",
    "   objetivos') e o clique muda a animação junto — sem isso a narração não anda;",
    "3. UMA interação que explora o conceito (arrastar peça, slider que muda o",
    "   estado, montar a sequência) com efeito visível;",
    "4. UMA pergunta de verificação no fim, respondida DENTRO da página, com",
    "   feedback explicando por que está certa ou errada;",
    "5. um bloco visível 'O que esta animação ignora';",
    "6. `@media (prefers-reduced-motion: reduce)` que desliga a animação automática",
    "   e transforma tudo em passo a passo (com o texto 'prefers-reduced-motion').",
    "",
    "Proibido (a página é rejeitada se aparecer): fetch, XMLHttpRequest, WebSocket,",
    "qualquer endereço http:// ou https://, <script src>, <link href>, src=,",
    "@import, iframe, CDN de p5/gsap/d3, fontes ou imagens externas.",
    "Use só CSS/JS/HTML inline; SVG sem xmlns; fundo #0b0f1a e texto claro.",
    "Tudo precisa caber em 420px de altura, SEM rolagem interna: a primeira dobra",
    "mostra animação + Play/Pause + velocidade + passo atual; interação e pergunta",
    "de verificação aparecem abaixo, compactas.",
    "",
    "Responda SOMENTE JSON válido, sem cerca de markdown:",
    '{"title":"...","html":"<!doctype html>...",',
    ' "steps":[{"title":"...","text":"..."}],',
    ' "interaction":"o que o aluno manipula e o que muda",',
    ' "question":{"prompt":"...","options":["...","..."],"correctIndex":0,',
    '   "feedback":"..."},',
    ' "limits":["o que a animação ignora"]}',
  ]
    .filter(Boolean)
    .join("\n");
}

// ── Parsers ────────────────────────────────────────────────────────────────

type SectionLike = {
  title: string;
  startPage: number;
  endPage: number;
  text: string;
};

function parseQuestions(raw: string, section: SectionLike) {
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
    const error = new Error(
      "A IA não devolveu perguntas legíveis. Tente de novo.",
    ) as Error & { code?: string };
    error.code = "INVALID_ARTIFACT";
    throw error;
  }
  return { sectionTitle: section.title, questions };
}

function parseAnalogies(raw: string) {
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
    const error = new Error(
      "A IA não devolveu analogias legíveis. Tente de novo.",
    ) as Error & { code?: string };
    error.code = "INVALID_ARTIFACT";
    throw error;
  }
  return { analogies };
}

function parseMicroWorld(raw: string, topicName: string) {
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
    title: String(parsed?.title || topicName).trim(),
    html,
    controls: toStringList(parsed?.controls),
    challenges: toStringList(parsed?.challenges),
    limits: toStringList(parsed?.limits),
  };
}

function parseLesson(raw: string, input: LessonRequestInput) {
  const parsed = parseAiJson(raw) as any;
  const result = parseLessonArtifact(parsed, {
    topicName: input.topicName,
    disciplineName: input.disciplineName,
    topicId: input.topicId,
  });
  if (!result.ok) {
    const error = new Error(result.message) as Error & { code?: string };
    error.code = "INVALID_ARTIFACT";
    throw error;
  }
  return {
    id: `aula-${Date.now().toString(36)}`,
    ...result.lesson,
  };
}

// ── Geração como job ───────────────────────────────────────────────────────

type LessonRequestInput = {
  kind: GenerationKind;
  docId?: string;
  sectionIndex?: number;
  topicName: string;
  disciplineName?: string;
  topicId?: number;
  context?: string;
  provider: Provider;
};

/** Documento + seção do pedido (só para "questions"). */
async function loadSection(
  userId: number,
  input: LessonRequestInput,
): Promise<SectionLike> {
  if (!input.docId || typeof input.sectionIndex !== "number") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Escolha a seção do PDF antes de gerar as perguntas.",
    });
  }
  const doc = await learning.getDocument(userId, input.docId);
  if (!doc) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Documento não encontrado. Importe o PDF de novo.",
    });
  }
  const section = doc.sectionsData[input.sectionIndex];
  if (!section) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Seção não encontrada neste documento.",
    });
  }
  return section as SectionLike;
}

/** Executa a geração de fato, reportando progresso no job. */
async function runGeneration(
  job: GenerationJob,
  userId: number,
  apiKey: string,
  input: LessonRequestInput,
  section: SectionLike | null,
  report: (percent: number, stage?: GenerationStage, message?: string) => void,
): Promise<unknown> {
  const discipline = input.disciplineName || "";
  const context = clampContext(input.context);

  let prompt = "";
  let maxTokens = 1600;
  if (input.kind === "questions") {
    if (!section) throw new Error("Seção inválida.");
    prompt = questionsPrompt(section);
    maxTokens = 1400;
  } else if (input.kind === "analogies") {
    prompt = analogiesPrompt({
      topicName: input.topicName,
      disciplineName: discipline,
      context,
    });
    maxTokens = 1400;
  } else if (input.kind === "microWorld") {
    prompt = microWorldPrompt({
      topicName: input.topicName,
      disciplineName: discipline,
    });
    maxTokens = 12000;
  } else {
    prompt = lessonPrompt({
      topicName: input.topicName,
      disciplineName: discipline,
      context,
    });
    maxTokens = 12000;
  }

  report(8, "preparando", "Lendo o material e montando o pedido");
  beginModelCall(job);
  const raw = await callAI(input.provider, apiKey, prompt, maxTokens);
  if (job.status !== "running") return undefined;

  report(88, "validando artefato", "Conferindo o que a IA devolveu");
  if (input.kind === "questions") return parseQuestions(raw, section!);
  if (input.kind === "analogies") return parseAnalogies(raw);
  if (input.kind === "microWorld") return parseMicroWorld(raw, input.topicName);
  return parseLesson(raw, input);
}

const startGenerationSchema = z.object({
  kind: z.enum(["questions", "analogies", "microWorld", "lesson"]),
  docId: z.string().optional(),
  sectionIndex: z.number().min(0).optional(),
  topicName: z.string().min(2),
  disciplineName: z.string().optional().default(""),
  topicId: z.number().optional(),
  context: z.string().optional().default(""),
  apiKey: z.string().optional(),
  provider: providerSchema,
});

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

  // ── Aula interativa ──────────────────────────────────────────────────────

  /** Aulas salvas: a primeira do tópico é a atual, até 5 versões por tópico. */
  lessonsFor: protectedProcedure
    .input(z.object({ topicName: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return store.listLessons(ctx.user.id, input?.topicName);
    }),

  saveLesson: protectedProcedure
    .input(
      z.object({
        topicId: z.number().optional(),
        topicName: z.string().min(1),
        disciplineName: z.string().optional().default(""),
        title: z.string().min(1),
        html: z.string().min(20),
        steps: z
          .array(z.object({ title: z.string(), text: z.string() }))
          .min(1),
        interaction: z.string().min(1),
        question: z.object({
          prompt: z.string().min(1),
          options: z.array(z.string()).min(2),
          correctIndex: z.number().min(0),
          feedback: z.string().default(""),
        }),
        limits: z.array(z.string()).default([]),
        apiKey: z.string().optional(),
        provider: providerSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Guardrail de saída: nunca guardar algo que tente falar com a rede.
      const check = parseLessonArtifact(
        {
          html: input.html,
          steps: input.steps,
          interaction: input.interaction,
          question: input.question,
          limits: input.limits,
          title: input.title,
        },
        {
          topicName: input.topicName,
          disciplineName: input.disciplineName,
          topicId: input.topicId,
        },
      );
      if (!check.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: check.message });
      }
      const { apiKey: _omit, provider: _provider, ...entry } = input;
      return store.saveLesson(ctx.user.id, check.lesson!);
    }),

  deleteLesson: protectedProcedure
    .input(z.object({ lessonId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const removed = await store.deleteLesson(ctx.user.id, input.lessonId);
      if (!removed) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Aula não encontrada (ela já foi apagada?).",
        });
      }
      return { success: true };
    }),

  /** O tópico já foi marcado como estudado hoje? */
  lessonStudiedToday: protectedProcedure
    .input(z.object({ topicName: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return storage.isLessonStudiedToday(ctx.user.id, input.topicName);
    }),

  /** "Marcar como estudado": 1 evento por tópico por dia. */
  markLessonStudied: protectedProcedure
    .input(
      z.object({
        lessonId: z.string().optional(),
        topicName: z.string().min(1),
        topicId: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return storage.logLessonStudiedToday(
        ctx.user.id,
        input.topicName,
        input.topicId,
      );
    }),

  // ── Geração com progresso ────────────────────────────────────────────────

  startGeneration: protectedProcedure
    .input(startGenerationSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      if (activeJobCount(userId) >= MAX_CONCURRENT_JOBS) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message:
            "Você já tem 2 gerações em andamento. Espere uma terminar (ou cancele) e tente de novo.",
        });
      }

      const apiKey = await resolveApiKey(userId, input.apiKey);
      if (!apiKey) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Nenhuma chave de IA configurada. Salve sua chave em Ajustes e tente de novo.",
        });
      }

      // Validação que precisa ser síncrona: o aluno vê o erro na hora.
      const section =
        input.kind === "questions" ? await loadSection(userId, input) : null;
      if (input.kind === "lesson" && !String(input.topicName || "").trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Escolha o tópico da aula.",
        });
      }

      const job = startGenerationJob(userId, input.kind, async (handle) =>
        runGeneration(
          handle.job,
          userId,
          apiKey,
          input,
          section,
          handle.report,
        ),
      );
      return { jobId: job.id, kind: job.kind };
    }),

  generationStatus: protectedProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const job = getJob(input.jobId);
      if (!job || job.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "Geração não encontrada ou expirada (o servidor guarda o resultado por 10 minutos).",
        });
      }
      return viewJob(job);
    }),

  cancelGeneration: protectedProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const job = getJob(input.jobId);
      if (!job || job.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Geração não encontrada ou expirada.",
        });
      }
      const next = cancelJob(job);
      return { cancelled: next.status === "cancelled", status: next.status };
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

      const raw = await callAI(
        input.provider,
        await resolveApiKey(ctx.user.id, input.apiKey),
        questionsPrompt(section as SectionLike),
        1400,
      );
      return parseQuestions(raw, section as SectionLike);
    }),

  /**
   * v6.9.11 (B7/4.11): grava a micro-recuperação de uma seção. Serve ao modo
   * heurístico (sem IA) e ao modo com IA; nunca bloqueia a leitura para sempre.
   */
  saveSectionRecall: protectedProcedure
    .input(
      z.object({
        docId: z.string(),
        sectionIndex: z.number().min(0),
        sectionTitle: z.string().optional(),
        question: z.string().min(1).max(500),
        answer: z.string().max(1000).optional(),
        selfRated: z.enum(["acertei", "nao_soube"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return storage.saveSectionRecall(ctx.user.id, input);
    }),

  sectionRecalls: protectedProcedure
    .input(z.object({ docId: z.string() }))
    .query(async ({ ctx, input }) => {
      return storage.getSectionRecalls(ctx.user.id, input.docId);
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
      const raw = await callAI(
        input.provider,
        await resolveApiKey(ctx.user.id, input.apiKey),
        analogiesPrompt(input),
        1400,
      );
      return parseAnalogies(raw);
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
      const raw = await callAI(
        input.provider,
        await resolveApiKey(ctx.user.id, input.apiKey),
        microWorldPrompt(input),
        12000,
      );
      return parseMicroWorld(raw, input.topicName);
    }),

  /**
   * Aula interativa sem job (compatibilidade): mesma geração, resposta direta.
   * O app usa `startGeneration({ kind: "lesson" })`; isto fica para scripts.
   */
  lesson: protectedProcedure
    .input(
      z.object({
        topicName: z.string().min(2),
        disciplineName: z.string().optional().default(""),
        topicId: z.number().optional(),
        context: z.string().optional().default(""),
        apiKey: z.string().optional(),
        provider: providerSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const raw = await callAI(
        input.provider,
        await resolveApiKey(ctx.user.id, input.apiKey),
        lessonPrompt({
          topicName: input.topicName,
          disciplineName: input.disciplineName,
          context: clampContext(input.context),
        }),
        12000,
      );
      return parseLesson(raw, { ...input, kind: "lesson" });
    }),
});

/** Reexportado para os testes conferirem o mapeamento de erro sem subir router. */
export { mapGenerationError };
