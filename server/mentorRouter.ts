/**
 * Mentor Router — SOE v10
 * Features: Perfil de Pontos Fracos, Briefing Diário, Sessão Adaptativa, Diagnóstico Pós-Erro
 */

import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as storage from "./jsonStorage";

// ─── helpers ──────────────────────────────────────────────────────────────────

type ClaudeContentPart = { type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

function callClaude(apiKey: string, prompt: string, maxTokens = 1200, imageBase64?: string): Promise<string> {
  const content: ClaudeContentPart[] = [];
  if (imageBase64) {
    const [mime, data] = imageBase64.includes(",") ? imageBase64.split(",") : ["image/jpeg", imageBase64];
    const actualMime = mime.includes(":") ? mime.split(":")[1].split(";")[0] : "image/jpeg";
    content.push({
      type: "image",
      source: { type: "base64", media_type: actualMime, data: data },
    });
  }
  content.push({ type: "text", text: prompt });

  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: maxTokens,
      messages: [{ role: "user", content }],
    }),
  })
    .then((r) => r.json())
    .then((d: { error?: { message?: string }; content?: { text: string }[] }) => {
      if (d.error) throw new Error(d.error.message ?? "Erro na API Claude");
      return d.content?.[0]?.text ?? "";
    });
}

async function callGemini(apiKey: string, prompt: string, maxTokens = 1200, imageBase64?: string): Promise<string> {
  // Lista de modelos para tentar em ordem — cada um tem cotas independentes
  const GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
  ];

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: prompt }];
  if (imageBase64) {
    const [mime, data] = imageBase64.includes(",") ? imageBase64.split(",") : ["image/jpeg", imageBase64];
    const actualMime = mime.includes(":") ? mime.split(":")[1].split(";")[0] : "image/jpeg";
    parts.push({ inlineData: { mimeType: actualMime, data: data } });
  }

  let lastError = "";
  for (const model of GEMINI_MODELS) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
          }),
        }
      );
      const d = await r.json() as { error?: { message?: string }; candidates?: { content: { parts: { text: string }[] } }[] };

      // Se deu erro de cota (429) ou modelo não encontrado, tenta o próximo
      if (d.error) {
        const msg: string = d.error.message || "Erro Gemini";
        const isQuota = msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("exceeded") || r.status === 429;
        const isNotFound = msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("not supported") || r.status === 404;
        if (isQuota || isNotFound) {
          lastError = `[${model}] ${msg}`;
          console.warn(`[Gemini] Modelo ${model} indisponível, tentando próximo...`);
          continue;
        }
        throw new Error(msg);
      }

      return (d.candidates?.[0]?.content?.parts?.[0]?.text as string) || "";
    } catch (err: unknown) {
      // Só propaga se não for erro de cota
      if (!err.message?.toLowerCase().includes("quota") && !err.message?.toLowerCase().includes("exceeded")) {
        throw err;
      }
      lastError = err.message;
      console.warn(`[Gemini] Erro no modelo ${model}: ${err.message}`);
    }
  }

  throw new Error(`Todos os modelos Gemini estão com cota esgotada. Último erro: ${lastError}\n\nSolução: ative o faturamento em console.cloud.google.com ou use uma chave de outra conta Google.`);
}

