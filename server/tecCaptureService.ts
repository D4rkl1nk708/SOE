/**
 * Captura do TEC (v6.9.5) — servidor.
 *
 * Concentra o que antes vivia espalhado no endpoint /api/tec/increment:
 * classificação da questão (local primeiro, IA só como último recurso), registro
 * da tentativa, pendência de classificação, evento "estudou hoje" e a conclusão
 * automática de UMA revisão de teste por bloco de N questões.
 *
 * Regras que NÃO podem ser quebradas aqui:
 * - nada de rede para o TEC: o serviço só recebe o texto que o app já capturou;
 * - a IA recebe apenas rótulo + trecho do enunciado + lista de disciplinas/tópicos;
 * - nunca cria disciplina/tópico sozinho quando a confiança é baixa (pendência);
 * - nunca mexe na geração 25/50 (`shared/scheduling.ts` intocado): só conclui
 *   revisões que já existem, e o desfazer é `markRevisionCompleted(..., false)`.
 */
import * as storage from "./jsonStorage";
import { classifyTecQuestion } from "./tecQuestionClassifier";
import {
  countTopicAnswersOnDate,
  pickTestRevisionToAutoComplete,
  pickTheoryRevisionSuggestion,
} from "./tecStudyCalendar";
import { normalizeTecLabel } from "../shared/tecLabels";
import { formatDateForDb } from "../shared/scheduling";
import type { QuestionAttempt, UserSettings } from "../shared/types";

export const TEC_MAX_SECONDS = 600;
export const DEFAULT_AUTO_COMPLETE_TEST_AFTER = 5;

export type TecAnswerInput = {
  cadernoId?: string;
  cadernoUrl?: string;
  disciplina?: string;
  assunto?: string;
  questionLabel?: string;
  questionStatement?: string;
  correctAdd?: number;
  errorAdd?: number;
  timeSpentSeconds?: number;
  dedupKey?: string;
  questionSignature?: string;
  questionId?: string;
};

export type TecAutoCompleted = {
  revisionId: number;
  topicId: number;
  topicName: string;
  scheduledDate: string;
  answersToday: number;
};

export type TecTheorySuggestion = {
  revisionId: number;
  topicId: number;
  topicName: string;
  scheduledDate: string;
};

export type TecAnswerResult = {
  ok: true;
  pending: boolean;
  topicId: number | null;
  topicName?: string;
  disciplineId: number | null;
  attemptId: string | null;
  reason: string;
  matchedBy?: string;
  autoCompleted: TecAutoCompleted | null;
  theorySuggestion: TecTheorySuggestion | null;
};

function clampSeconds(value: unknown): number | undefined {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.max(1, Math.min(TEC_MAX_SECONDS, Math.round(seconds)));
}

function autoCompleteThreshold(settings: UserSettings | undefined): number {
  const raw = Number((settings as any)?.autoCompleteTestAfter);
  if (!Number.isFinite(raw)) return DEFAULT_AUTO_COMPLETE_TEST_AFTER;
  return Math.max(0, Math.trunc(raw));
}

function todayIso(now = new Date()): string {
  return formatDateForDb(now);
}

/**
 * Registra UMA resposta vinda do TEC.
 * Lança Error com `status` quando o payload é inválido (o endpoint traduz).
 */
