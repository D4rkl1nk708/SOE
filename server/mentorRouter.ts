/**
 * Mentor Router — SOE v10
 * Features: Perfil de Pontos Fracos, Briefing Diário, Sessão Adaptativa, Diagnóstico Pós-Erro
 */

import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as storage from "./jsonStorage";

// ─── helpers ──────────────────────────────────────────────────────────────────

import { callAiProvider } from "./aiProviders";

async function callAI(
  provider: "claude" | "gemini" | "openai",
  apiKeyString: string,
  prompt: string,
  maxTokens = 1200,
  imageBase64?: string
): Promise<string> {
  return callAiProvider(provider, apiKeyString, prompt, maxTokens, imageBase64);
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
   * Insights Rápidos de Estatística — IA analisa os números e dá 1 linha de impacto
   */
  getStatsInsight: protectedProcedure
    .input(
      z.object({
        apiKey: z.string().min(1),
        provider: z.enum(["claude", "gemini", "openai"]).default("gemini"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const stats = await storage.getDashboardStats(ctx.user.id);
      const totalResolved = (stats.disciplineStats ?? []).reduce((sum, d) => sum + (d.performance?.questionsResolved ?? 0), 0);
      const totalCorrect = (stats.disciplineStats ?? []).reduce((sum, d) => sum + (d.performance?.correctCount ?? 0), 0);
      const overallAccuracy = totalResolved > 0 ? Math.round(totalCorrect / totalResolved * 100) : 0;
      
      const discList = (stats.disciplineStats ?? []).map(d => `${d.name}: ${d.performance?.accuracy ?? 0}% (${d.performance?.questionsResolved ?? 0}q)`).join(", ");

      const prompt = `Você é o Mentor SOE. Analise as estatísticas atuais do aluno e dê UM insight de 1 frase (máximo 25 palavras) que seja encorajador mas cirúrgico.
      
      DADOS:
      - Total resolvidas: ${totalResolved}
      - Acerto Geral: ${overallAccuracy}%
      - Desempenho por matéria: ${discList}
      
      Responda em português, direto, sem introduções. Use negrito em partes importantes.`;

      try {
        const insight = await callAI(input.provider, input.apiKey, prompt, 200);
        return { insight: insight.trim() };
      } catch (err: any) {
        return { insight: "Continue focado na constância. O resultado vem com o tempo." };
      }
    }),

  /**
   * Briefing Diário — IA gera plano personalizado baseado nos dados do usuário
   */
  getDailyBriefing: protectedProcedure
    .input(
      z.object({
        apiKey: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [stats, revisions, disciplines, topics, errors, rebalance, snapshots, regressions, weakFromSnap, observationsResult] = await Promise.all([
        storage.getDashboardStats(ctx.user.id),
        storage.getRevisionsByUser(ctx.user.id),
        storage.getDisciplinesByUser(ctx.user.id),
        storage.getTopicsByUser(ctx.user.id),
        storage.getQuestionErrorsByUser(ctx.user.id, { limit: 50 }).then(r => r.items),
        storage.getDisciplineRebalanceReport(ctx.user.id),
        storage.getTecSnapshots(ctx.user.id, 2),
        storage.getTecRegressions(ctx.user.id, 5),
        storage.getWeakTopicsFromSnapshot(ctx.user.id, 65),
        storage.getMentorObservations(ctx.user.id),
      ]);

      const observations = observationsResult as string[];


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
- Últimos erros registrados: ${recentErrors.length > 0 ? recentErrors.join(" | ") : "nenhum registrado"}${tecContext}${regressionContext}
- Memória Estratégica (Padrões detectados anteriormente):
${observations.length > 0 ? observations.join("\n") : "Nenhum padrão detectado ainda."}

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
      } catch (err: any) {
        throw new Error(`Falha ao gerar briefing: ${err.message}`);
      }
    }),

  /**
   * Relatório Profundo — IA analisa o perfil completo e gera um relatório narrativo
   */
  generateDeepAnalysis: protectedProcedure
    .input(
      z.object({
        apiKey: z.string().min(1),
        provider: z.enum(["claude", "gemini", "openai"]).default("gemini"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [stats, weak, errors, disciplines, revisions, regressions] = await Promise.all([
        storage.getDashboardStats(ctx.user.id),
        storage.getWeakTopicsFromSnapshot(ctx.user.id),
        storage.getQuestionErrorsByUser(ctx.user.id, { limit: 20 }).then(r => r.items),
        storage.getDisciplinesByUser(ctx.user.id),
        storage.getRevisionsByUser(ctx.user.id),
        storage.getTecRegressions(ctx.user.id, 5),
      ]);

      const totalResolved = (stats.disciplineStats ?? []).reduce((sum, d) => sum + (d.performance?.questionsResolved ?? 0), 0);
      const overallAcc = totalResolved > 0 ? Math.round((stats.disciplineStats ?? []).reduce((s, d) => s + (d.performance?.correctCount ?? 0), 0) / totalResolved * 100) : 0;

      const weakList = weak.slice(0, 10).map(t => `- ${t.disciplineName} > ${t.topicName}: ${t.accuracy}%`).join("\n");
      const errorPatterns = errors.map(e => `- ${e.errorOrigin}: ${e.statement.substring(0, 100)}...`).join("\n");

      const prompt = `Você é o Mentor Estratégico SOE. Sua tarefa é analisar o perfil completo de um concurseiro e gerar um "Relatório de Guerra" profundo.

      DADOS DO ALUNO:
      - Total de Questões: ${totalResolved}
      - Acerto Médio: ${overallAcc}%
      - Pontos Críticos (Ranking de Vulnerabilidade):
      ${weakList}
      
      - Padrões de Erro Recentes:
      ${errorPatterns}
      
      - Regressões Detectadas: ${regressions.length} temas pioraram recentemente.

      ESTRUTURA DO RELATÓRIO:
      1. **Diagnóstico da Situação Atual**: Onde o aluno está (faixa de acerto, maturidade).
      2. **Análise de Pontos Cegos**: O que os números sugerem que ele está ignorando (padrões de erro, regressões).
      3. **Ajuste de Rota**: 3 mudanças práticas na rotina para subir o acerto em 10% nas próximas 3 semanas.
      4. **Veredito do Mentor**: Uma mensagem final de impacto.

      Responda em Markdown, com tom profissional, técnico e extremamente motivador. Seja duro onde for preciso.`;

      try {
        const report = await callAI(input.provider, input.apiKey, prompt, 1500);
        return { report };
      } catch (err: any) {
        throw new Error(`Falha ao gerar relatório: ${err.message}`);
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
        let parsed: any;
        try {
          parsed = extractJSON(raw);
        } catch (parseErr: any) {
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
      } catch (err: any) {
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
        let parsed: any;
        try {
          parsed = extractJSON(raw);
        } catch (parseErr: any) {
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
      } catch (err: any) {
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
      } catch (err: any) {
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
      } catch (err: any) {
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
        let parsed: any;
        try {
          parsed = extractJSON(raw);
        } catch (parseErr: any) {
          console.error("JSON parsing failed:", parseErr.message);
          console.error("Raw AI response:", raw);
          throw new Error(`Falha ao processar resposta da IA: ${parseErr.message}. Resposta crua: ${raw.substring(0, 200)}...`);
        }
        return parsed;
      } catch (err: any) {
        throw new Error(`Falha na correção IA: ${err.message}`);
      }
    }),

  chat: protectedProcedure
    .input(
      z.object({
        message: z.string(),
        history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
        apiKey: z.string().min(1),
        provider: z.enum(["claude", "gemini", "openai"]).default("gemini"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // gather basic stats to feed as context
      const [stats, weak, errors, disciplines, revisions, notes, flashcards, topics, observationsResult] = await Promise.all([
        storage.getDashboardStats(ctx.user.id),
        storage.getWeakTopicsFromSnapshot(ctx.user.id, 65),
        storage.getQuestionErrorsByUser(ctx.user.id, { limit: 10 }).then(r => r.items),
        storage.getDisciplinesByUser(ctx.user.id),
        storage.getRevisionsByUser(ctx.user.id),
        storage.getNotesByUser(ctx.user.id),
        storage.getFlashcardsByUser(ctx.user.id),
        storage.getTopicsByUser(ctx.user.id),
        storage.getMentorObservations(ctx.user.id)
      ]);
      
      const observations = observationsResult as string[];

      
      const totalResolved = ((stats as any).disciplineStats ?? []).reduce((sum: number, d: any) => sum + (d.performance?.questionsResolved ?? 0), 0);
      
      const weakStr = weak.length > 0 
        ? weak.slice(0, 5).map(t => `${t.disciplineName} > ${t.topicName} (${t.accuracy}%)`).join(", ")
        : "Nenhum tópico crítico identificado.";

      const errorsStr = errors.length > 0
        ? errors.map(e => {
            const d = disciplines.find(d => d.id === e.disciplineId);
            return `[${d?.name ?? "Desconhecida"}] Questão: "${e.statement.slice(0, 150)}..." | Errou por: ${e.errorOrigin ?? "desconhecido"}`;
          }).join("\n")
        : "Nenhum erro registrado recentemente.";

      const revisionsStr = revisions.filter(r => !r.completed && !r.ignored).slice(0, 10).map(r => {
         const t = topics.find(t => t.id === r.topicId);
         return `Data: ${r.scheduledDate} | Tema: ${t?.name ?? "Desconhecido"}`;
      }).join("\n");

      const notesStr = notes.slice(0, 5).map(n => `- Título: ${n.title} | Resumo: ${n.content.replace(/<[^>]+>/g, '').substring(0, 100)}...`).join("\n");
      const flashcardsCount = flashcards.length;
      
      const topicsStr = topics.sort((a, b) => b.studyDate.localeCompare(a.studyDate))
                              .slice(0, 10)
                              .map(t => `ID: ${t.id} | DiscID: ${t.disciplineId} | Nome: ${t.name}`).join("\n");

      const transcript = input.history.map(m => `${m.role === "user" ? "Aluno" : "Mentor"}: ${m.content}`).join("\n\n");
      
      const prompt = `Você é o Mentor SOE — um professor particular de concursos e mentor de estudos focado em resultado.
Você tem acesso completo e irrestrito ao sistema (SOE) do aluno, incluindo Calendário, Editais, Anotações, Flashcards, Estatísticas, Disciplinas e Questões.

DADOS COMPLETOS DO ALUNO HOJE:
- Estatísticas: ${totalResolved} questões resolvidas no total.
- Pontos fracos críticos: ${weakStr}
- Últimas questões erradas:
${errorsStr}
- Calendário (Próximas revisões pendentes):
${revisionsStr || "Nenhuma revisão pendente."}
- Anotações Recentes:
${notesStr || "Nenhuma anotação."}
- Flashcards: ${flashcardsCount} flashcards salvos.
- Editais/Disciplinas (Tópicos em andamento):
${topicsStr || "Nenhum tópico em andamento."}
- Memória Estratégica (Suas observações passadas sobre este aluno):
${observations.length > 0 ? observations.join("\n") : "Sem observações prévias."}

Você deve responder a nova mensagem do aluno com base no histórico da conversa e neste contexto completo. Sinta-se livre para citar as anotações do aluno, alertar sobre revisões do calendário, ou usar as questões erradas para testá-lo.
Se o aluno pedir questões, gere-as focadas nos pontos fracos. Seja sempre direto, motivador e extremamente personalizado. Use markdown para negritos.

🚨 ALERTA TEÓRICO: Analise ativamente as anotações recentes do aluno fornecidas acima. Se você notar qualquer erro conceitual grave, desatualização jurisprudencial ou legislativa, alerte-o imediatamente!

Poder Mágico 1 (Criação de Flashcards):
Se o aluno te pedir para criar um ou mais flashcards sobre algum assunto, você PODE criá-los automaticamente. Para isso, basta incluir no final da sua resposta blocos exatamente neste formato:
[FLASHCARD]{"front": "Pergunta do flashcard", "back": "Resposta curta e direta", "disciplineId": 123, "topicId": 123}[/FLASHCARD]
Se você não souber o disciplineId ou topicId correto, escolha o DiscID/ID do tópico mais próximo do assunto listado acima. Você pode emitir vários blocos [FLASHCARD].

Poder Mágico 2 (Agendamento de Revisões):
Se o aluno pedir para adiar ou reagendar o estudo/revisão de alguma matéria, você pode fazer isso automaticamente por ele gerando o seguinte bloco no final da resposta:
[RESCHEDULE]{"topicId": 123, "newDate": "YYYY-MM-DD"}[/RESCHEDULE]
Substitua topicId pelo ID numérico do tópico que deve ser reagendado e newDate pela nova data (no formato YYYY-MM-DD, a data de hoje é ${new Date().toISOString().split('T')[0]}). Pode gerar vários blocos se necessário.

Poder Mágico 3 (Memória Estratégica):
Sempre que você notar um padrão de comportamento, um erro recorrente de lógica ou uma evolução notável, salve uma observação curta (máx 15 palavras) para você mesmo ler no futuro usando:
[OBSERVATION]O aluno confunde Atos Compostos com Complexos por causa da estrutura de vontade.[/OBSERVATION]
Isso é fundamental para sua "inteligência" de longo prazo. Gere no máximo 1 observação por resposta.

Poder Mágico 4 (Detector de Confusão):
Sempre que você notar que o aluno está trocando um conceito por outro (ex: confundindo Anulação com Revogação, ou Prescrição com Decadência), use:
[CONFUSION]{"conceptA": "Anulação", "conceptB": "Revogação", "explanation": "O aluno acha que o Judiciário pode revogar atos por mérito."}[/CONFUSION]
Isso ajudará a montar o mapa de pontos cegos dele.

HISTÓRICO DA CONVERSA:
${transcript}

Aluno: ${input.message}
Mentor:`;

      try {
        let reply = await callAI(input.provider, input.apiKey, prompt, 1500);
        let finalReply = reply.trim();
        
        // Extract and execute Flashcards
        const flashcardRegex = /\[FLASHCARD\]([\s\S]*?)\[\/FLASHCARD\]/g;
        let match;
        let createdCount = 0;
        
        while ((match = flashcardRegex.exec(finalReply)) !== null) {
          try {
            const data = JSON.parse(match[1]);
            if (data.front && data.back && data.disciplineId) {
              await storage.createFlashcard({
                userId: ctx.user.id,
                disciplineId: Number(data.disciplineId),
                topicId: data.topicId ? Number(data.topicId) : undefined,
                front: data.front,
                back: data.back
              });
              createdCount++;
            }
          } catch (e) {
            console.error("Falha ao parsear flashcard gerado pela IA:", e);
          }
        }
        
        // Extract and execute Reschedules
        const rescheduleRegex = /\[RESCHEDULE\]([\s\S]*?)\[\/RESCHEDULE\]/g;
        let reschedMatch;
        let rescheduledCount = 0;
        
        while ((reschedMatch = rescheduleRegex.exec(finalReply)) !== null) {
          try {
            const data = JSON.parse(reschedMatch[1]);
            if (data.topicId && data.newDate) {
              const pendingRev = revisions.find(r => r.topicId === Number(data.topicId) && !r.completed && !r.ignored);
              if (pendingRev) {
                 await storage.rescheduleRevision(pendingRev.id, ctx.user.id, data.newDate);
                 rescheduledCount++;
              }
            }
          } catch (e) {
            console.error("Falha ao parsear reagendamento gerado pela IA:", e);
          }
        }
        
        // Remove tags from user view
        finalReply = finalReply.replace(/\[FLASHCARD\]([\s\S]*?)\[\/FLASHCARD\]/g, "").trim();
        finalReply = finalReply.replace(/\[RESCHEDULE\]([\s\S]*?)\[\/RESCHEDULE\]/g, "").trim();
        
        // Extract and save Observation
        const obsRegex = /\[OBSERVATION\]([\s\S]*?)\[\/OBSERVATION\]/g;
        let obsMatch;
        while ((obsMatch = obsRegex.exec(finalReply)) !== null) {
          const obs = obsMatch[1].trim();
          if (obs) await storage.addMentorObservation(ctx.user.id, obs);
        }
        finalReply = finalReply.replace(/\[OBSERVATION\]([\s\S]*?)\[\/OBSERVATION\]/g, "").trim();
        
        // Extract and save Concept Confusion
        const confRegex = /\[CONFUSION\]([\s\S]*?)\[\/CONFUSION\]/g;
        let confMatch;
        while ((confMatch = confRegex.exec(finalReply)) !== null) {
          try {
            const data = JSON.parse(confMatch[1]);
            await storage.addConceptConfusion(ctx.user.id, data);
          } catch(e) {}
        }
        finalReply = finalReply.replace(/\[CONFUSION\]([\s\S]*?)\[\/CONFUSION\]/g, "").trim();
        
        if (createdCount > 0) {
          finalReply += `\n\n✨ *(Criei ${createdCount} flashcard${createdCount > 1 ? 's' : ''} automaticamente para você! Estão na sua aba de Revisão)*`;
        }
        if (rescheduledCount > 0) {
          finalReply += `\n\n📅 *(Reagendei ${rescheduledCount} revisão${rescheduledCount > 1 ? 'ões' : ''} automaticamente para você!)*`;
        }

        return { reply: finalReply };
      } catch (err: any) {
        throw new Error(`Falha no chat: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),

  /**
   * Insights Neurais — Análise profunda de conexões entre matérias e detecção de "efeito platô"
   */
  getNeuralInsights: protectedProcedure
    .input(z.object({
      apiKey: z.string().min(1),
      provider: z.enum(["claude", "gemini", "openai"]).default("gemini"),
    }))
    .mutation(async ({ ctx, input }) => {
      const [stats, weak, errors, disciplines, revisions, notes, observations] = await Promise.all([
        storage.getDashboardStats(ctx.user.id),
        storage.getWeakTopicsFromSnapshot(ctx.user.id, 70),
        storage.getQuestionErrorsByUser(ctx.user.id, { limit: 30 }).then(r => r.items),
        storage.getDisciplinesByUser(ctx.user.id),
        storage.getRevisionsByUser(ctx.user.id),
        storage.getNotesByUser(ctx.user.id),
        storage.getMentorObservations(ctx.user.id),
      ]);

      const prompt = `Você é o Arquiteto de Aprendizagem SOE. Sua tarefa é realizar uma "Neuro-Análise" do perfil do aluno.
      
      DADOS:
      - Observações anteriores: ${observations.join(" | ")}
      - Tópicos Críticos: ${weak.map(t => t.topicName).join(", ")}
      - Erros Recentes: ${errors.map(e => e.errorOrigin).join(", ")}
      
      OBJETIVO:
      Identifique conexões invisíveis entre as falhas do aluno. Por exemplo: "Você erra controle de constitucionalidade porque ainda tem lacunas em Teoria da Constituição".
      Detecte se o aluno está em um "Platô de Desempenho" e por quê.
      
      Retorne um JSON com:
      {
        "diagnosis": "Análise profunda da raiz dos problemas",
        "crossConnections": ["Conexão 1", "Conexão 2"],
        "plateauDetection": "Status do platô (Sim/Não + Explicação)",
        "masteryAction": "A 'Ação de Mestre' — 1 única coisa que mudará tudo"
      }`;

      try {
        const raw = await callAI(input.provider, input.apiKey, prompt, 1200);
        return extractJSON(raw);
      } catch (err: any) {
        throw new Error(`Falha nos insights neurais: ${err.message}`);
      }
    }),

  /**
   * Shadow Examiner — Gera uma sessão de "Stress" com questões focadas em derrubar o aluno
   */
  generateShadowSession: protectedProcedure
    .input(z.object({
      apiKey: z.string().min(1),
      provider: z.enum(["claude", "gemini", "openai"]).default("gemini"),
      count: z.number().default(5)
    }))
    .mutation(async ({ ctx, input }) => {
      const [observations, errors, weak] = await Promise.all([
        storage.getMentorObservations(ctx.user.id),
        storage.getQuestionErrorsByUser(ctx.user.id, { limit: 20 }).then(r => r.items),
        storage.getWeakTopicsFromSnapshot(ctx.user.id, 70)
      ]);

      const prompt = `Você é o "Shadow Examiner" do SOE — seu objetivo é criar questões que TESTEM O LIMITE do aluno.
      
      CONTEXTO DE FALHAS DO ALUNO:
      - Observações do Mentor: ${observations.join(" | ")}
      - Erros reais cometidos: ${errors.map(e => e.statement.substring(0, 100)).join("\n")}
      
      TAREFA:
      Gere ${input.count} questões inéditas de múltipla escolha. 
      Cada questão deve ser uma "pegadinha" ou explorar uma confusão de lógica que o aluno já demonstrou ter nas observações acima.
      Foque nos temas: ${weak.slice(0, 3).map(t => t.topicName).join(", ")}.

      Retorne um JSON com:
      {
        "questions": [
          {
            "statement": "...",
            "alternatives": [{"letter": "A", "text": "..."}, ...],
            "correctAnswer": "A",
            "trapExplanation": "Por que esta questão foi feita para te derrubar e qual o detalhe que você costuma esquecer"
          }
        ]
      }`;

      try {
        const raw = await callAI(input.provider, input.apiKey, prompt, 2500);
        return extractJSON(raw);
      } catch (err: any) {
        throw new Error(`Falha ao gerar Shadow Session: ${err.message}`);
      }
    }),

  /**
   * Fact-Checker de Notas — Analisa anotações em busca de erros teóricos
   */
  verifyNoteAccuracy: protectedProcedure
    .input(z.object({
      noteId: z.number(),
      apiKey: z.string().min(1),
      provider: z.enum(["claude", "gemini", "openai"]).default("gemini"),
    }))
    .mutation(async ({ ctx, input }) => {
      const notes = await storage.getNotesByUser(ctx.user.id);
      const note = notes.find(n => n.id === input.noteId);
      if (!note) throw new Error("Nota não encontrada");

      const prompt = `Você é o Revisor Técnico SOE. Analise a seguinte anotação de estudo de um aluno concorseiro.
      Sua missão é encontrar erros factuais, prazos errados, leis revogadas ou confusões conceituais.
      
      NOTA:
      Título: ${note.title}
      Conteúdo: ${note.content}
      
      Retorne um JSON:
      {
        "isValid": boolean,
        "findings": [
          {
            "severity": "critical" | "warning" | "tip",
            "originalText": "trecho problemático",
            "correction": "o que deveria ser",
            "reason": "explicação técnica/legal"
          }
        ],
        "summary": "Resumo geral da qualidade da nota"
      }`;

      try {
        const raw = await callAI(input.provider, input.apiKey, prompt, 1500);
        return extractJSON(raw);
      } catch (err: any) {
        throw new Error(`Falha no Fact-Check: ${err.message}`);
      }
    }),

  /**
   * Audio-Mentor Script — Gera o roteiro narrativo para uma revisão em áudio
   */
  generateAudioReviewScript: protectedProcedure
    .input(z.object({
      apiKey: z.string().min(1),
      provider: z.enum(["claude", "gemini", "openai"]).default("gemini"),
    }))
    .mutation(async ({ ctx, input }) => {
      const [briefing, observations, weak] = await Promise.all([
        // Simulando a chamada interna para pegar o briefing do dia
        this?.getDailyBriefing.mutate({ ctx, input: { ...input, apiKey: input.apiKey } } as any) as any,
        storage.getMentorObservations(ctx.user.id),
        storage.getWeakTopicsFromSnapshot(ctx.user.id, 65)
      ]);

      const prompt = `Você é um Professor Particular de alto nível gravando um áudio de 5 minutos para seu aluno.
      Use uma linguagem natural, falada, encorajadora e direta. Não use listas, use parágrafos narrativos.
      
      CONTEÚDO PARA ABORDAR:
      - Observações de padrões do aluno: ${observations.slice(-3).join(" | ")}
      - Tópicos críticos: ${weak.slice(0, 2).map(t => t.topicName).join(" e ")}
      
      ESTRUTURA DO ROTEIRO:
      1. Introdução rápida (E aí, pronto para o dia de hoje?).
      2. Revisão rápida do "calcanhar de Aquiles" (os pontos fracos detectados).
      3. O "Pulo do Gato" (uma dica técnica de ouro para hoje).
      4. Mensagem de foco.
      
      Retorne apenas o texto do roteiro, pronto para ser lido por um sintetizador de voz (TTS).`;

      try {
        const script = await callAI(input.provider, input.apiKey, prompt, 1200);
        return { script };
      } catch (err: any) {
        throw new Error(`Falha ao gerar roteiro de áudio: ${err.message}`);
      }
    }),

  /**
   * Propose Flashcard Cleanup — Identifica flashcards de temas masterizados para arquivamento
   */
  proposeFlashcardCleanup: protectedProcedure
    .query(async ({ ctx }) => {
      const [flashcards, topics] = await Promise.all([
        storage.getFlashcardsByUser(ctx.user.id),
        storage.getTopicsByUser(ctx.user.id)
      ]);

      const activeCards = flashcards.filter(f => !f.archived);
      
      const proposals = topics
        .filter(t => t.performance && t.performance.questionsResolved > 20 && t.performance.accuracy > 92)
        .map(t => {
          const topicCards = activeCards.filter(f => f.topicId === t.id);
          if (topicCards.length === 0) return null;
          
          return {
            topicId: t.id,
            topicName: t.name,
            accuracy: t.performance!.accuracy,
            questionCount: t.performance!.questionsResolved,
            cardCount: topicCards.length,
            cardIds: topicCards.map(f => f.id)
          };
        })
        .filter(Boolean);

      return { proposals };
    }),

  /**
   * Execute Flashcard Cleanup — Arquiva os flashcards selecionados
   */
  executeFlashcardCleanup: protectedProcedure
    .input(z.object({ cardIds: z.array(z.number()) }))
    .mutation(async ({ ctx, input }) => {
      for (const id of input.cardIds) {
        await storage.archiveFlashcard(id, ctx.user.id, true);
      }
      return { success: true, archivedCount: input.cardIds.length };
    }),

  /**
   * Get Concept Confusions — Retorna a matriz de confusão do aluno
   */
  getConceptConfusions: protectedProcedure
    .query(async ({ ctx }) => {
      return await storage.getConceptConfusions(ctx.user.id);
    }),

  /**
   * Get Mentor Recommendation — O "Foco de Hoje" IA-Driven
   */
  getMentorRecommendation: protectedProcedure
    .input(z.object({
      apiKey: z.string().min(1),
      provider: z.enum(["claude", "gemini", "openai"]).default("gemini"),
    }))
    .query(async ({ ctx, input }) => {
      const [rebalance, forgetting, weakFromSnap] = await Promise.all([
        storage.getDisciplineRebalanceReport(ctx.user.id),
        storage.getForgettingVelocityByDiscipline(ctx.user.id),
        storage.getWeakTopicsFromSnapshot(ctx.user.id, 75),
      ]);

      const prompt = `Você é o Mentor Estratégico SOE. Analise os dados de desempenho do aluno e gere uma recomendação ÚNICA e CIRÚRGICA de foco para hoje.
      
      DADOS:
      - Desempenho por matéria (Rebalanceamento): ${JSON.stringify(rebalance.slice(0, 5))}
      - Velocidade de Esquecimento: ${JSON.stringify(forgetting.slice(0, 5))}
      - Tópicos Críticos no TEC: ${JSON.stringify(weakFromSnap.slice(0, 5))}
      
      INSTRUÇÕES:
      1. Identifique a matéria onde o aproveitamento MAIS caiu nos últimos 7 dias ou onde o tempo sem estudo é crítico.
      2. Gere uma recomendação em 1 frase curta e impactante.
      3. Inclua o motivo baseado em dados (ex: "seu aproveitamento caiu 15%").
      
      Retorne um JSON:
      {
        "disciplineName": "Nome da Matéria",
        "reason": "Explicação curta com números",
        "action": "O que fazer exatamente (ex: Revisar Atos Administrativos)",
        "priority": "alta" | "media"
      }`;

      try {
        const raw = await callAI(input.provider, input.apiKey, prompt, 400);
        return extractJSON(raw) as { disciplineName: string; reason: string; action: string; priority: "alta" | "media" };
      } catch (err: any) {
        return {
          disciplineName: "Geral",
          reason: "Manutenção de constância",
          action: "Continue com seu plano de revisões agendadas",
          priority: "media" as const
        };
      }
    }),

  /**
   * Gera Mnemônico Divertido/Bizarro/Spicy para uma confusão de conceitos
   */
  generateMnemonicForConfusion: protectedProcedure
    .input(z.object({
      conceptA: z.string(),
      conceptB: z.string(),
      explanation: z.string(),
      apiKey: z.string().min(1),
      provider: z.enum(["claude", "gemini", "openai"]).default("gemini"),
    }))
    .mutation(async ({ input }) => {
      const prompt = `Você é um gênio na criação de mnemônicos ABSURDOS, BIZARROS e INESQUECÍVEIS para concurseiros.
O aluno confunde "${input.conceptA}" com "${input.conceptB}".
Explicação da confusão: ${input.explanation}

TAREFA:
Crie um mnemônico "Premium" (pode usar humor ácido, termos vulgares/baixo calão, contextos +18 ou situações bizarras se isso ajudar na memorização — o aluno deu permissão explícita para ser "sujo" se for mais eficiente).
O objetivo é que ele NUNCA MAIS confunda esses dois conceitos.

Retorne um JSON:
{
  "mnemonic": "O mnemônico em si (frase, acrônimo, historinha)",
  "explanation": "Como aplicar esse mnemônico para diferenciar os conceitos"
}`;

      try {
        const raw = await callAI(input.provider, input.apiKey, prompt, 600);
        return extractJSON(raw) as { mnemonic: string; explanation: string };
      } catch (err: any) {
        throw new Error(`Falha ao gerar mnemônico: ${err.message}`);
      }
    }),
  
  /**
   * Save Concept Confusion — Salva uma nova confusão detectada
   */
  saveConceptConfusion: protectedProcedure
    .input(z.object({
      conceptA: z.string(),
      conceptB: z.string(),
      explanation: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await storage.addConceptConfusion(ctx.user.id, input);
      return { success: true };
    }),
});