function callOpenAI(apiKey: string, prompt: string, maxTokens = 1200, imageBase64?: string): Promise<string> {
  type OpenAIContent = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
  const content: OpenAIContent[] = [];
  if (imageBase64) {
    content.push({
      type: "image_url",
      image_url: { url: imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` },
    });
  }
  content.push({ type: "text", text: prompt });

  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content }],
      max_tokens: maxTokens,
    }),
  })
    .then((r) => r.json())
    .then((d: { error?: { message?: string }; choices?: { message: { content: string } }[] }) => {
      if (d.error) throw new Error(d.error.message ?? "Erro OpenAI");
      return d.choices?.[0]?.message?.content ?? "";
    });
}

async function callAI(
  provider: "claude" | "gemini" | "openai",
  apiKey: string,
  prompt: string,
  maxTokens = 1200,
  imageBase64?: string
): Promise<string> {
  if (provider === "claude") return callClaude(apiKey, prompt, maxTokens, imageBase64);
  if (provider === "gemini") return callGemini(apiKey, prompt, maxTokens, imageBase64);
  return callOpenAI(apiKey, prompt, maxTokens, imageBase64);
}

/**
 * Extrator robusto de JSON que lida com textos extras da IA e strings mal terminadas
 */
/**
 * Extrator de JSON ultra-robusto que lida com truncamento em qualquer ponto.
 * Se o JSON for cortado no meio de uma chave ou valor, ele retrocede até o último ponto válido.
 */
export function extractJSON(text: string): unknown {
  if (!text) throw new Error("Resposta da IA está vazia.");

  // 1. Limpeza inicial
  let cleaned = text.replace(/```json\s?([\s\S]*?)```/g, '$1')
                    .replace(/```\s?([\s\S]*?)```/g, '$1')
                    .trim();

  const start = cleaned.indexOf("{");
  if (start === -1) throw new Error("Nenhum objeto JSON encontrado.");
  
  let jsonStr = cleaned.substring(start).trim();

  // 2. Tenta o parse direto
  try { return JSON.parse(jsonStr); } catch (e) {}

  // 3. Algoritmo de recuperação de JSON truncado
  // Tenta remover caracteres do final até que o JSON se torne válido (após fechar as estruturas)
  let current = jsonStr;
  
  // Limpeza de caracteres que costumam quebrar o parse no final de truncamentos
  current = current.replace(/[,:\[\{\" \n\r\t]+$/, "");

  // Tentativa iterativa de fechamento
  for (let i = 0; i < 100; i++) { // Limite de tentativas para evitar loop infinito
    try {
      // Tenta fechar aspas se estiverem abertas
      let attempt = current;
      const quotes = (attempt.match(/"/g) || []).length;
      if (quotes % 2 !== 0) attempt += '"';

      // Conta balanço de chaves e colchetes
      const openBraces = (attempt.match(/\{/g) || []).length;
      const closeBraces = (attempt.match(/\}/g) || []).length;
      const openBrackets = (attempt.match(/\[/g) || []).length;
      const closeBrackets = (attempt.match(/\]/g) || []).length;

      if (openBrackets > closeBrackets) attempt += "]".repeat(openBrackets - closeBrackets);
      if (openBraces > closeBraces) attempt += "}".repeat(openBraces - closeBraces);

      return JSON.parse(attempt);
    } catch (e) {
      // Se falhou, remove o último caractere "significativo" e tenta de novo
      // Remove a última palavra/valor que pode estar incompleto
      const lastSpecial = Math.max(
        current.lastIndexOf(","),
        current.lastIndexOf("["),
        current.lastIndexOf("{"),
        current.lastIndexOf(":")
      );
      
      if (lastSpecial <= 0) break;
      current = current.substring(0, lastSpecial).trim();
      // Remove vírgulas ou dois pontos que sobraram no final
      current = current.replace(/[,:]+$/, "").trim();
    }
  }

  throw new Error("Não foi possível recuperar o JSON da resposta truncada.");
}

// ─── router ───────────────────────────────────────────────────────────────────

export const mentorRouter = router({
  /**
   * Perfil de Pontos Fracos — cruza dados de F04 recall + accuracy + erros salvos
   * Retorna ranking de disciplinas/tópicos por vulnerabilidade
   */
  getWeakProfile: protectedProcedure.query(async ({ ctx }) => {
    const [disciplines, topics, revisions, errors, rebalance, forgetting] = await Promise.all([
      storage.getDisciplinesByUser(ctx.user.id),
      storage.getTopicsByUser(ctx.user.id),
      storage.getRevisionsByUser(ctx.user.id),
      storage.getQuestionErrorsByUser(ctx.user.id, {}).then(r => r.items),
      storage.getDisciplineRebalanceReport(ctx.user.id),
      storage.getForgettingVelocityByDiscipline(ctx.user.id),
    ]);

    const completedRevisions = revisions.filter((r) => r.completed);

    const weakTopics = topics
      .map((t) => {
        const perf = t.performance;
        const topicRevs = completedRevisions.filter((r) => r.topicId === t.id);
        const recallRatings = topicRevs
          .map((r) => (r as { recallRating?: number }).recallRating)
          .filter(Boolean) as number[];
        const avgRecall =
          recallRatings.length > 0
            ? recallRatings.reduce((a, b) => a + b, 0) / recallRatings.length
            : null;
        const accuracy =
          perf && perf.questionsResolved > 0
            ? perf.correctCount / perf.questionsResolved
            : null;
        const topicErrors = errors.filter((e) => e.topicId === t.id);
        const errorCount = topicErrors.length;

        // Vulnerability score 0-100: lower accuracy + lower recall + more errors = higher score
        let score = 0;
        if (accuracy !== null) score += (1 - accuracy) * 40;
        if (avgRecall !== null) score += ((5 - avgRecall) / 4) * 30;
        score += Math.min(errorCount * 5, 30);

        const disc = disciplines.find((d) => d.id === t.disciplineId);

        return {
          topicId: t.id,
          topicName: t.name,
          disciplineId: t.disciplineId,
          disciplineName: disc?.name ?? "—",
          disciplineColor: disc?.color ?? "#888",
          accuracy: accuracy !== null ? Math.round(accuracy * 100) : null,
          avgRecall: avgRecall ? Math.round(avgRecall * 10) / 10 : null,
          questionsResolved: perf?.questionsResolved ?? 0,
          errorCount,
          vulnerabilityScore: Math.round(score),
          revisionCount: topicRevs.length,
          lastRevision:
            topicRevs.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))[0]
              ?.completedAt ?? null,
        };
      })
      .filter((t) => t.questionsResolved > 0 || t.errorCount > 0 || t.revisionCount > 0)
      .sort((a, b) => b.vulnerabilityScore - a.vulnerabilityScore);

    // Discipline-level aggregation
    const weakDisciplines = disciplines.map((d) => {
      const dTopics = weakTopics.filter((t) => t.disciplineId === d.id);
      const rb = rebalance.find((r) => r.disciplineId === d.id);
      const fv = forgetting.find((f) => f.disciplineId === d.id);
      const avgScore =
        dTopics.length > 0
          ? dTopics.reduce((s, t) => s + t.vulnerabilityScore, 0) / dTopics.length
          : 0;
      return {
        disciplineId: d.id,
        name: d.name,
        color: d.color,
        avgVulnerabilityScore: Math.round(avgScore),
        accuracy: rb?.accuracy ?? null,
        questionsResolved: rb?.questionsResolved ?? 0,
        forgettingVolatility: fv?.volatility ?? "low",
        topicCount: dTopics.length,
        topWorstTopics: dTopics.slice(0, 3),
      };
    }).sort((a, b) => b.avgVulnerabilityScore - a.avgVulnerabilityScore);

    return { weakTopics: weakTopics.slice(0, 20), weakDisciplines };
  }),

  /**
   * Briefing Diário — IA gera plano personalizado baseado nos dados do usuário
   */
  getDailyBriefing: protectedProcedure
    .input(
      z.object({
        apiKey: z.string().min(1),
        provider: z.enum(["claude", "gemini", "openai"]).default("claude"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [stats, revisions, disciplines, topics, errors, rebalance, snapshots, regressions, weakFromSnap] = await Promise.all([
        storage.getDashboardStats(ctx.user.id),
        storage.getRevisionsByUser(ctx.user.id),
        storage.getDisciplinesByUser(ctx.user.id),
        storage.getTopicsByUser(ctx.user.id),
        storage.getQuestionErrorsByUser(ctx.user.id, { limit: 50 }).then(r => r.items),
        storage.getDisciplineRebalanceReport(ctx.user.id),
        storage.getTecSnapshots(ctx.user.id, 2),
        storage.getTecRegressions(ctx.user.id, 5),
        storage.getWeakTopicsFromSnapshot(ctx.user.id, 65),
      ]);

      const todayRevisions = revisions.filter((r) => {
        if (r.completed || r.ignored) return false;
        const d = new Date(r.scheduledDate);
        const today = new Date();
        return (
          d.getFullYear() === today.getFullYear() &&
          d.getMonth() === today.getMonth() &&
          d.getDate() === today.getDate()
        );
      });

      const urgentRevisions = todayRevisions.slice(0, 5).map((r) => {
        const t = topics.find((t) => t.id === r.topicId);
        const d = disciplines.find((d) => d.id === t?.disciplineId);
        return `${d?.name ?? ""} > ${t?.name ?? ""} (revisão #${r.revisionNumber})`;
      });

      const weakDiscs = rebalance
        .filter((d) => d.questionsResolved > 0 && d.accuracy < 65)
        .sort((a, b) => a.accuracy - b.accuracy)
        .slice(0, 5)
        .map((d) => `${d.name}: ${d.accuracy}% de acerto (${d.questionsResolved} questões)`);

      const recentErrors = errors.slice(0, 5).map((e) => {
        const d = disciplines.find((d) => d.id === e.disciplineId);
        return `${d?.name ?? ""}: ${e.errorOrigin ?? "erro"} — "${e.statement.slice(0, 80)}..."`;
      });

      const totalQuestionsResolved = ((stats as { disciplineStats?: Array<{ performance?: { questionsResolved?: number } }> }).disciplineStats ?? []).reduce(
        (sum: number, d) => sum + (d.performance?.questionsResolved ?? 0),
        0
      );

      // ── Contexto TEC fresco ──────────────────────────────────────────────
      const latestSnap = snapshots[0];
      const previousSnap = snapshots[1];

      const tecContext = latestSnap
        ? `\n\nDESEMPENHO TEC (última importação: ${latestSnap.importedAt.split("T")[0]}):\n` +
          `- Total geral: ${latestSnap.totalQuestions} questões | ${latestSnap.overallAccuracy}% de acerto\n` +
          (previousSnap
            ? `- Variação vs importação anterior (${previousSnap.importedAt.split("T")[0]}): ` +
              `${latestSnap.totalQuestions - previousSnap.totalQuestions > 0 ? "+" : ""}${latestSnap.totalQuestions - previousSnap.totalQuestions} questões, ` +
              `${latestSnap.overallAccuracy - previousSnap.overallAccuracy > 0 ? "+" : ""}${latestSnap.overallAccuracy - previousSnap.overallAccuracy}pp de acerto\n`
            : "") +
          (weakFromSnap.length > 0
            ? `- Tópicos críticos (acerto < 65%, ≥5 questões):\n` +
              weakFromSnap
                .slice(0, 6)
                .map((t) => `  • ${t.disciplineName} > ${t.topicName}: ${t.accuracy}% (${t.errorCount} erros em ${t.questionsResolved} questões)`)
                .join("\n")
            : "- Nenhum tópico crítico identificado no último snapshot")
        : "";

      const regressionContext =
        regressions.length > 0
          ? `\n\nREGRESSÕES DETECTADAS (tópicos que pioraram ≥5pp desde a penúltima importação):\n` +
            regressions
              .slice(0, 4)
              .map((r) => `  ⚠ ${r.disciplineName} > ${r.topicName}: ${r.previousAccuracy}% → ${r.currentAccuracy}% (${r.delta}pp)`)
              .join("\n")
          : "";

      const prompt = `Você é o Mentor SOE — um professor particular dedicado exclusivamente a este aluno concurseiro.

DADOS DO ALUNO HOJE:
- Total de questões resolvidas (banco SOE): ${totalQuestionsResolved}
- Revisões pendentes HOJE: ${todayRevisions.length}
- Revisões urgentes: ${urgentRevisions.length > 0 ? urgentRevisions.join("; ") : "nenhuma"}
- Disciplinas com fraqueza (banco SOE): ${weakDiscs.length > 0 ? weakDiscs.join("; ") : "sem dados suficientes"}
- Últimos erros registrados: ${recentErrors.length > 0 ? recentErrors.join(" | ") : "nenhum registrado"}${tecContext}${regressionContext}

INSTRUÇÕES:
- Os dados do TEC Concursos são os mais confiáveis — priorize-os no diagnóstico.
- Se houver regressões, elas são URGENTES e devem entrar no plano do dia.
- Se não houver dados TEC, use os dados do banco SOE normalmente.
- Seja cirúrgico: cite o tópico exato, o percentual exato, o que fazer.

Escreva o briefing no formato exato:

**🎯 Foco de hoje:** [1 ação principal — disciplina e tópico específico, com o % de acerto atual]

**⚠️ Ponto crítico:** [a vulnerabilidade mais grave — dados numéricos obrigatórios]

**✅ Plano do dia:**
1. [ação concreta: disciplina > tópico + meta mensurável]
2. [ação concreta]
3. [ação concreta]

**📊 Pulso da semana:** [1 linha: o que melhorou e o que piorou — com números]

**💬 Mensagem do mentor:** [2 linhas — honesto, direto, sem clichê]

Máximo 200 palavras. Linguagem de treinador que quer te ver passar.`;

      try {
        const briefing = await callAI(input.provider, input.apiKey, prompt, 800);
        return {
          briefing,
          generatedAt: new Date().toISOString(),
          hasTecData: !!latestSnap,
          regressionCount: regressions.length,
          weakTopicCount: weakFromSnap.length,
        };
      } catch (err: unknown) {
        throw new Error(`Falha ao gerar briefing: ${err.message}`);
      }
    }),

  /**
   * Gera questão adaptativa — do banco próprio OU via IA se não houver
   */
  generateAdaptiveQuestion: protectedProcedure
    .input(
      z.object({
        disciplineId: z.number(),
        topicId: z.number().optional(),
        difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
        sessionHistory: z
          .array(
            z.object({
              questionId: z.string(),
              correct: z.boolean(),
              errorOrigin: z.string().optional(),
            })
          )
          .default([]),
        apiKey: z.string().min(1),
        provider: z.enum(["claude", "gemini", "openai"]).default("claude"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [errors, disciplines, topics] = await Promise.all([
        storage.getQuestionErrorsByUser(ctx.user.id, {
          disciplineId: input.disciplineId,
          ...(input.topicId ? { topicId: input.topicId } : {}),
          limit: 200,
        }).then(r => r.items),
        storage.getDisciplinesByUser(ctx.user.id),
        storage.getTopicsByUser(ctx.user.id),
      ]);

      const disc = disciplines.find((d) => d.id === input.disciplineId);
      const topic = topics.find((t) => t.id === input.topicId);

      const alreadyUsedIds = input.sessionHistory.map((h) => h.questionId);
      const availableFromBank = errors.filter(
        (e) => e.correctAnswer && e.statement && !alreadyUsedIds.includes(String(e.id))
      );

      // Use bank question if available and difficulty matches
      if (availableFromBank.length > 0) {
        const pick =
          availableFromBank[Math.floor(Math.random() * Math.min(availableFromBank.length, 5))];
        return {
          source: "bank" as const,
          questionId: String(pick.id),
          statement: pick.statement,
          alternatives: pick.alternatives,
          correctAnswer: pick.correctAnswer ?? "",
          banca: pick.banca ?? "",
          year: pick.year,
          topicName: topic?.name ?? "",
          disciplineName: disc?.name ?? "",
          hint: null,
        };
      }

      // Generate with AI
      const diffLabel =
        input.difficulty === "easy"
          ? "básica (conceito direto)"
          : input.difficulty === "hard"
          ? "difícil (pegadinha ou exceção legal)"
          : "intermediária (aplicação prática)";

      const recentMistakes = input.sessionHistory
        .filter((h) => !h.correct)
        .slice(-3)
        .map((h) => `errorOrigin:${h.errorOrigin ?? "desconhecido"}`);

      const prompt = `Você é professor de concursos públicos. Crie UMA questão de múltipla escolha de dificuldade ${diffLabel}.

Disciplina: ${disc?.name ?? "Direito"}
Tópico: ${topic?.name ?? "geral"}
${recentMistakes.length > 0 ? `Erros recentes do aluno: ${recentMistakes.join(", ")} — explore esse ponto fraco` : ""}

Retorne EXATAMENTE neste formato JSON (sem markdown, sem explicação, só o JSON):
{
  "statement": "enunciado completo da questão",
  "alternatives": [
    {"letter": "A", "text": "texto alternativa A"},
    {"letter": "B", "text": "texto alternativa B"},
    {"letter": "C", "text": "texto alternativa C"},
    {"letter": "D", "text": "texto alternativa D"},
    {"letter": "E", "text": "texto alternativa E"}
  ],
  "correctAnswer": "letra correta (A/B/C/D/E)",
  "banca": "CEBRASPE",
  "hint": "dica de 1 linha sobre o conceito cobrado"
}`;

      try {
        const raw = await callAI(input.provider, input.apiKey, prompt, 900);
        let parsed;
        try {
          parsed = extractJSON(raw);
        } catch (parseErr: unknown) {
          console.error("JSON parsing failed:", parseErr.message);
          console.error("Raw AI response:", raw);
          throw new Error(`Falha ao processar resposta da IA: ${parseErr.message}. Resposta crua: ${raw.substring(0, 200)}...`);
        }
        return {
          source: "ai" as const,
          questionId: `ai_${Date.now()}`,
          statement: parsed.statement,
          alternatives: parsed.alternatives,
          correctAnswer: parsed.correctAnswer,
          banca: parsed.banca ?? "IA",
          year: new Date().getFullYear(),
          topicName: topic?.name ?? "",
          disciplineName: disc?.name ?? "",
          hint: parsed.hint ?? null,
        };
      } catch (err: unknown) {
        throw new Error(`Falha ao gerar questão: ${err.message}`);
      }
    }),

  /**
   * Diagnóstico Pós-Erro — IA explica o erro E gera 2 questões de fixação
   */
  diagnoseError: protectedProcedure
    .input(
      z.object({
        statement: z.string(),
        alternatives: z.array(z.object({ letter: z.string(), text: z.string() })),
        userAnswer: z.string(),
        correctAnswer: z.string(),
        errorOrigin: z.enum(["attention", "forgetting", "theory", "trap"]).optional(),
        disciplineName: z.string(),
        topicName: z.string(),
        apiKey: z.string().min(1),
        provider: z.enum(["claude", "gemini", "openai"]).default("claude"),
      })
    )
    .mutation(async ({ ctx: _ctx, input }) => {
      const chosenText =
        input.alternatives.find((a) => a.letter === input.userAnswer)?.text ?? "";
      const correctText =
        input.alternatives.find((a) => a.letter === input.correctAnswer)?.text ?? "";

      const prompt = `Você é o Mentor SOE — professor particular de concursos. O aluno acabou de errar uma questão na sessão adaptativa. Dê um diagnóstico CIRÚRGICO e IMEDIATO.

Disciplina: ${input.disciplineName} | Tópico: ${input.topicName}
Questão: ${input.statement}
${input.alternatives.map((a) => `${a.letter}) ${a.text}`).join("\n")}

Aluno marcou: ${input.userAnswer}) ${chosenText}
Gabarito: ${input.correctAnswer}) ${correctText}
Tipo de erro: ${input.errorOrigin ?? "não classificado"}

Responda em JSON exato (sem markdown):
{
  "diagnosis": "2-3 linhas: por que a correta é correta e a escolhida está errada — use os textos das alternativas",
  "concept": "O conceito-chave cobrado em 1 linha",
  "rule": "Regra ou macete para não errar de novo — máx 20 palavras",
  "fixationQuestions": [
    {
      "statement": "questão de fixação 1 — explora esse mesmo conceito de outro ângulo",
      "alternatives": [
        {"letter": "A", "text": "..."},
        {"letter": "B", "text": "..."},
        {"letter": "C", "text": "..."},
        {"letter": "D", "text": "..."}
      ],
      "correctAnswer": "letra",
      "explanation": "por que essa é a correta em 1 linha"
    },
    {
      "statement": "questão de fixação 2 — variação ou exceção do mesmo conceito",
      "alternatives": [
        {"letter": "A", "text": "..."},
        {"letter": "B", "text": "..."},
        {"letter": "C", "text": "..."},
        {"letter": "D", "text": "..."}
      ],
      "correctAnswer": "letra",
      "explanation": "por que essa é a correta em 1 linha"
    }
  ]
}`;

      try {
        const raw = await callAI(input.provider, input.apiKey, prompt, 1400);
        let parsed;
        try {
          parsed = extractJSON(raw);
        } catch (parseErr: unknown) {
          console.error("JSON parsing failed:", parseErr.message);
          console.error("Raw AI response:", raw);
          throw new Error(`Falha ao processar resposta da IA: ${parseErr.message}. Resposta crua: ${raw.substring(0, 200)}...`);
        }
        return {
          diagnosis: parsed.diagnosis ?? "",
          concept: parsed.concept ?? "",
          rule: parsed.rule ?? "",
          fixationQuestions: parsed.fixationQuestions ?? [],
        };
      } catch (err: unknown) {
        throw new Error(`Falha no diagnóstico: ${err.message}`);
      }
    }),

  /**
   * Salva resultado de sessão adaptativa para atualizar performance
   */
  saveSessionResult: protectedProcedure
    .input(
      z.object({
        disciplineId: z.number(),
        topicId: z.number().optional(),
        correct: z.number(),
        wrong: z.number(),
        durationSeconds: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.topicId) {
        await storage.updateTopicPerformance(input.topicId, ctx.user.id, {
          correctCount: input.correct,
          errorCount: input.wrong,
        });
      }
      if (input.durationSeconds && input.topicId) {
        await storage.addTopicStudyTime(input.topicId, ctx.user.id, input.durationSeconds);
      }
      const totalQ = input.correct + input.wrong;
      const accuracy = totalQ > 0 ? Math.round((input.correct / totalQ) * 100) : 0;
      await storage.logStudySession(
        ctx.user.id,
        new Date().getHours(),
        Math.round((input.durationSeconds ?? 0) / 60),
        accuracy,
        input.disciplineId
      );
      return { success: true };
    }),

  /**
   * Retorna regressões detectadas entre os dois últimos snapshots TEC
   */
  getTecRegressions: protectedProcedure
    .input(z.object({ thresholdPp: z.number().default(5) }))
    .query(async ({ ctx, input }) => {
      const [regressions, snapshots, weakTopics] = await Promise.all([
        storage.getTecRegressions(ctx.user.id, input.thresholdPp),
        storage.getTecSnapshots(ctx.user.id, 2),
        storage.getWeakTopicsFromSnapshot(ctx.user.id, 65),
      ]);
      const latest = snapshots[0] || null;
      const previous = snapshots[1] || null;
      return {
        regressions,
        weakTopics,
        latestSnapshot: latest
          ? {
              importedAt: latest.importedAt,
              totalQuestions: latest.totalQuestions,
              overallAccuracy: latest.overallAccuracy,
            }
          : null,
        previousSnapshot: previous
          ? {
              importedAt: previous.importedAt,
              totalQuestions: previous.totalQuestions,
              overallAccuracy: previous.overallAccuracy,
            }
          : null,
        deltaAccuracy: latest && previous ? latest.overallAccuracy - previous.overallAccuracy : null,
        deltaQuestions: latest && previous ? latest.totalQuestions - previous.totalQuestions : null,
      };
    }),

  /**
   * Lista todos os snapshots TEC do usuário
   */
  listTecSnapshots: protectedProcedure
    .input(z.object({ limit: z.number().default(10) }))
    .query(async ({ ctx, input }) => {
      return storage.getTecSnapshots(ctx.user.id, input.limit);
    }),

  /**
   * Gera Mnemônico Divertido/Bizarro para um tópico problemático
   */
  generateMnemonicForTopic: protectedProcedure
    .input(
      z.object({
        topicId: z.number(),
        apiKey: z.string().min(1),
        provider: z.enum(["claude", "gemini", "openai"]).default("claude"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [errors, topics, disciplines] = await Promise.all([
        storage.getQuestionErrorsByUser(ctx.user.id, { topicId: input.topicId }).then(r => r.items),
        storage.getTopicsByUser(ctx.user.id),
        storage.getDisciplinesByUser(ctx.user.id),
      ]);

      const topic = topics.find(t => t.id === input.topicId);
      if (!topic) throw new Error("Tópico não encontrado.");

      const disc = disciplines.find(d => d.id === topic.disciplineId);

      const errorTexts = errors.slice(0, 10).map(e => `${e.statement} (Gabarito: ${e.correctAnswer})`).join("\n");

      const prompt = `Você é um gênio na criação de mnemônicos absurdos e inesquecíveis para concurseiros.
O aluno tem errado recorrentemente questões do seguinte tema:
Disciplina: ${disc?.name ?? ""}
Tópico: ${topic.name}

Algumas questões e os gabaritos que ele errou:
${errorTexts}

Com base nesse padrão de erro ou nos conceitos dessas questões, crie UM mnemônico incrível, bizarro, engraçado ou absurdo que ele NUNCA MAIS vai esquecer. Pode ser uma frase, uma historinha idiota ou um acrônimo apelativo.
Responda apenas com o mnemônico e uma breve explicação de 2 linhas.`;

      try {
        const mnemonic = await callAI(input.provider, input.apiKey, prompt, 600);
        
        // Salva o mnemônico como uma anotação de sobrevivência no banco local
        const mantras = topic.topicNotes || [];
        mantras.push(mnemonic);
        await storage.updateTopicNotes(topic.id, ctx.user.id, mantras);

        return { mnemonic };
      } catch (err: unknown) {
        throw new Error(`Falha ao gerar mnemônico: ${err.message}`);
      }
    }),

  /**
   * Analisa redação subjetiva via imagem
   */
  /**
   * Transcreve redação subjetiva via imagem (OCR)
   */
  transcribeSubjectiveEssay: protectedProcedure
    .input(
      z.object({
        apiKey: z.string().min(1),
        provider: z.enum(["claude", "gemini", "openai"]).default("claude"),
        imageBase64: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const prompt = `Você é um assistente especializado em transcrição de textos manuscritos. 
Sua tarefa é transcrever INTEGRALMENTE e FIELMENTE o texto contido na imagem.

**REGRAS:**
1. Preserve a paragrafação original.
2. Não corrija erros gramaticais ou ortográficos (transcreva exatamente como escrito).
3. Se houver palavras ilegíveis, use [ilegível].
4. Responda APENAS com o texto transcrito, sem comentários, sem markdown, sem introduções.`;
      
      try {
        const transcription = await callAI(input.provider, input.apiKey, prompt, 1500, input.imageBase64);
        return { transcription: transcription.trim() };
      } catch (err: unknown) {
        throw new Error(`Falha na transcrição IA: ${err.message}`);
      }
    }),

  analyzeSubjectiveEssay: protectedProcedure
    .input(
      z.object({
        apiKey: z.string().min(1),
        provider: z.enum(["claude", "gemini", "openai"]).default("claude"),
        imageBase64: z.string(),
        prompt: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const raw = await callAI(input.provider, input.apiKey, input.prompt, 2000, input.imageBase64);
        let parsed;
        try {
          parsed = extractJSON(raw);
        } catch (parseErr: unknown) {
          console.error("JSON parsing failed:", parseErr.message);
          console.error("Raw AI response:", raw);
          throw new Error(`Falha ao processar resposta da IA: ${parseErr.message}. Resposta crua: ${raw.substring(0, 200)}...`);
        }
        return parsed;
      } catch (err: unknown) {
        throw new Error(`Falha na correção IA: ${err.message}`);
      }
    }),
});