export async function handleTecAnswer(
  userId: number,
  input: TecAnswerInput,
): Promise<TecAnswerResult> {
  const correctAdd = Math.abs(Number(input.correctAdd) || 0);
  const errorAdd = Math.abs(Number(input.errorAdd) || 0);
  if (correctAdd + errorAdd > 1) {
    const error: any = new Error(
      "Incremento inválido: cada resposta registra no máximo uma questão.",
    );
    error.status = 400;
    throw error;
  }
  const isError = errorAdd === 1;

  const assunto = String(input.assunto ?? "").trim();
  const tecLabel = String(input.questionLabel ?? "").trim() || assunto;
  const tecDiscipline = String(input.disciplina ?? "").trim();
  if (!assunto && !tecLabel) {
    const error: any = new Error("Assunto obrigatório");
    error.status = 400;
    throw error;
  }

  const settings = await storage.getUserSettings(userId);
  const disciplines = await storage.getDisciplinesByUser(userId);
  const topics = await storage.getTopicsByUser(userId);

  if (tecDiscipline && storage.isDisciplineNameBlocked(userId, tecDiscipline)) {
    const error: any = new Error(
      "Disciplina excluída pelo usuário; recriação automática bloqueada.",
    );
    error.status = 400;
    throw error;
  }

  const classification = await classifyTecQuestion({
    userId,
    tecDiscipline,
    tecLabel,
    statementSnippet: String(input.questionStatement ?? "").slice(0, 600),
    disciplines: disciplines.map((d) => ({ id: d.id, name: d.name })),
    topics: topics.map((t) => ({
      id: t.id,
      name: t.name,
      disciplineId: t.disciplineId,
    })),
    settings: {
      tecDisciplineAliases: settings?.tecDisciplineAliases,
      tecTopicAliases: settings?.tecTopicAliases,
      tecLabelAiCache: settings?.tecLabelAiCache,
      aiProvider: settings?.aiProvider,
      aiApiKey: settings?.aiApiKey,
      tecAiClassifyPerHour: settings?.tecAiClassifyPerHour,
    },
  });

  // Cache por rótulo: cada rótulo custa no máximo UMA chamada de IA na vida.
  if (classification.aiCacheEntry) {
    const cache = { ...(settings?.tecLabelAiCache || {}) };
    cache[classification.aiCacheEntry.key] = classification.aiCacheEntry.value;
    await storage.updateUserSettings(userId, { tecLabelAiCache: cache });
  }

  const resolvedTopic =
    classification.topicId !== null
      ? topics.find((topic) => topic.id === classification.topicId) || null
      : null;
  const resolvedDisciplineId =
    resolvedTopic?.disciplineId ?? classification.disciplineId ?? null;

  const questionKey =
    input.questionSignature || input.questionId || input.dedupKey || undefined;
  const seconds = clampSeconds(input.timeSpentSeconds);
  const statementSnippet = String(input.questionStatement ?? "")
    .slice(0, 600)
    .trim();

  const attemptPayload: Omit<QuestionAttempt, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  } = {
    topicId: resolvedTopic ? resolvedTopic.id : null,
    disciplineId: resolvedDisciplineId ?? undefined,
    questionId: questionKey,
    questionSignature: input.questionSignature || undefined,
    answered: true,
    correct: !isError,
    confidence: null,
    confidencePhase: null,
    seconds,
    source: "tec",
    tecLabel: tecLabel || undefined,
    tecDiscipline: tecDiscipline || undefined,
    statementSnippet: statementSnippet || undefined,
    pendingClassification: resolvedTopic
      ? null
      : {
          tecLabel: tecLabel || "Sem rótulo",
          tecDiscipline,
          suggestion: classification.suggestion,
          reason: classification.reason,
          since: new Date().toISOString(),
        },
  };

  const attempt = await storage.recordQuestionAttempt(userId, attemptPayload);

  if (!resolvedTopic) {
    return {
      ok: true,
      pending: true,
      topicId: null,
      disciplineId: resolvedDisciplineId,
      attemptId: attempt?.id ?? null,
      reason: classification.reason,
      matchedBy: classification.source,
      autoCompleted: null,
      theorySuggestion: null,
    };
  }

  await storage.adjustTopicPerformance(resolvedTopic.id, userId, {
    correct: isError ? 0 : 1,
    errors: isError ? 1 : 0,
  });

  const nowIso = new Date().toISOString();
  await storage.logTopicStudiedToday(
    userId,
    resolvedTopic.id,
    nowIso.slice(0, 10),
  );

  if (seconds) {
    try {
      if (resolvedDisciplineId) {
        const discipline = (await storage.getDisciplinesByUser(userId)).find(
          (item) => item.id === resolvedDisciplineId,
        );
        if (discipline) {
          await storage.updateDiscipline(resolvedDisciplineId, userId, {
            studyTimeSeconds: (discipline.studyTimeSeconds || 0) + seconds,
          });
        }
      }
      await storage.updateTopic(resolvedTopic.id, userId, {
        studyTimeSeconds: (resolvedTopic.studyTimeSeconds || 0) + seconds,
      });
    } catch (error) {
      console.warn(
        "[TEC] Falha ao somar tempo de estudo:",
        (error as Error)?.message,
      );
    }
  }

  // ─── Calendário: concluir no máximo UMA revisão de teste por bloco de N ────
  const threshold = autoCompleteThreshold(settings);
  let autoCompleted: TecAutoCompleted | null = null;
  let theorySuggestion: TecTheorySuggestion | null = null;
  try {
    const today = todayIso();
    const allAttempts = await storage.getAllQuestionAttempts(userId);
    const { total: answersToday } = countTopicAnswersOnDate(
      allAttempts as any,
      resolvedTopic.id,
      today,
    );
    const revisions = (await storage.getRevisionsByUser(userId)) as any[];

    if (threshold > 0 && answersToday > 0 && answersToday % threshold === 0) {
      const candidate = pickTestRevisionToAutoComplete({
        revisions: revisions as any,
        topicId: resolvedTopic.id,
        today,
        answersToday,
        threshold,
      });
      if (candidate) {
        await storage.markRevisionCompleted(candidate.id, userId, true);
        await storage.logAutoRevisionEvent(
          userId,
          candidate.id,
          resolvedTopic.id,
          `${answersToday} questões do tópico hoje (limite ${threshold})`,
          nowIso,
        );
        autoCompleted = {
          revisionId: candidate.id,
          topicId: resolvedTopic.id,
          topicName: resolvedTopic.name,
          scheduledDate: candidate.scheduledDate,
          answersToday,
        };
      }
    }

    const theory = pickTheoryRevisionSuggestion({
      revisions: revisions as any,
      topicId: resolvedTopic.id,
      today,
    });
    if (theory) {
      theorySuggestion = {
        revisionId: theory.id,
        topicId: resolvedTopic.id,
        topicName: resolvedTopic.name,
        scheduledDate: theory.scheduledDate,
      };
    }
  } catch (error) {
    console.warn(
      "[TEC] Falha na automação do calendário:",
      (error as Error)?.message,
    );
  }

  return {
    ok: true,
    pending: false,
    topicId: resolvedTopic.id,
    topicName: resolvedTopic.name,
    disciplineId: resolvedDisciplineId,
    attemptId: attempt?.id ?? null,
    reason: classification.reason,
    matchedBy: classification.source,
    autoCompleted,
    theorySuggestion,
  };
}

// ─── Contador ao vivo da sessão ──────────────────────────────────────────────

export type TecLiveItem = {
  id: string;
  at: string;
  questionId?: string;
  correct: boolean;
  source: string;
  topicId: number | null;
  topicName?: string;
  disciplineName?: string;
  pending: boolean;
};

export type TecLiveAttempt = {
  id: string;
  at: string;
  topicId: number | null;
  correct: boolean;
  source: string;
};

export type TecLiveActivity = {
  since: string;
  until: string;
  count: number;
  correct: number;
  errors: number;
  pending: number;
  items: TecLiveItem[];
  /** Todas as tentativas da janela (o relatório da sessão sai daqui). */
  attempts: TecLiveAttempt[];
  lastCaptureAt: string | null;
  autoCompleted: Array<TecAutoCompleted & { at: string }>;
  /** Revisão de teoria pendente de um tópico que o usuário acabou de treinar. */
  theorySuggestion: TecTheorySuggestion | null;
  autoCompleteThreshold: number;
};

/** Tudo o que a Sessão Guiada precisa mostrar ao vivo, em uma chamada. */
export async function buildTecLiveActivity(
  userId: number,
  sinceIso: string,
  untilIso?: string,
  limit = 8,
): Promise<TecLiveActivity> {
  const sinceMs = Date.parse(sinceIso);
  const untilMs = untilIso ? Date.parse(untilIso) : Date.now();
  const safeSince = Number.isFinite(sinceMs) ? sinceMs : 0;
  const safeUntil = Number.isFinite(untilMs) ? untilMs : Date.now();

  const attempts = await storage.getAllQuestionAttempts(userId);
  const topics = await storage.getTopicsByUser(userId);
  const disciplines = await storage.getDisciplinesByUser(userId);
  const settings = await storage.getUserSettings(userId);
  const revisions = await storage.getRevisionsByUser(userId);

  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const disciplineById = new Map(
    disciplines.map((discipline) => [discipline.id, discipline]),
  );

  const inWindow = attempts.filter((attempt) => {
    const at = Date.parse(String(attempt.createdAt || ""));
    return Number.isFinite(at) && at >= safeSince && at <= safeUntil;
  });

  const items: TecLiveItem[] = inWindow
    .slice(-Math.max(1, limit))
    .map((attempt) => {
      const topic =
        attempt.topicId !== null && attempt.topicId !== undefined
          ? topicById.get(attempt.topicId)
          : undefined;
      const disciplineId = topic?.disciplineId ?? attempt.disciplineId;
      const discipline = disciplineId
        ? disciplineById.get(disciplineId)
        : undefined;
      return {
        id: String(attempt.id),
        at: String(attempt.createdAt || ""),
        questionId: attempt.questionId,
        correct: !!attempt.correct,
        source: attempt.source || "manual",
        topicId: attempt.topicId ?? null,
        topicName: topic?.name,
        disciplineName: discipline?.name,
        pending: !!attempt.pendingClassification,
      };
    });

  // Revisões concluídas automaticamente pelo SOE dentro da janela.
  const autoEvents = (settings?.studyEvents || []).filter((event) =>
    String(event.id || "").startsWith("auto-test-"),
  );
  const autoCompleted: Array<TecAutoCompleted & { at: string }> = [];
  for (const event of autoEvents) {
    const at = Date.parse(String(event.occurredAt || ""));
    if (!Number.isFinite(at) || at < safeSince || at > safeUntil) continue;
    const revisionId = Number(String(event.id).replace("auto-test-", ""));
    const revision = revisions.find((item) => item.id === revisionId);
    // Só continua listado enquanto a revisão seguir concluída (desfazer remove).
    if (!revision || !revision.completed) continue;
    autoCompleted.push({
      revisionId,
      topicId: revision.topicId,
      topicName: event.topicName || topicById.get(revision.topicId)?.name || "",
      scheduledDate: revision.scheduledDate,
      answersToday: countTopicAnswersOnDate(
        attempts as any,
        revision.topicId,
        todayIso(),
      ).total,
      at: String(event.occurredAt || ""),
    });
  }

  const lastCaptureAt =
    inWindow.length > 0
      ? String(inWindow[inWindow.length - 1].createdAt || "")
      : null;

  // Revisão de TEORIA não é concluída sozinha: o app pergunta. Aqui só
  // sinalizamos a primeira pendência dos tópicos treinados na janela.
  let theorySuggestion: TecTheorySuggestion | null = null;
  try {
    const today = todayIso();
    const trainedTopicIds = new Set<number>();
    for (const attempt of inWindow) {
      if (attempt.topicId !== null && attempt.topicId !== undefined) {
        trainedTopicIds.add(attempt.topicId);
      }
    }
    for (const topicId of trainedTopicIds) {
      const theory = pickTheoryRevisionSuggestion({
        revisions: revisions as any,
        topicId,
        today,
      });
      if (theory) {
        theorySuggestion = {
          revisionId: theory.id,
          topicId,
          topicName: topicById.get(topicId)?.name || "",
          scheduledDate: theory.scheduledDate,
        };
        break;
      }
    }
  } catch {
    theorySuggestion = null;
  }

  return {
    since: new Date(safeSince).toISOString(),
    until: new Date(safeUntil).toISOString(),
    count: inWindow.length,
    correct: inWindow.filter((attempt) => attempt.correct).length,
    errors: inWindow.filter((attempt) => !attempt.correct).length,
    pending: inWindow.filter((attempt) => !!attempt.pendingClassification)
      .length,
    items,
    attempts: inWindow.map((attempt) => ({
      id: String(attempt.id),
      at: String(attempt.createdAt || ""),
      topicId: attempt.topicId ?? null,
      correct: !!attempt.correct,
      source: attempt.source || "manual",
    })),
    lastCaptureAt,
    autoCompleted,
    theorySuggestion,
    autoCompleteThreshold: autoCompleteThreshold(settings),
  };
}

// ─── Correção manual (+Acertei / +Errei / desfazer) ──────────────────────────

export async function addManualAnswer(
  userId: number,
  input: {
    correct: boolean;
    topicId?: number | null;
    kind?: "correct" | "error";
  },
): Promise<{
  ok: boolean;
  attemptId?: string;
  topicId?: number;
  message?: string;
}> {
  const topics = await storage.getTopicsByUser(userId);
  const topicId = Number(input.topicId);
  const topic = Number.isFinite(topicId)
    ? topics.find((item) => item.id === topicId)
    : undefined;
  if (!topic) {
    return { ok: false, message: "Escolha o tópico da sessão para registrar." };
  }
  const correct = !!input.correct;
  const attempt = await storage.recordQuestionAttempt(userId, {
    topicId: topic.id,
    disciplineId: topic.disciplineId,
    answered: true,
    correct,
    confidence: null,
    confidencePhase: null,
    source: "manual",
  });
  await storage.adjustTopicPerformance(topic.id, userId, {
    correct: correct ? 1 : 0,
    errors: correct ? 0 : 1,
  });
  await storage.logTopicStudiedToday(userId, topic.id);
  return { ok: true, attemptId: attempt?.id, topicId: topic.id };
}

export async function undoLastAnswer(
  userId: number,
  input: { since: string },
): Promise<{
  ok: boolean;
  undone?: { id: string; topicId: number | null; correct: boolean };
  message?: string;
}> {
  const sinceMs = Date.parse(input.since);
  const attempts = await storage.getAllQuestionAttempts(userId);
  const candidates = attempts.filter((attempt) => {
    const at = Date.parse(String(attempt.createdAt || ""));
    if (!Number.isFinite(at)) return false;
    if (Number.isFinite(sinceMs) && at < sinceMs) return false;
    return attempt.source !== "simulado";
  });
  const last = candidates[candidates.length - 1];
  if (!last) return { ok: false, message: "Nenhuma resposta para desfazer." };

  await storage.deleteQuestionAttempt(userId, String(last.id));
  if (last.topicId !== null && last.topicId !== undefined) {
    await storage.adjustTopicPerformance(last.topicId, userId, {
      correct: last.correct ? -1 : 0,
      errors: last.correct ? 0 : -1,
    });
  }
  return {
    ok: true,
    undone: {
      id: String(last.id),
      topicId: last.topicId ?? null,
      correct: !!last.correct,
    },
  };
}

// ─── Pendências de classificação ─────────────────────────────────────────────

export type PendingClassificationGroup = {
  tecLabel: string;
  tecDiscipline: string;
  count: number;
  lastAt: string;
  reason?: string;
  suggestion?: {
    disciplineId?: number | null;
    topicId?: number | null;
    createDiscipline?: string;
    createTopic?: string;
    confidence: number;
    reason: string;
  } | null;
  suggestedTopicName?: string;
  suggestedDisciplineName?: string;
};

export async function listPendingClassifications(
  userId: number,
): Promise<{ groups: PendingClassificationGroup[]; total: number }> {
  const attempts = await storage.getAllQuestionAttempts(userId);
  const topics = await storage.getTopicsByUser(userId);
  const disciplines = await storage.getDisciplinesByUser(userId);
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const disciplineById = new Map(
    disciplines.map((discipline) => [discipline.id, discipline]),
  );

  const groups = new Map<
    string,
    PendingClassificationGroup & { order: number }
  >();
  let total = 0;
  for (const attempt of attempts) {
    const pending = attempt.pendingClassification;
    if (!pending) continue;
    total += 1;
    const key = normalizeTecLabel(pending.tecLabel || "") || "sem-rotulo";
    const current = groups.get(key);
    if (current) {
      current.count += 1;
      if (String(attempt.createdAt) > current.lastAt) {
        current.lastAt = String(attempt.createdAt);
      }
      continue;
    }
    const suggestion = pending.suggestion || null;
    const suggestedTopic = suggestion?.topicId
      ? topicById.get(suggestion.topicId)
      : undefined;
    const suggestedDisciplineId =
      suggestion?.disciplineId ?? suggestedTopic?.disciplineId ?? null;
    const suggestedDiscipline = suggestedDisciplineId
      ? disciplineById.get(suggestedDisciplineId)
      : undefined;
    groups.set(key, {
      tecLabel: pending.tecLabel || "Sem rótulo",
      tecDiscipline: pending.tecDiscipline || "",
      count: 1,
      lastAt: String(attempt.createdAt || ""),
      reason: pending.reason,
      suggestion,
      suggestedTopicName: suggestedTopic?.name,
      suggestedDisciplineName: suggestedDiscipline?.name,
      order: 0,
    });
  }

  const list = Array.from(groups.values())
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
    .map(({ order, ...rest }) => rest);
  return { groups: list, total };
}

export type ResolvePendingInput = {
  tecLabel: string;
  action: "assign" | "create" | "ignore";
  topicId?: number | null;
  newTopicName?: string;
  disciplineId?: number | null;
};

/**
 * Aplica a decisão do usuário sobre um rótulo do TEC:
 * - grava o alias (próximas questões do mesmo rótulo resolvem sozinhas);
 * - reatribui retroativamente as tentativas pendentes daquele rótulo;
 * - atualiza `topic.performance` com a contagem EXATA (nunca duplica, nunca
 *   reduz: só soma o que ainda não havia sido contado).
 */
export async function resolvePendingClassification(
  userId: number,
  input: ResolvePendingInput,
): Promise<{
  ok: boolean;
  updated: number;
  topicId: number | null;
  topicName?: string;
  message?: string;
}> {
  const labelKey = normalizeTecLabel(input.tecLabel || "");
  if (!labelKey)
    return { ok: false, updated: 0, topicId: null, message: "Rótulo vazio." };

  let topicId: number | null = null;
  let topicName: string | undefined;

  if (input.action === "create") {
    const disciplineId = Number(input.disciplineId);
    const name = String(input.newTopicName || "").trim();
    if (!Number.isFinite(disciplineId) || !name) {
      return {
        ok: false,
        updated: 0,
        topicId: null,
        message: "Informe a disciplina e o nome do tópico.",
      };
    }
    const disciplines = await storage.getDisciplinesByUser(userId);
    if (!disciplines.some((discipline) => discipline.id === disciplineId)) {
      return {
        ok: false,
        updated: 0,
        topicId: null,
        message: "Disciplina não encontrada.",
      };
    }
    const created = await storage.createTopic({
      userId,
      disciplineId,
      name,
      studyDate: new Date().toISOString(),
      notes: null,
    });
    topicId = created.id;
    topicName = name;
  } else if (input.action === "assign") {
    const requested = Number(input.topicId);
    const topics = await storage.getTopicsByUser(userId);
    const topic = topics.find((item) => item.id === requested);
    if (!topic) {
      return {
        ok: false,
        updated: 0,
        topicId: null,
        message: "Tópico não encontrado.",
      };
    }
    topicId = topic.id;
    topicName = topic.name;
  } else if (input.action !== "ignore") {
    return { ok: false, updated: 0, topicId: null, message: "Ação inválida." };
  }

  const settings = await storage.getUserSettings(userId);
  const attempts = await storage.getAllQuestionAttempts(userId);
  const topics = await storage.getTopicsByUser(userId);
  const resolveDisciplineId = (id: number | null): number | undefined => {
    if (id === null) return undefined;
    return topics.find((item) => item.id === id)?.disciplineId;
  };
  const targetDisciplineId = resolveDisciplineId(topicId);
  const pending = attempts.filter(
    (attempt) =>
      !!attempt.pendingClassification &&
      normalizeTecLabel(attempt.pendingClassification.tecLabel || "") ===
        labelKey,
  );

  let correct = 0;
  let errors = 0;
  for (const attempt of pending) {
    if (topicId !== null) {
      if (attempt.correct) correct += 1;
      else errors += 1;
    }
    await storage.updateQuestionAttempt(userId, String(attempt.id), {
      topicId,
      disciplineId: targetDisciplineId ?? attempt.disciplineId,
      pendingClassification: null,
      reclassifiedAt: new Date().toISOString(),
    });
  }

  if (topicId !== null && pending.length > 0) {
    await storage.adjustTopicPerformance(topicId, userId, {
      correct,
      errors,
    });
    await storage.logTopicStudiedToday(userId, topicId);
  }

  if (topicId !== null) {
    const aliasKey = labelKey;
    const aliases = { ...(settings?.tecTopicAliases || {}) };
    aliases[aliasKey] = topicId;
    await storage.updateUserSettings(userId, { tecTopicAliases: aliases });
  }

  return {
    ok: true,
    updated: pending.length,
    topicId,
    topicName,
    message:
      input.action === "ignore"
        ? `${pending.length} tentativa(s) ignorada(s).`
        : `${pending.length} tentativa(s) classificada(s).`,
  };
}
