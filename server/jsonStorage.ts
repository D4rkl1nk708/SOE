import type {
  DataHealthFixId,
  Discipline,
  Topic,
  Revision,
  MockExam,
  StudyNote,
  UserSettings,
  QuestionAttempt,
  User,
  Flashcard,
  QuestionError,
  EssayCorrection,
  Essay,
  TecTopicSnapshot,
  TecSnapshot,
  CadernoTec,
  Database,
  StudyEventRecord,
  EditalRow,
} from "../shared/types";

export type {
  Discipline,
  Topic,
  Revision,
  MockExam,
  StudyNote,
  UserSettings,
  QuestionAttempt,
  User,
  Flashcard,
  QuestionError,
  EssayCorrection,
  Essay,
  TecTopicSnapshot,
  TecSnapshot,
  CadernoTec,
  Database,
  StudyEventRecord,
};
import { addLocalDays, localDayISO } from "../shared/localDay";
import { normalizeLocalDay } from "../shared/planRules";
import { persistBase64Media } from "./mediaStorage";
import { backupJsonPayload } from "./storage/backup";
import { preserveRowLinks } from "../shared/editalCoverage";
import { smartMergeDatabases, normalizeString } from "../shared/merge";
import {
  LEI_SECA_DECK,
  buildLeiSecaCards,
  resolveDailyCap,
  selectLeiSecaToday,
  summarizeLeiSecaDeck,
} from "./leiSeca";
import {
  groupDisciplineDuplicates,
  summarizeDuplicates,
} from "../shared/disciplineDuplicates";
import * as fs from "fs";
import * as path from "path";

// ── Core Storage Engine delegated to server/storage (SQLite ou JSON) ──────────
import {
  readDatabase,
  writeDatabase,
  runInTransaction,
  acquireWriteLock,
  resetCache,
  setDataDir,
  getDataDir,
  getDbFile,
  getEmptyDatabase,
  getLastWriteError,
  now,
  closeDatabase,
} from "./storage/index";

export {
  readDatabase,
  writeDatabase,
  runInTransaction,
  acquireWriteLock,
  resetCache,
  setDataDir,
  getDataDir,
  getDbFile,
  getEmptyDatabase,
  getLastWriteError,
  now,
  closeDatabase,
};

// ============ STUDY EVENT LEDGER ============
/**
 * Upsert de um evento no ledger. Mantém no máximo 5.000 eventos por usuário.
 * A projeção em studyLedger.ts ainda cobre dados antigos que não passaram por aqui.
 */
function pushStudyEvent(user: User | undefined, event: StudyEventRecord): void {
  if (!user) return;
  if (!Array.isArray(user.settings.studyEvents)) {
    user.settings.studyEvents = [];
  }
  const existing = user.settings.studyEvents.findIndex(
    (item) => item.id === event.id,
  );
  if (existing >= 0) {
    user.settings.studyEvents[existing] = event;
  } else {
    user.settings.studyEvents.push(event);
  }
  if (user.settings.studyEvents.length > 1000) {
    user.settings.studyEvents = user.settings.studyEvents.slice(-1000);
  }
}

function eventContext(
  db: Database,
  topicId?: number,
  disciplineId?: number,
): { topicName?: string; disciplineName?: string; disciplineId?: number } {
  const topic = topicId
    ? db.topics.find((item) => item.id === topicId)
    : undefined;
  const resolvedDisciplineId = disciplineId ?? topic?.disciplineId;
  const discipline = resolvedDisciplineId
    ? db.disciplines.find((item) => item.id === resolvedDisciplineId)
    : undefined;
  return {
    topicName: topic?.name,
    disciplineName: discipline?.name,
    disciplineId: resolvedDisciplineId,
  };
}

// ============ USER OPERATIONS ============

export async function upsertUser(
  userData: Partial<User> & { openId: string },
): Promise<void> {
  const db = readDatabase();
  const existingIndex = db.users.findIndex((u) => u.openId === userData.openId);

  const defaultSettings: UserSettings = {
    theme: "light",
    studyStreak: { current: 0, best: 0, lastStudyDate: null },
  };

  if (existingIndex >= 0) {
    db.users[existingIndex] = {
      ...db.users[existingIndex],
      ...userData,
      settings: db.users[existingIndex].settings || defaultSettings,
      updatedAt: now(),
      lastSignedIn: now(),
    };
  } else {
    db.counters.users++;
    const newUser: User = {
      id: db.counters.users,
      openId: userData.openId,
      name: userData.name || null,
      email: userData.email || null,
      loginMethod: userData.loginMethod || null,
      role: userData.role || "user",
      settings: defaultSettings,
      createdAt: now(),
      updatedAt: now(),
      lastSignedIn: now(),
    };
    db.users.push(newUser);
  }

  writeDatabase(db);
}

export async function getUserByOpenId(
  openId: string,
): Promise<User | undefined> {
  const db = readDatabase();
  return db.users.find((u) => u.openId === openId);
}

export async function getUserById(userId: number): Promise<User | undefined> {
  const db = readDatabase();
  return db.users.find((u) => u.id === userId);
}

export async function getUserSettings(
  userId: number,
): Promise<UserSettings | undefined> {
  const db = readDatabase();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return undefined;
  // v6.9.4 (item 2): o histórico de tentativas saiu de settings e virou a
  // coleção `questionAttempts`. Esta é uma VIEW somente-leitura para os
  // consumidores antigos (ledger, analytics, calibração) continuarem lendo o
  // mesmo campo — a gravação sempre vai para a coleção.
  const attempts = (db.questionAttempts || []).filter(
    (attempt) => !attempt.userId || attempt.userId === userId,
  );
  return {
    ...(user.settings || {}),
    questionAttempts: attempts,
  } as UserSettings;
}

export async function updateUserSettings(
  userId: number,
  settings: Partial<UserSettings>,
): Promise<void> {
  const db = readDatabase();
  const index = db.users.findIndex((u) => u.id === userId);
  if (index >= 0) {
    const patch: Partial<UserSettings> = { ...settings };

    // v6.9.4 (item 2): `settings.questionAttempts` não é mais armazenado em
    // settings. Quem ainda grava por esse caminho (importação, testes, telas
    // antigas) cai na coleção, sem duplicar por id.
    if (Object.prototype.hasOwnProperty.call(settings, "questionAttempts")) {
      const incoming = Array.isArray(settings.questionAttempts)
        ? settings.questionAttempts
        : [];
      if (!Array.isArray(db.questionAttempts)) db.questionAttempts = [];
      const byId = new Map(
        db.questionAttempts.map((attempt) => [String(attempt.id), attempt]),
      );
      for (const attempt of incoming) {
        if (!attempt || !attempt.id) continue;
        const key = String(attempt.id);
        if (byId.has(key)) continue;
        const record = { ...attempt, userId: attempt.userId ?? userId };
        db.questionAttempts.push(record);
        byId.set(key, record);
      }
      db.questionAttempts.sort((a, b) =>
        String(a.createdAt || "").localeCompare(String(b.createdAt || "")),
      );
      db.counters.questionAttempts = db.questionAttempts.length;
      delete (patch as Record<string, unknown>).questionAttempts;
    }

    // v6.9.4 (item 6): a foto de perfil sai do banco. Base64 (850 KB em
    // settings) vira arquivo em data/uploads e settings guarda só a referência.
    if (
      typeof patch.profileImage === "string" &&
      patch.profileImage.startsWith("data:")
    ) {
      const persisted = persistBase64Media(
        patch.profileImage,
        `avatar-${userId}`,
      );
      if (persisted && !persisted.startsWith("data:")) {
        patch.profileImage = persisted;
      }
    }
    // v6.9.4 (item 5): quem chama `updateSettings({ editalRows })` (tela de
    // Edital) grava no concurso ativo. settings deixa de ser dono do edital.
    if (Object.prototype.hasOwnProperty.call(settings, "editalRows")) {
      const incomingRows = Array.isArray(settings.editalRows)
        ? (settings.editalRows as EditalRow[])
        : [];
      const current = db.users[index].settings;
      const exams = Array.isArray(current?.exams) ? [...current.exams] : [];
      if (exams.length > 0) {
        const activeId = current.activeExamId || exams[0].id;
        const examIndex = exams.findIndex((exam) => exam.id === activeId);
        const targetIndex = examIndex >= 0 ? examIndex : 0;
        const previousRows = Array.isArray(exams[targetIndex]?.editalRows)
          ? (exams[targetIndex].editalRows as EditalRow[])
          : [];
        exams[targetIndex] = {
          ...exams[targetIndex],
          editalRows: preserveRowLinks(
            incomingRows,
            previousRows,
          ) as EditalRow[],
        };
        patch.exams = exams;
        patch.activeExamId = exams[targetIndex].id;
        patch.editalRows = [];
      }
    }

    db.users[index].settings = { ...db.users[index].settings, ...patch };
    writeDatabase(db);
  }
}

/**
 * Migração única da foto em base64 que já está gravada no banco.
 * Retorna true quando converteu. Idempotente: depois da primeira vez a imagem
 * já é um caminho `/uploads/...` e a função não faz nada.
 */
export async function migrateProfileImageToFile(
  userId: number,
): Promise<boolean> {
  const db = readDatabase();
  const user = db.users.find((u) => u.id === userId);
  const current = user?.settings?.profileImage;
  if (!current || !current.startsWith("data:")) return false;
  const persisted = persistBase64Media(current, `avatar-${userId}`);
  if (!persisted || persisted.startsWith("data:")) return false;
  user!.settings.profileImage = persisted;
  writeDatabase(db);
  return true;
}

export async function recordQuestionAttempt(
  userId: number,
  attempt: Omit<QuestionAttempt, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  },
): Promise<QuestionAttempt> {
  const db = readDatabase();
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new Error("Usuário não encontrado.");
  const record: QuestionAttempt = {
    ...attempt,
    userId,
    id:
      attempt.id ||
      `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: attempt.createdAt || now(),
  };

  if (!Array.isArray(db.questionAttempts)) db.questionAttempts = [];

  // Deduplicação (mesma regra da assinatura da 6.9.3): o mesmo questionId no
  // mesmo tópico, com a mesma resposta, dentro de 10 minutos é eco do mesmo
  // clique — devolve a tentativa existente em vez de contar duas vezes.
  if (record.questionId) {
    const createdMs = Date.parse(record.createdAt);
    const duplicate = db.questionAttempts.find((existing) => {
      if (existing.questionId !== record.questionId) return false;
      if (existing.topicId !== record.topicId) return false;
      if ((existing.source || "manual") !== (record.source || "manual"))
        return false;
      if (existing.correct !== record.correct) return false;
      const existingMs = Date.parse(String(existing.createdAt || ""));
      if (!Number.isFinite(existingMs) || !Number.isFinite(createdMs))
        return false;
      return Math.abs(createdMs - existingMs) <= 10 * 60 * 1000;
    });
    if (duplicate) {
      // v6.9.7 (item 1.3): a confiança chega DEPOIS da captura do TEC (o prompt
      // abre no evento soe-tec-answer). Antes o eco era descartado e o
      // `confidence` nunca era gravado; agora ele anota a tentativa original.
      if (record.confidence && !duplicate.confidence) {
        duplicate.confidence = record.confidence;
        duplicate.confidencePhase = record.confidencePhase ?? "after_result";
        if (
          typeof record.seconds === "number" &&
          !Number.isFinite(Number(duplicate.seconds))
        ) {
          duplicate.seconds = record.seconds;
        }
        writeDatabase(db);
        return duplicate;
      }
      return duplicate;
    }
  }

  // Sem questionId o TEC não dá como casar o eco: se o usuário está apenas
  // declarando a confiança de uma resposta recém-capturada (mesma disciplina,
  // mesmo resultado, até 10 min, ainda sem confiança), anota nela em vez de
  // criar uma tentativa fantasma que dobraria a contagem.
  if (record.confidence && !record.questionId) {
    const createdMs = Date.parse(record.createdAt);
    const recent = [...db.questionAttempts].reverse().find((existing) => {
      if (existing.confidence) return false;
      if (existing.source !== "tec" || record.source !== "tec") return false;
      if (existing.correct !== record.correct) return false;
      if (existing.topicId !== record.topicId) return false;
      const existingMs = Date.parse(String(existing.createdAt || ""));
      if (!Number.isFinite(existingMs) || !Number.isFinite(createdMs))
        return false;
      return Math.abs(createdMs - existingMs) <= 10 * 60 * 1000;
    });
    if (recent) {
      recent.confidence = record.confidence;
      recent.confidencePhase = record.confidencePhase ?? "after_result";
      writeDatabase(db);
      return recent;
    }
  }

  db.questionAttempts.push(record);
  db.counters.questionAttempts = db.questionAttempts.length;
  const context = eventContext(
    db,
    record.topicId ?? undefined,
    record.disciplineId,
  );
  pushStudyEvent(user, {
    id: `att-${record.id}`,
    type: "answer",
    occurredAt: record.createdAt,
    title: record.correct
      ? `Acertou: ${context.topicName || "questão"}`
      : record.answered
        ? `Errou: ${context.topicName || "questão"}`
        : `Não respondeu: ${context.topicName || "questão"}`,
    detail: [
      record.banca,
      record.confidence ? `confiança ${record.confidence}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    topicId: record.topicId ?? undefined,
    disciplineId: context.disciplineId,
    topicName: context.topicName,
    disciplineName: context.disciplineName,
    correct: record.correct,
    answered: record.answered,
    source: record.source,
  });
  writeDatabase(db);
  return record;
}

/**
 * v6.9.7 (item 1.3): anota certeza/dúvida/chute na resposta do TEC mais recente
 * que ainda está sem confiança. É o caminho de segurança para quando o rótulo
 * do prompt não casa com nenhum tópico: a confiança não pode se perder.
 */
export async function attachConfidenceToLatestTecAttempt(
  userId: number,
  correct: boolean,
  confidence: QuestionAttempt["confidence"],
  seconds?: number,
): Promise<QuestionAttempt | null> {
  const db = readDatabase();
  if (!Array.isArray(db.questionAttempts)) db.questionAttempts = [];
  const nowMs = Date.parse(now());
  const recent = [...db.questionAttempts].reverse().find((attempt) => {
    if (attempt.confidence) return false;
    if (attempt.source !== "tec") return false;
    if (Boolean(attempt.correct) !== Boolean(correct)) return false;
    const createdMs = Date.parse(String(attempt.createdAt || ""));
    if (!Number.isFinite(createdMs) || !Number.isFinite(nowMs)) return false;
    return nowMs - createdMs <= 30 * 60 * 1000;
  });
  if (!recent) return null;
  recent.confidence = confidence;
  recent.confidencePhase = "after_result";
  if (typeof seconds === "number" && !Number.isFinite(Number(recent.seconds))) {
    recent.seconds = seconds;
  }
  writeDatabase(db);
  return recent;
}

/** Remove uma tentativa (usado pelo "desfazer última resposta"). */
export async function deleteQuestionAttempt(
  userId: number,
  id: string,
): Promise<QuestionAttempt | null> {
  const db = readDatabase();
  if (!Array.isArray(db.questionAttempts)) db.questionAttempts = [];
  const index = db.questionAttempts.findIndex(
    (attempt) =>
      String(attempt.id) === String(id) &&
      (!attempt.userId || attempt.userId === userId),
  );
  if (index < 0) return null;
  const [removed] = db.questionAttempts.splice(index, 1);
  const user = db.users.find((u) => u.id === userId);
  if (user?.settings?.studyEvents) {
    user.settings.studyEvents = user.settings.studyEvents.filter(
      (event) => event.id !== `att-${removed.id}`,
    );
  }
  db.counters.questionAttempts = db.questionAttempts.length;
  writeDatabase(db);
  return removed;
}

/** Atualiza campos de uma tentativa (ex.: reatribuir tópico de pendência). */
export async function updateQuestionAttempt(
  userId: number,
  id: string,
  patch: Partial<QuestionAttempt>,
): Promise<QuestionAttempt | null> {
  const db = readDatabase();
  if (!Array.isArray(db.questionAttempts)) db.questionAttempts = [];
  const index = db.questionAttempts.findIndex(
    (attempt) =>
      String(attempt.id) === id &&
      (!attempt.userId || attempt.userId === userId),
  );
  if (index < 0) return null;
  db.questionAttempts[index] = { ...db.questionAttempts[index], ...patch };
  writeDatabase(db);
  return db.questionAttempts[index];
}

/**
 * Soma um delta EXATO ao desempenho do tópico (negativo no desfazer).
 * Nunca deixa contadores abaixo de zero e sempre passa por
 * `setTopicPerformance`, para não duplicar a conta de acurácia/histórico.
 */
export async function adjustTopicPerformance(
  topicId: number,
  userId: number,
  delta: { correct?: number; errors?: number },
): Promise<void> {
  const db = readDatabase();
  const topic = db.topics.find((t) => t.id === topicId && t.userId === userId);
  if (!topic) return;
  const correct = Math.max(
    0,
    (topic.performance?.correctCount ?? 0) + (delta.correct ?? 0),
  );
  const errors = Math.max(
    0,
    (topic.performance?.errorCount ?? 0) + (delta.errors ?? 0),
  );
  await setTopicPerformance(topicId, userId, {
    correctCount: correct,
    errorCount: errors,
  });
}

/**
 * "Estudou hoje" no tópico. Idempotente por (tópico, dia): o calendário mostra
 * um evento por dia, não um por questão.
 */
export async function logTopicStudiedToday(
  userId: number,
  topicId: number,
  whenIso?: string,
): Promise<void> {
  const db = readDatabase();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return;
  const occurredAt = whenIso || now();
  const day = occurredAt.slice(0, 10);
  const context = eventContext(db, topicId);
  pushStudyEvent(user, {
    id: `tec-day-${topicId}-${day}`,
    type: "tec",
    occurredAt,
    title: `Estudou hoje: ${context.topicName || "tópico"}`,
    detail: "Questões respondidas no TEC",
    topicId,
    disciplineId: context.disciplineId,
    topicName: context.topicName,
    disciplineName: context.disciplineName,
    source: "tec",
  });
  writeDatabase(db);
}

/** Id do evento "aula estudada": um por (tópico, dia) — a chave da idempotência. */
export function lessonEventId(topicName: string, day: string): string {
  const slug = String(topicName || "topico")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `lesson-${slug || "topico"}-${day}`;
}

/** A aula deste tópico já foi marcada como estudada hoje? */
export async function isLessonStudiedToday(
  userId: number,
  topicName: string,
  whenIso?: string,
): Promise<{ date: string; studied: boolean }> {
  const day = (whenIso || now()).slice(0, 10);
  const settings = await getUserSettings(userId);
  const events = (settings as any)?.studyEvents;
  const id = lessonEventId(topicName, day);
  const studied = Array.isArray(events)
    ? events.some((item: any) => item?.id === id)
    : false;
  return { date: day, studied };
}

/**
 * "Aula interativa estudada": um evento por (tópico, dia), como o "estudou hoje"
 * do TEC. Reabrir a aula no mesmo dia não duplica o evento — o id do evento é a
 * própria chave de idempotência (upsert no ledger).
 */
export async function logLessonStudiedToday(
  userId: number,
  topicName: string,
  topicId?: number,
  whenIso?: string,
): Promise<{ date: string; recorded: boolean }> {
  const db = readDatabase();
  const user = db.users.find((u) => u.id === userId);
  const occurredAt = whenIso || now();
  const day = occurredAt.slice(0, 10);
  if (!user) return { date: day, recorded: false };

  const id = lessonEventId(topicName, day);
  const already = Array.isArray(user.settings.studyEvents)
    ? user.settings.studyEvents.some((item) => item?.id === id)
    : false;

  if (already) return { date: day, recorded: false };

  const context = eventContext(db, topicId);
  pushStudyEvent(user, {
    id,
    type: "lesson",
    occurredAt,
    title: `Aula interativa estudada: ${context.topicName || topicName || "tópico"}`,
    detail: "Animação concluída e pergunta de verificação respondida",
    topicId,
    disciplineId: context.disciplineId,
    topicName: context.topicName || topicName,
    disciplineName: context.disciplineName,
    source: "lesson",
  });
  writeDatabase(db);
  return { date: day, recorded: true };
}

/** Registro do que o SOE marcou sozinho no calendário (para desfazer). */
export async function logAutoRevisionEvent(
  userId: number,
  revisionId: number,
  topicId: number,
  detail: string,
  whenIso?: string,
): Promise<void> {
  const db = readDatabase();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return;
  const context = eventContext(db, topicId);
  pushStudyEvent(user, {
    id: `auto-test-${revisionId}`,
    type: "revision",
    occurredAt: whenIso || now(),
    title: `Revisão concluída automaticamente: ${context.topicName || "tópico"}`,
    detail,
    topicId,
    disciplineId: context.disciplineId,
    topicName: context.topicName,
    disciplineName: context.disciplineName,
    source: "auto",
  });
  writeDatabase(db);
}

export async function getQuestionAttempts(
  userId: number,
  limit = 500,
): Promise<QuestionAttempt[]> {
  const db = readDatabase();
  const attempts = (db.questionAttempts || []).filter(
    (attempt) => !attempt.userId || attempt.userId === userId,
  );
  return attempts.slice(-Math.max(1, limit));
}

/** Todas as tentativas do usuário (sem corte), para tendência e migração. */
export async function getAllQuestionAttempts(
  userId: number,
): Promise<QuestionAttempt[]> {
  const db = readDatabase();
  return (db.questionAttempts || []).filter(
    (attempt) => !attempt.userId || attempt.userId === userId,
  );
}

// ============ DISCIPLINE OPERATIONS ============

export async function getDisciplinesByUser(
  userId: number,
): Promise<Discipline[]> {
  const db = readDatabase();
  const user = db.users.find((u) => u.id === userId);
  const blocked = new Set(
    (user?.settings.deletedDisciplineNames || []).map((name) =>
      normalizeString(name),
    ),
  );
  const userDisciplines = db.disciplines.filter(
    (d) => d.userId === userId && !blocked.has(normalizeString(d.name)),
  );
  const userTopics = db.topics.filter((t) => t.userId === userId);

  return userDisciplines
    .map((d) => {
      const discTopics = userTopics.filter((t) => t.disciplineId === d.id);
      const resolved = discTopics.reduce(
        (s, t) => s + (t.performance?.questionsResolved || 0),
        0,
      );
      const correct = discTopics.reduce(
        (s, t) => s + (t.performance?.correctCount || 0),
        0,
      );
      const error = discTopics.reduce(
        (s, t) => s + (t.performance?.errorCount || 0),
        0,
      );
      const totalDerived = Math.max(resolved, correct + error);
      const accuracy =
        totalDerived > 0 ? Math.round((correct / totalDerived) * 100) : 0;
      const studySecs = Math.max(
        d.studyTimeSeconds || 0,
        discTopics.reduce((s, t) => s + (t.studyTimeSeconds || 0), 0),
      );

      const perf =
        d.performance && (d.performance.questionsResolved || 0) > totalDerived
          ? d.performance
          : {
              questionsResolved: totalDerived,
              accuracy,
              correctCount: correct,
              errorCount: error,
            };

      return {
        ...d,
        studyTimeSeconds: studySecs,
        performance: perf,
      };
    })
    .sort((a, b) => {
      const orderA =
        typeof a.order === "number" ? a.order : Number.MAX_SAFE_INTEGER;
      const orderB =
        typeof b.order === "number" ? b.order : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return b.weight - a.weight;
    });
}

export interface DisciplineDuplicateSuggestion {
  sourceId: number;
  sourceName: string;
  sourceWeight: number;
  sourceQuestions: number;
  targetId: number;
  targetName: string;
  targetWeight: number;
  targetQuestions: number;
  score: number;
  reason: string;
}

const DISCIPLINE_STOPWORDS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "no",
  "na",
  "em",
  "para",
  "com",
  "ti",
  "cf",
  "1988",
  "doutrina",
]);

/**
 * Chave de comparação usada nas sugestões de mescla (item 3 da 6.9.4).
 * Ignora "Matéria:", "TI - ", parênteses e cauda de doutrina — o mesmo
 * tratamento que o matcher do TEC usa para não criar disciplina nova.
 */
function disciplineKey(name: string): string {
  let value = String(name || "");
  value = value.replace(
    /^\s*(mat[eé]ria|disciplina|assunto)\s*[:\-–—]\s*/i,
    "",
  );
  value = value.replace(/^\s*t\.?\s*i\.?\s*[-–—]\s*/i, "");
  value = value.replace(/\([^)]*\)/g, " ");
  value = value.replace(
    /\s*[-–—]\s*(doutrina|leis?|jurisprud[eê]ncia|teoria|exerc[ií]cios?|quest[oõ]es)\b.*$/i,
    " ",
  );
  return normalizeString(value);
}

function disciplineTokens(name: string): Set<string> {
  return new Set(
    disciplineKey(name)
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1 && !DISCIPLINE_STOPWORDS.has(token)),
  );
}

function disciplineSimilarity(a: string, b: string): number {
  const an = disciplineKey(a);
  const bn = disciplineKey(b);
  if (!an || !bn) return 0;
  if (an === bn) return 1;
  if (an.includes(bn) || bn.includes(an)) return 0.92;
  const aTokens = disciplineTokens(a);
  const bTokens = disciplineTokens(b);
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of aTokens) if (bTokens.has(token)) intersection++;
  const union = aTokens.size + bTokens.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export async function getDisciplineDuplicateSuggestions(
  userId: number,
): Promise<DisciplineDuplicateSuggestion[]> {
  const disciplines = await getDisciplinesByUser(userId);
  const suggestions: DisciplineDuplicateSuggestion[] = [];
  for (let i = 0; i < disciplines.length; i++) {
    for (let j = i + 1; j < disciplines.length; j++) {
      const a = disciplines[i] as any;
      const b = disciplines[j] as any;
      const score = disciplineSimilarity(a.name, b.name);
      if (score < 0.45) continue;
      const aQ = Number(a.performance?.questionsResolved) || 0;
      const bQ = Number(b.performance?.questionsResolved) || 0;
      const aWeight = Number(a.weight) || 1;
      const bWeight = Number(b.weight) || 1;
      // A origem é a disciplina menos estabelecida: menor peso e/ou menos questões.
      const aIsSource = aWeight < bWeight || (aWeight === bWeight && aQ <= bQ);
      const source = aIsSource ? a : b;
      const target = aIsSource ? b : a;
      suggestions.push({
        sourceId: source.id,
        sourceName: source.name,
        sourceWeight: source.weight,
        sourceQuestions: source.performance?.questionsResolved || 0,
        targetId: target.id,
        targetName: target.name,
        targetWeight: target.weight,
        targetQuestions: target.performance?.questionsResolved || 0,
        score: Math.round(score * 100) / 100,
        reason:
          score >= 0.9 ? "Nome praticamente igual" : "Nomes muito parecidos",
      });
    }
  }
  return suggestions.sort((a, b) => b.score - a.score).slice(0, 20);
}

export async function getDisciplineById(
  id: number,
  userId: number,
): Promise<Discipline | null> {
  const db = readDatabase();
  return db.disciplines.find((d) => d.id === id && d.userId === userId) || null;
}

export function isDisciplineNameBlocked(userId: number, name: string): boolean {
  const db = readDatabase();
  const user = db.users.find((u) => u.id === userId);
  const norm = normalizeString(name);
  if (!norm) return false;
  return (user?.settings.deletedDisciplineNames || []).some(
    (blocked) => normalizeString(blocked) === norm,
  );
}

export async function createDiscipline(data: {
  userId: number;
  name: string;
  color: string;
  weight: number;
}): Promise<{ id: number }> {
  const db = readDatabase();
  const normName = normalizeString(data.name);
  const existing = db.disciplines.find(
    (d) => d.userId === data.userId && normalizeString(d.name) === normName,
  );
  if (existing) {
    // Recriação manual de uma disciplina bloqueada: remove o bloqueio.
    const user = db.users.find((u) => u.id === data.userId);
    if (user?.settings.deletedDisciplineNames?.length) {
      user.settings.deletedDisciplineNames =
        user.settings.deletedDisciplineNames.filter(
          (name) => normalizeString(name) !== normName,
        );
      writeDatabase(db);
    }
    return { id: existing.id };
  }
  db.counters.disciplines++;
  const userDisciplines = db.disciplines.filter(
    (d) => d.userId === data.userId,
  );
  const nextOrder = userDisciplines.length
    ? Math.max(...userDisciplines.map((d) => d.order || 0)) + 1
    : 1;

  const newDiscipline: Discipline = {
    id: db.counters.disciplines,
    userId: data.userId,
    name: data.name,
    color: data.color,
    weight: data.weight,
    order: nextOrder,
    studyTimeSeconds: 0,
    createdAt: now(),
    updatedAt: now(),
  };

  db.disciplines.push(newDiscipline);
  writeDatabase(db);

  return { id: newDiscipline.id };
}

export async function updateDiscipline(
  id: number,
  userId: number,
  data: Partial<
    Pick<
      Discipline,
      "name" | "color" | "weight" | "order" | "performance" | "studyTimeSeconds"
    >
  >,
): Promise<void> {
  const db = readDatabase();
  const index = db.disciplines.findIndex(
    (d) => d.id === id && d.userId === userId,
  );

  if (index >= 0) {
    db.disciplines[index] = {
      ...db.disciplines[index],
      ...data,
      updatedAt: now(),
    };
    writeDatabase(db);
  }
}

export async function deleteDiscipline(
  id: number,
  userId: number,
): Promise<void> {
  const db = readDatabase();
  const discipline = db.disciplines.find(
    (d) => d.id === id && d.userId === userId,
  );
  const topicIds = db.topics
    .filter((t) => t.disciplineId === id && t.userId === userId)
    .map((t) => t.id);
  db.revisions = db.revisions.filter((r) => !topicIds.includes(r.topicId));
  db.topics = db.topics.filter(
    (t) => t.disciplineId !== id || t.userId !== userId,
  );
  db.notes = db.notes.filter(
    (n) => n.disciplineId !== id || n.userId !== userId,
  );
  db.questionErrors = (db.questionErrors || []).filter(
    (e) =>
      e.userId !== userId ||
      (e.disciplineId !== id &&
        (e.topicId == null || !topicIds.includes(e.topicId))),
  );
  db.flashcards = (db.flashcards || []).filter(
    (f) =>
      f.userId !== userId ||
      (f.disciplineId !== id &&
        (f.topicId == null || !topicIds.includes(f.topicId))),
  );
  db.essays = (db.essays || []).filter(
    (e) => e.userId !== userId || e.disciplineId !== id,
  );
  db.disciplines = db.disciplines.filter(
    (d) => d.id !== id || d.userId !== userId,
  );
  if (discipline) {
    const user = db.users.find((u) => u.id === userId);
    if (user) {
      const norm = normalizeString(discipline.name);
      user.settings.deletedDisciplineNames = Array.from(
        new Set([...(user.settings.deletedDisciplineNames || []), norm]),
      );
      if (user.settings.questionAttempts?.length) {
        user.settings.questionAttempts = user.settings.questionAttempts.filter(
          (attempt) =>
            attempt.topicId !== null && !topicIds.includes(attempt.topicId),
        );
      }
    }
  }
  writeDatabase(db);
}

// ============ TOPIC OPERATIONS ============

export interface TopicFilters {
  disciplineId?: number;
  search?: string;
}

export async function getTopicsByUser(
  userId: number,
  filters?: TopicFilters,
): Promise<Topic[]> {
  const db = readDatabase();
  let topics = db.topics.filter((t) => t.userId === userId);
  if (filters?.disciplineId)
    topics = topics.filter((t) => t.disciplineId === filters.disciplineId);
  if (filters?.search) {
    const searchLower = filters.search.toLowerCase();
    topics = topics.filter((t) => t.name.toLowerCase().includes(searchLower));
  }
  return topics.sort((a, b) => {
    if (a.disciplineId !== b.disciplineId)
      return a.disciplineId - b.disciplineId;
    const orderA =
      typeof a.order === "number" ? a.order : Number.MAX_SAFE_INTEGER;
    const orderB =
      typeof b.order === "number" ? b.order : Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    const dateA = a.studyDate || a.createdAt || "";
    const dateB = b.studyDate || b.createdAt || "";
    return dateB.localeCompare(dateA);
  });
}

export async function getTopicById(
  id: number,
  userId: number,
): Promise<Topic | null> {
  const db = readDatabase();
  return db.topics.find((t) => t.id === id && t.userId === userId) || null;
}

export async function createTopic(data: {
  userId: number;
  disciplineId: number;
  name: string;
  studyDate: string;
  notes: string | null;
  studyTimeSeconds?: number;
}): Promise<{ id: number }> {
  const db = readDatabase();
  db.counters.topics++;
  const disciplineTopics = db.topics.filter(
    (t) => t.userId === data.userId && t.disciplineId === data.disciplineId,
  );
  const nextOrder = disciplineTopics.length
    ? Math.max(...disciplineTopics.map((t) => t.order || 0)) + 1
    : 1;
  const newTopic: Topic = {
    id: db.counters.topics,
    userId: data.userId,
    disciplineId: data.disciplineId,
    name: data.name,
    order: nextOrder,
    studyDate: data.studyDate,
    notes: data.notes,
    studyTimeSeconds: data.studyTimeSeconds || 0,
    createdAt: now(),
    updatedAt: now(),
  };
  db.topics.push(newTopic);
  writeDatabase(db);
  return { id: newTopic.id };
}

export type TopicUpdateData = Partial<
  Pick<
    Topic,
    | "name"
    | "disciplineId"
    | "notes"
    | "studyDate"
    | "studyTimeSeconds"
    | "topicNotes"
  >
>;

export async function updateTopic(
  id: number,
  userId: number,
  data: TopicUpdateData,
): Promise<void> {
  const db = readDatabase();
  const index = db.topics.findIndex((t) => t.id === id && t.userId === userId);
  if (index >= 0) {
    db.topics[index] = { ...db.topics[index], ...data, updatedAt: now() };
    writeDatabase(db);
  }
}

export async function deleteTopic(id: number, userId: number): Promise<void> {
  const db = readDatabase();
  db.revisions = db.revisions.filter((r) => r.topicId !== id);
  db.notes = db.notes.filter((n) => n.topicId !== id);
  db.topics = db.topics.filter((t) => t.id !== id || t.userId !== userId);
  writeDatabase(db);
}

export async function mergeDisciplines(
  userId: number,
  sourceId: number,
  targetId: number,
): Promise<{ success: boolean; movedTopics: number; mergedTopics: number }> {
  const db = readDatabase();
  const sourceDisc = db.disciplines.find(
    (d) => d.id === sourceId && d.userId === userId,
  );
  const targetDisc = db.disciplines.find(
    (d) => d.id === targetId && d.userId === userId,
  );
  if (!sourceDisc || !targetDisc) {
    throw new Error("Disciplina de origem ou destino não encontrada");
  }

  // Backup automático antes de mexer em tópicos/revisões/erros (item 3).
  backupJsonPayload(getDataDir(), "mescla-disciplinas", {
    userId,
    source: sourceDisc,
    target: targetDisc,
    topics: db.topics.filter((t) => t.disciplineId === sourceId),
    revisions: db.revisions.filter((r) =>
      db.topics.some((t) => t.id === r.topicId && t.disciplineId === sourceId),
    ),
    questionErrors: (db.questionErrors || []).filter(
      (e) => e.disciplineId === sourceId,
    ),
    questionAttempts: (db.questionAttempts || []).filter(
      (a) => a.disciplineId === sourceId,
    ),
    flashcards: (db.flashcards || []).filter(
      (f) => f.disciplineId === sourceId,
    ),
    notes: (db.notes || []).filter((n) => n.disciplineId === sourceId),
  });

  let movedTopics = 0;
  for (const t of db.topics) {
    if (t.disciplineId === sourceId && t.userId === userId) {
      t.disciplineId = targetId;
      t.updatedAt = now();
      movedTopics++;
    }
  }

  if (db.questionErrors) {
    for (const qe of db.questionErrors) {
      if (qe.disciplineId === sourceId && qe.userId === userId) {
        qe.disciplineId = targetId;
      }
    }
  }

  for (const n of db.notes) {
    if (n.disciplineId === sourceId && n.userId === userId) {
      n.disciplineId = targetId;
      n.updatedAt = now();
    }
  }

  targetDisc.studyTimeSeconds =
    (targetDisc.studyTimeSeconds || 0) + (sourceDisc.studyTimeSeconds || 0);

  // v6.9.7 (item 7): a performance da disciplina também soma. Antes a mescla
  // movia os tópicos, mas o total de questões da origem desaparecia da lista.
  const sourcePerf = (sourceDisc.performance || {}) as Record<string, any>;
  const targetPerf = (targetDisc.performance || {}) as Record<string, any>;
  const sourceResolved = Math.max(
    Number(sourcePerf.questionsResolved) || 0,
    (Number(sourcePerf.correctCount) || 0) +
      (Number(sourcePerf.errorCount) || 0),
  );
  const sumResolved =
    (Number(targetPerf.questionsResolved) || 0) + sourceResolved;
  const sumCorrect =
    (Number(targetPerf.correctCount) || 0) +
    (Number(sourcePerf.correctCount) || 0);
  const sumErrors =
    (Number(targetPerf.errorCount) || 0) + (Number(sourcePerf.errorCount) || 0);
  if (sumResolved > 0 || sumCorrect > 0 || sumErrors > 0) {
    const lastImportedAt = [
      targetPerf.lastImportedAt,
      sourcePerf.lastImportedAt,
    ]
      .filter(Boolean)
      .sort()
      .pop();
    targetDisc.performance = {
      ...targetPerf,
      questionsResolved: sumResolved,
      correctCount: sumCorrect,
      errorCount: sumErrors,
      accuracy:
        sumResolved > 0 ? Math.round((sumCorrect / sumResolved) * 100) : 0,
      ...(lastImportedAt ? { lastImportedAt } : {}),
    };
  }

  // Merge também é uma exclusão: impede que sync/import recrie a origem.
  const user = db.users.find((u) => u.id === userId);
  if (user) {
    const sourceNorm = normalizeString(sourceDisc.name);
    user.settings.deletedDisciplineNames = Array.from(
      new Set([...(user.settings.deletedDisciplineNames || []), sourceNorm]),
    );
  }

  if (db.flashcards) {
    for (const f of db.flashcards) {
      if (f.disciplineId === sourceId && f.userId === userId) {
        f.disciplineId = targetId;
      }
    }
  }
  if (db.essays) {
    for (const e of db.essays) {
      if (e.disciplineId === sourceId && e.userId === userId) {
        e.disciplineId = targetId;
      }
    }
  }

  // v6.9.4 (item 3): histórico por questão acompanha a disciplina.
  for (const attempt of db.questionAttempts || []) {
    if (attempt.disciplineId === sourceId && attempt.userId === userId) {
      attempt.disciplineId = targetId;
    }
  }

  // Tópicos homônimos (mesmo nome normalizado) somam performance em vez de
  // continuarem duplicados dentro da disciplina de destino.
  const mergedTopics = mergeHomonymousTopics(db, userId, targetId);

  db.disciplines = db.disciplines.filter(
    (d) => d.id !== sourceId || d.userId !== userId,
  );

  if (user) {
    pushStudyEvent(user, {
      id: `mescla-disciplinas-${sourceId}-${targetId}-${Date.now()}`,
      type: "session",
      occurredAt: now(),
      title: `Disciplinas mescladas: ${sourceDisc.name} → ${targetDisc.name}`,
      detail: `${movedTopics} tópico(s) movido(s) · ${mergedTopics.absorbed} fundido(s) · ${sourceResolved} questão(ões) somadas · backup em data/backups/mescla-disciplinas-*.json.`,
      disciplineId: targetId,
      disciplineName: targetDisc.name,
      source: "mescla-disciplinas",
    });
  }

  writeDatabase(db);
  return {
    success: true,
    movedTopics: movedTopics - mergedTopics.absorbed,
    mergedTopics: mergedTopics.absorbed,
  };
}

/**
 * Agrupa os tópicos de uma disciplina por nome normalizado e funde os
 * duplicados no de menor id: revisões, tentativas, flashcards, erros, notas e
 * performance somada. Usado pela mescla de disciplinas (item 3).
 */
export function mergeHomonymousTopics(
  db: Database,
  userId: number,
  disciplineId: number,
): {
  absorbed: number;
  groups: Array<{ name: string; into: number; from: number[] }>;
} {
  const topics = db.topics.filter(
    (t) => t.userId === userId && t.disciplineId === disciplineId,
  );
  const groups = new Map<string, typeof topics>();
  for (const topic of topics) {
    const key = normalizeString(topic.name);
    if (!key) continue;
    const list = groups.get(key) || [];
    list.push(topic);
    groups.set(key, list);
  }

  const merged: Array<{ name: string; into: number; from: number[] }> = [];
  let absorbed = 0;

  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.id - b.id);
    const canonical = sorted[0];
    const others = sorted.slice(1);
    const fromIds = others.map((t) => t.id);

    for (const other of others) {
      for (const revision of db.revisions) {
        if (revision.topicId === other.id && revision.userId === userId)
          revision.topicId = canonical.id;
      }
      for (const attempt of db.questionAttempts || []) {
        if (attempt.topicId === other.id) attempt.topicId = canonical.id;
      }
      for (const error of db.questionErrors || []) {
        if (error.topicId === other.id && error.userId === userId)
          error.topicId = canonical.id;
      }
      for (const note of db.notes || []) {
        if (note.topicId === other.id && note.userId === userId)
          note.topicId = canonical.id;
      }
      for (const flashcard of db.flashcards || []) {
        if (flashcard.topicId === other.id && flashcard.userId === userId)
          flashcard.topicId = canonical.id;
      }

      const fromPerf =
        other.performance || ({} as NonNullable<Topic["performance"]>);
      const intoPerf =
        canonical.performance || ({} as NonNullable<Topic["performance"]>);
      const resolved =
        (Number(intoPerf.questionsResolved) || 0) +
        Math.max(
          Number(fromPerf.questionsResolved) || 0,
          (Number(fromPerf.correctCount) || 0) +
            (Number(fromPerf.errorCount) || 0),
        );
      const correct =
        (Number(intoPerf.correctCount) || 0) +
        (Number(fromPerf.correctCount) || 0);
      const errors =
        (Number(intoPerf.errorCount) || 0) + (Number(fromPerf.errorCount) || 0);
      canonical.performance = {
        ...intoPerf,
        ...fromPerf,
        questionsResolved: resolved,
        correctCount: correct,
        errorCount: errors,
        accuracy: resolved > 0 ? Math.round((correct / resolved) * 100) : 0,
      };
      canonical.studyTimeSeconds =
        (canonical.studyTimeSeconds || 0) + (other.studyTimeSeconds || 0);
      canonical.topicNotes = Array.from(
        new Set([...(canonical.topicNotes || []), ...(other.topicNotes || [])]),
      );
      canonical.updatedAt = now();
      absorbed++;
    }

    db.topics = db.topics.filter(
      (t) =>
        !(
          t.userId === userId &&
          t.disciplineId === disciplineId &&
          fromIds.includes(t.id)
        ),
    );
    merged.push({ name: key, into: canonical.id, from: fromIds });
  }

  return { absorbed, groups: merged };
}

export async function mergeTopics(
  userId: number,
  sourceId: number,
  targetId: number,
): Promise<{ success: boolean; movedRevisions: number }> {
  const db = readDatabase();
  const sourceTopic = db.topics.find(
    (t) => t.id === sourceId && t.userId === userId,
  );
  const targetTopic = db.topics.find(
    (t) => t.id === targetId && t.userId === userId,
  );
  if (!sourceTopic || !targetTopic) {
    throw new Error("Tema de origem ou destino não encontrado");
  }

  let movedRevisions = 0;
  for (const r of db.revisions) {
    if (r.topicId === sourceId && r.userId === userId) {
      r.topicId = targetId;
      r.updatedAt = now();
      movedRevisions++;
    }
  }

  if (db.questionErrors) {
    for (const qe of db.questionErrors) {
      if (qe.topicId === sourceId && qe.userId === userId) {
        qe.topicId = targetId;
      }
    }
  }

  for (const n of db.notes) {
    if (n.topicId === sourceId && n.userId === userId) {
      n.topicId = targetId;
      n.updatedAt = now();
    }
  }

  const sPerf = sourceTopic.performance || {
    questionsResolved: 0,
    correctCount: 0,
    errorCount: 0,
  };
  const tPerf = targetTopic.performance || {
    questionsResolved: 0,
    correctCount: 0,
    errorCount: 0,
  };
  const newResolved =
    (sPerf.questionsResolved || 0) + (tPerf.questionsResolved || 0);
  const newCorrect = (sPerf.correctCount || 0) + (tPerf.correctCount || 0);
  const newError = (sPerf.errorCount || 0) + (tPerf.errorCount || 0);
  targetTopic.performance = {
    questionsResolved: newResolved,
    correctCount: newCorrect,
    errorCount: newError,
    accuracy:
      newResolved > 0 ? Math.round((newCorrect / newResolved) * 100) : 0,
    lastStudied:
      sourceTopic.performance?.lastStudied ||
      targetTopic.performance?.lastStudied,
  };

  targetTopic.studyTimeSeconds =
    (targetTopic.studyTimeSeconds || 0) + (sourceTopic.studyTimeSeconds || 0);
  db.topics = db.topics.filter((t) => t.id !== sourceId || t.userId !== userId);

  writeDatabase(db);
  return { success: true, movedRevisions };
}

// ============ REVISION OPERATIONS ============

export interface RevisionFilters {
  topicId?: number;
  completed?: boolean;
  ignored?: boolean;
}

export async function getRevisionsByUser(
  userId: number,
  filters?: RevisionFilters,
): Promise<Revision[]> {
  const db = readDatabase();
  let revisions = db.revisions.filter((r) => r.userId === userId);
  if (filters?.topicId)
    revisions = revisions.filter((r) => r.topicId === filters.topicId);
  if (filters?.completed !== undefined)
    revisions = revisions.filter((r) => r.completed === filters.completed);
  if (filters?.ignored !== undefined)
    revisions = revisions.filter((r) => r.ignored === filters.ignored);
  return revisions.sort((a, b) =>
    (a.scheduledDate || "").localeCompare(b.scheduledDate || ""),
  );
}

export interface RevisionInput {
  userId: number;
  topicId: number;
  scheduledDate: string;
  type: "revision" | "test";
  revisionNumber: number;
  completed?: boolean;
}

export async function createRevisions(
  revisionsData: RevisionInput[],
): Promise<void> {
  if (revisionsData.length === 0) return;
  const db = readDatabase();

  // Idempotência: a mesma revisão (tópico + data + número + tipo) não pode
  // existir duas vezes. Antes, cada importação/geração empilhava uma cópia.
  const existingKeys = new Set(
    db.revisions.map((revision) =>
      [
        revision.userId,
        revision.topicId,
        revision.scheduledDate,
        revision.revisionNumber,
        revision.type,
      ].join("|"),
    ),
  );

  // Batch all inserts before a single write — avoids N disk writes
  for (const data of revisionsData) {
    const key = [
      data.userId,
      data.topicId,
      data.scheduledDate,
      data.revisionNumber,
      data.type,
    ].join("|");
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);

    db.counters.revisions++;
    const revisionId = db.counters.revisions;
    db.revisions.push({
      id: revisionId,
      userId: data.userId,
      topicId: data.topicId,
      scheduledDate: data.scheduledDate,
      type: data.type,
      revisionNumber: data.revisionNumber,
      completed: data.completed ?? false,
      ignored: false,
      completedAt: null,
      createdAt: now(),
      updatedAt: now(),
    });
    const context = eventContext(db, data.topicId);
    pushStudyEvent(
      db.users.find((user) => user.id === data.userId),
      {
        id: `rev-${revisionId}`,
        type: "revision",
        occurredAt: now(),
        title: `Revisão agendada: ${context.topicName || "tópico"}`,
        detail: `Prevista para ${data.scheduledDate}`,
        topicId: data.topicId,
        disciplineId: context.disciplineId,
        topicName: context.topicName,
        disciplineName: context.disciplineName,
      },
    );
  }
  writeDatabase(db); // single write for all revisions
}

export async function markRevisionCompleted(
  id: number,
  userId: number,
  completed: boolean,
): Promise<void> {
  const db = readDatabase();
  const index = db.revisions.findIndex(
    (r) => r.id === id && r.userId === userId,
  );
  if (index >= 0) {
    db.revisions[index].completed = completed;
    db.revisions[index].completedAt = completed ? now() : null;
    db.revisions[index].updatedAt = now();
    const revision = db.revisions[index];
    const context = eventContext(db, revision.topicId);
    pushStudyEvent(
      db.users.find((user) => user.id === userId),
      {
        id: `rev-${revision.id}`,
        type: "revision",
        occurredAt: now(),
        title: completed
          ? `Revisão concluída: ${context.topicName || "tópico"}`
          : `Revisão reaberta: ${context.topicName || "tópico"}`,
        detail: completed ? "Concluída" : "Reaberta",
        topicId: revision.topicId,
        disciplineId: context.disciplineId,
        topicName: context.topicName,
        disciplineName: context.disciplineName,
      },
    );
    writeDatabase(db);
  }
}

/**
 * v6.9.8 (item 1.3): revisões pendentes de UM tópico que já venceram
 * (`scheduledDate <= hoje local`). Futuras não entram: o calendário 25/50 é
 * intocável — nada é criado nem reagendado.
 */
export async function countTopicBacklog(
  userId: number,
  topicId: number,
  todayLocal: string,
): Promise<{ duePending: number; previous: number }> {
  const today = normalizeLocalDay(todayLocal);
  const revisions = await getRevisionsByUser(userId, {
    completed: false,
    ignored: false,
  });
  const due = revisions.filter(
    (revision) =>
      revision.topicId === topicId &&
      Boolean(today) &&
      String(revision.scheduledDate || "") <= today,
  );
  return {
    duePending: due.length,
    // "anteriores" = todas menos a revisão ativa da sessão.
    previous: Math.max(0, due.length - 1),
  };
}

/**
 * v6.9.8 (item 1.3): conclui em lote o backlog vencido de um tópico.
 * Idempotente, com backup antes de gravar. Nunca toca em revisão futura,
 * nunca cria revisão nova e não altera a regra 25/50.
 */
export async function completeTopicBacklog(
  userId: number,
  topicId: number,
  todayLocal: string,
): Promise<{ completed: number; revisionIds: number[] }> {
  const today = normalizeLocalDay(todayLocal);
  if (!today) return { completed: 0, revisionIds: [] };
  const db = readDatabase();
  const due = db.revisions.filter(
    (revision) =>
      revision.userId === userId &&
      revision.topicId === topicId &&
      !revision.completed &&
      !revision.ignored &&
      String(revision.scheduledDate || "") <= today,
  );
  if (due.length === 0) return { completed: 0, revisionIds: [] };

  // Ação em lote sobre dados do aluno: cópia de segurança antes de gravar.
  backupJsonPayload(getDataDir(), `backlog-topico-${topicId}`, db);

  const stamp = now();
  for (const revision of due) {
    revision.completed = true;
    revision.completedAt = stamp;
    revision.updatedAt = stamp;
  }
  const context = eventContext(db, topicId);
  pushStudyEvent(
    db.users.find((user) => user.id === userId),
    {
      id: `rev-batch-${topicId}-${today}`,
      type: "revision",
      occurredAt: stamp,
      title: `Revisões concluídas em lote: ${context.topicName || "tópico"}`,
      detail: `${due.length} revisão(ões) com data até ${today}`,
      topicId,
      disciplineId: context.disciplineId,
      topicName: context.topicName,
      disciplineName: context.disciplineName,
    },
  );
  writeDatabase(db);
  return {
    completed: due.length,
    revisionIds: due.map((revision) => revision.id),
  };
}

/**
 * v6.9.8 (item 2.4): correções seguras do cartão "Saúde dos dados".
 *
 * Nenhuma delas apaga histórico: reordena, marca enunciado como pendente,
 * remove simulado que nunca foi respondido e reagenda flashcard esquecido.
 * Todas gravam backup ANTES de tocar no banco.
 */
export async function applyDataHealthFix(
  userId: number,
  fix: DataHealthFixId,
  todayLocal?: string,
): Promise<{ affected: number; backup: string | null }> {
  const db = readDatabase();
  const today = normalizeLocalDay(todayLocal) || localDayISO();
  const stamp = now();
  let affected = 0;

  const backup = backupJsonPayload(getDataDir(), `saude-dados-${fix}`, db);

  if (fix === "reorder-disciplines") {
    const mine = db.disciplines.filter(
      (discipline) => discipline.userId === userId,
    );
    const ordered = [...mine].sort(
      (a, b) => (b.weight || 1) - (a.weight || 1) || a.id - b.id,
    );
    ordered.forEach((discipline, index) => {
      if (discipline.order !== index + 1) {
        discipline.order = index + 1;
        discipline.updatedAt = stamp;
        affected += 1;
      }
    });
  } else if (fix === "delete-empty-mock-exams") {
    const before = db.mockExams.length;
    db.mockExams = db.mockExams.filter(
      (exam) =>
        exam.userId !== userId || Object.keys(exam.answers || {}).length > 0,
    );
    affected = before - db.mockExams.length;
  } else if (fix === "mark-errors-statement-pending") {
    for (const error of db.questionErrors || []) {
      if (error.userId !== userId) continue;
      if (error.statementPending === true) continue;
      if (String(error.statement || "").trim().length >= 20) continue;
      error.statementPending = true;
      affected += 1;
    }
  } else if (fix === "reschedule-stale-flashcards") {
    const cutoff = addLocalDays(today, -90);
    for (const card of db.flashcards || []) {
      if (card.userId !== userId || card.archived) continue;
      const day = String(card.nextReviewDate || "").slice(0, 10);
      if (!day || day >= cutoff) continue;
      card.nextReviewDate = today;
      card.updatedAt = stamp;
      affected += 1;
    }
  }

  if (affected > 0) writeDatabase(db);
  return { affected, backup };
}

export async function rescheduleRevision(
  id: number,
  userId: number,
  newDate: string,
): Promise<void> {
  const db = readDatabase();
  const index = db.revisions.findIndex(
    (r) => r.id === id && r.userId === userId,
  );
  if (index >= 0) {
    db.revisions[index].scheduledDate = newDate;
    db.revisions[index].updatedAt = now();
    writeDatabase(db);
  }
}

export async function markRevisionIgnored(
  id: number,
  userId: number,
  ignored: boolean,
): Promise<void> {
  const db = readDatabase();
  const index = db.revisions.findIndex(
    (r) => r.id === id && r.userId === userId,
  );
  if (index >= 0) {
    db.revisions[index].ignored = ignored;
    db.revisions[index].updatedAt = now();
    const revision = db.revisions[index];
    const context = eventContext(db, revision.topicId);
    pushStudyEvent(
      db.users.find((user) => user.id === userId),
      {
        id: `rev-${revision.id}`,
        type: "revision",
        occurredAt: now(),
        title: `${ignored ? "Revisão ignorada" : "Revisão reativada"}: ${context.topicName || "tópico"}`,
        detail: ignored ? "Ignorada" : "Reativada",
        topicId: revision.topicId,
        disciplineId: context.disciplineId,
        topicName: context.topicName,
        disciplineName: context.disciplineName,
      },
    );
    writeDatabase(db);
  }
}

export async function updateRevisionLink(
  id: number,
  userId: number,
  link: string,
): Promise<void> {
  const db = readDatabase();
  const index = db.revisions.findIndex(
    (r) => r.id === id && r.userId === userId,
  );
  if (index >= 0) {
    db.revisions[index].link = link;
    db.revisions[index].updatedAt = now();
    writeDatabase(db);
  }
}

// ============ MOCK EXAM OPERATIONS ============

export async function getMockExamsByUser(userId: number): Promise<MockExam[]> {
  const db = readDatabase();
  return db.mockExams
    .filter((m) => m.userId === userId)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

export async function createMockExam(
  data: Omit<MockExam, "id" | "createdAt">,
): Promise<MockExam> {
  const db = readDatabase();
  db.counters.mockExams++;
  const newExam: MockExam = {
    id: db.counters.mockExams,
    ...data,
    createdAt: now(),
  };
  db.mockExams.push(newExam);
  writeDatabase(db);
  return newExam;
}

export async function updateMockExam(
  id: number,
  userId: number,
  data: Partial<Omit<MockExam, "id" | "userId" | "createdAt">>,
): Promise<void> {
  const db = readDatabase();
  const index = db.mockExams.findIndex(
    (m) => m.id === id && m.userId === userId,
  );
  if (index >= 0) {
    db.mockExams[index] = { ...db.mockExams[index], ...data };
    writeDatabase(db);
  }
}

export async function deleteMockExam(
  id: number,
  userId: number,
): Promise<void> {
  const db = readDatabase();
  db.mockExams = db.mockExams.filter(
    (m) => !(m.id === id && m.userId === userId),
  );
  writeDatabase(db);
}

// ============ NOTE OPERATIONS ============

export async function getNotesByUser(userId: number): Promise<StudyNote[]> {
  const db = readDatabase();
  return db.notes
    .filter((n) => n.userId === userId)
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export async function upsertNote(
  data: Partial<StudyNote> & {
    userId: number;
    disciplineId: number;
    title: string;
    content: string;
  },
): Promise<void> {
  const db = readDatabase();
  if (data.id) {
    const index = db.notes.findIndex(
      (n) => n.id === data.id && n.userId === data.userId,
    );
    if (index >= 0) {
      db.notes[index] = { ...db.notes[index], ...data, updatedAt: now() };
    }
  } else {
    db.counters.notes++;
    db.notes.push({
      id: db.counters.notes,
      userId: data.userId,
      disciplineId: data.disciplineId,
      topicId: data.topicId,
      title: data.title,
      content: data.content,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  writeDatabase(db);
}

export async function createNote(data: {
  userId: number;
  title: string;
  content: string;
  disciplineId?: number;
  topicId?: number;
}): Promise<void> {
  const db = readDatabase();
  let discId = data.disciplineId;
  if (!discId) {
    const userDiscs = db.disciplines.filter((d) => d.userId === data.userId);
    discId = userDiscs[0]?.id || 0;
  }

  db.counters.notes++;
  db.notes.push({
    id: db.counters.notes,
    userId: data.userId,
    disciplineId: discId,
    topicId: data.topicId,
    title: data.title,
    content: data.content,
    createdAt: now(),
    updatedAt: now(),
  });
  writeDatabase(db);
}

export async function updateNote(
  id: number,
  userId: number,
  data: Partial<
    Pick<StudyNote, "title" | "content" | "disciplineId" | "topicId">
  >,
): Promise<void> {
  const db = readDatabase();
  const index = db.notes.findIndex((n) => n.id === id && n.userId === userId);
  if (index >= 0) {
    db.notes[index] = { ...db.notes[index], ...data, updatedAt: now() };
    writeDatabase(db);
  }
}

export async function deleteNote(id: number, userId: number): Promise<void> {
  const db = readDatabase();
  db.notes = db.notes.filter((n) => n.id !== id || n.userId !== userId);
  writeDatabase(db);
}

// ============ BACKUP OPERATIONS ============

/**
 * Remove credenciais do payload exportado. Chaves de IA e push token nunca
 * devem sair do aparelho, nem em backup/sync.
 */
function withoutSecrets<T extends { settings?: object }>(user: T): T {
  if (!user || !user.settings) return user;
  const {
    aiApiKey: _ai,
    pushToken: _token,
    ...safeSettings
  } = user.settings as Record<string, unknown>;
  return { ...user, settings: safeSettings as T["settings"] };
}

export async function exportDatabaseForUser(userId: number): Promise<string> {
  const db = readDatabase();
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new Error("Usuário não encontrado");

  // Filter all tables for this user
  const userDb = {
    ...db,
    users: [withoutSecrets(user)],
    disciplines: db.disciplines.filter((d) => d.userId === userId),
    topics: db.topics.filter((t) => t.userId === userId),
    revisions: db.revisions.filter((r) => r.userId === userId),
    mockExams: db.mockExams?.filter((m) => m.userId === userId) || [],
    notes: db.notes?.filter((n) => n.userId === userId) || [],
    flashcards: db.flashcards?.filter((f) => f.userId === userId) || [],
    questionErrors: db.questionErrors?.filter((q) => q.userId === userId) || [],
    essays: db.essays?.filter((e) => e.userId === userId) || [],
    tecSnapshots: db.tecSnapshots?.filter((t) => t.userId === userId) || [],
    mentorSessions: db.mentorSessions || [],
    questionAttempts: (db.questionAttempts || []).filter(
      (attempt) => !attempt.userId || attempt.userId === userId,
    ),
    cadernosTec: db.cadernosTec?.[userId]
      ? { [userId]: db.cadernosTec[userId] }
      : {},
  };

  const totalRecords =
    userDb.disciplines.length + userDb.topics.length + userDb.revisions.length;
  if (totalRecords === 0) {
    throw new Error(
      "O seu banco de dados de estudos está vazio. Sincronize com o Supabase primeiro ou comece a estudar!",
    );
  }

  return JSON.stringify(userDb, null, 2);
}

export async function exportDatabase(): Promise<string> {
  const db = readDatabase();
  // Nunca exportar `aiApiKey`/`pushToken`: o endpoint /api/sync/export era
  // acessível sem autenticação e entregava as chaves de IA em texto claro.
  return JSON.stringify(
    { ...db, users: db.users.map(withoutSecrets) },
    null,
    2,
  );
}

export async function importDatabaseForUser(
  jsonString: string,
  currentUserId: number,
): Promise<void> {
  try {
    const importedDb = JSON.parse(jsonString);
    if (!importedDb) {
      throw new Error("O arquivo JSON está vazio ou é inválido.");
    }

    const db = readDatabase();
    const merged = smartMergeDatabases(db, importedDb, currentUserId);
    const stats = merged._mergeReport;
    // O relatório é metadado de retorno, não deve ser persistido no banco.
    delete (merged as { _mergeReport?: unknown })._mergeReport;
    writeDatabase(merged as unknown as Database);
    // writeDatabase já atualiza o cache; resetCache() aqui fazia a leitura
    // seguinte pegar o arquivo antigo antes do rename terminar.
    console.log(
      `[Import] Smart merge finalizado para UserID=${currentUserId}: ` +
        `${stats?.disciplinesCount ?? merged.disciplines.length} matérias, ` +
        `${stats?.topicsCount ?? merged.topics.length} tópicos, ` +
        `${stats?.questionErrorsCount ?? (merged.questionErrors?.length || 0)} erros.`,
    );
  } catch (error) {
    console.error("[Import] Erro fatal:", error);
    throw new Error("Falha ao importar: " + (error as Error).message);
  }
}

export function syncReceiveDatabase(incomingJson: string | object): {
  success: boolean;
  stats?: any;
} {
  const incoming =
    typeof incomingJson === "string" ? JSON.parse(incomingJson) : incomingJson;
  if (!incoming || typeof incoming !== "object") {
    throw new Error("Payload de sincronização inválido.");
  }
  const db = readDatabase();
  const merged = smartMergeDatabases(db, incoming);
  const stats = merged._mergeReport;
  delete (merged as { _mergeReport?: unknown })._mergeReport;
  writeDatabase(merged as unknown as Database);
  // Não chamar resetCache(): o cache já contém o merge e limpar forçaria uma
  // leitura do arquivo antes da escrita enfileirada terminar.
  return { success: true, stats };
}

export async function importDatabase(jsonString: string): Promise<void> {
  try {
    const db = JSON.parse(jsonString);
    // Basic validation
    if (db.users && db.disciplines && db.topics && db.revisions) {
      writeDatabase(db);
    } else {
      throw new Error("Invalid database format");
    }
  } catch (error) {
    throw new Error("Falha ao importar: " + (error as Error).message);
  }
}

export async function addSyncHistory(
  userId: number,
  entry: {
    type: "upload" | "download";
    fileName?: string;
    status: "success" | "failure";
    message?: string;
  },
) {
  await runInTransaction((db) => {
    const user = db.users.find((u) => u.id === userId);
    if (!user) return;
    if (!user.settings) user.settings = {} as any;
    if (!user.settings.syncHistory) user.settings.syncHistory = [];

    user.settings.syncHistory.unshift({
      ...entry,
      date: new Date().toISOString(),
    });

    // Keep only last 20 entries (10 of each type roughly, but let's just keep 20 total)
    user.settings.syncHistory = user.settings.syncHistory.slice(0, 20);
    // Faltava persistir: o histórico de sync era mutado só na memória e
    // reaparecia vazio após reiniciar o app.
    writeDatabase(db);
  });
}

// ============ CALENDAR & DASHBOARD DATA ============

export async function getCalendarData(
  userId: number,
  startDate: string,
  endDate: string,
) {
  const db = readDatabase();
  const revisions = db.revisions.filter(
    (r) =>
      r.userId === userId &&
      r.scheduledDate >= startDate &&
      r.scheduledDate <= endDate &&
      !r.ignored,
  );
  const topics = db.topics.filter((t) => t.userId === userId);
  const disciplines = db.disciplines.filter((d) => d.userId === userId);
  return { revisions, topics, disciplines };
}

/**
 * @deprecated Cópia não usada: a rota `dashboard.getStats` chama
 * `analyticsService.getDashboardStats`. Mantida só para não quebrar imports
 * antigos; ao mexer no dashboard, altere analyticsService.
 */
export async function getDashboardStats(userId: number) {
  const db = readDatabase();
  const user = db.users.find((u) => u.id === userId);
  const disciplines = db.disciplines
    .filter((d) => d.userId === userId)
    .sort(
      (a, b) =>
        (a.order ?? Number.MAX_SAFE_INTEGER) -
        (b.order ?? Number.MAX_SAFE_INTEGER),
    );
  const topics = db.topics.filter((t) => t.userId === userId);
  const revisions = db.revisions.filter((r) => r.userId === userId);

  const pendingRevisions = revisions.filter(
    (r) =>
      !r.completed &&
      !r.ignored &&
      r.type === "revision" &&
      r.scheduledDate < localDayISO(),
  ).length;
  const completedRevisions = revisions.filter((r) => r.completed).length;

  // v6.9.4 (item 5): a tela de Edital continua lendo `settings.editalRows`,
  // mas a fonte agora é o concurso ativo.
  const rawSettings = (user?.settings || {}) as Record<string, any>;
  const examList = Array.isArray(rawSettings.exams) ? rawSettings.exams : [];
  const activeExam =
    examList.find((exam: any) => exam.id === rawSettings.activeExamId) ??
    examList[0] ??
    null;
  const activeRows: EditalRow[] =
    activeExam && Array.isArray(activeExam.editalRows)
      ? activeExam.editalRows
      : Array.isArray(rawSettings.editalRows)
        ? rawSettings.editalRows
        : [];
  // Payload do dashboard: sai em toda tela e chegou a 203 KB com a base real
  // (studyEvents 82 KB + edital duplicado dentro de cada concurso). Aqui enviamos
  // só o que a UI usa; listas longas têm endpoint próprio.
  const trimmedEvents = Array.isArray(rawSettings.studyEvents)
    ? rawSettings.studyEvents.slice(-30)
    : [];
  const trimmedObservations = Array.isArray(rawSettings.mentorObservations)
    ? rawSettings.mentorObservations.slice(-10)
    : [];
  const settingsView = {
    ...rawSettings,
    studyEvents: trimmedEvents,
    mentorObservations: trimmedObservations,
    // O edital do concurso ativo já vai em `editalRows` (view abaixo); os
    // demais concursos vão só com a contagem, para não duplicar a lista.
    exams: examList.map((exam: any) => {
      const { editalRows: rows, ...rest } = exam || {};
      return {
        ...rest,
        editalRowCount: Array.isArray(rows) ? rows.length : 0,
      };
    }),
    activeExamId: activeExam?.id ?? rawSettings.activeExamId,
    editalRows: activeRows,
  };

  return {
    totalTopics: topics.length,
    totalDisciplines: disciplines.length,
    pendingRevisions,
    completedRevisions,
    settings: settingsView,
    disciplineStats: disciplines.map((d) => {
      const discTopics = topics.filter((t) => t.disciplineId === d.id);
      // Aggregate performance from topics (questions, accuracy, etc.)
      const totalResolved = discTopics.reduce(
        (sum, t) => sum + (t.performance?.questionsResolved || 0),
        0,
      );
      const totalCorrect = discTopics.reduce(
        (sum, t) => sum + (t.performance?.correctCount || 0),
        0,
      );
      const totalError = discTopics.reduce(
        (sum, t) => sum + (t.performance?.errorCount || 0),
        0,
      );
      const aggPerformance =
        totalResolved > 0
          ? {
              questionsResolved: totalResolved,
              accuracy: Math.round((totalCorrect / totalResolved) * 100),
              correctCount: totalCorrect,
              errorCount: totalError,
            }
          : d.performance;
      const studyTimeFromTopics = discTopics.reduce(
        (sum, t) => sum + (t.studyTimeSeconds || 0),
        0,
      );
      const studyTimeSeconds = studyTimeFromTopics || d.studyTimeSeconds || 0;
      return {
        disciplineId: d.id,
        name: d.name,
        color: d.color,
        topicCount: discTopics.length,
        performance: aggPerformance,
        studyTimeSeconds,
        topics: discTopics
          .sort(
            (a, b) =>
              (a.order ?? Number.MAX_SAFE_INTEGER) -
              (b.order ?? Number.MAX_SAFE_INTEGER),
          )
          .map((t) => {
            const topicRevisions = revisions.filter((r) => r.topicId === t.id);
            const completedRevCount = topicRevisions.filter(
              (r) => r.completed,
            ).length;
            return {
              id: t.id,
              name: t.name,
              studyDate: t.studyDate,
              studyTimeSeconds: t.studyTimeSeconds || 0,
              completedRevisions: completedRevCount,
              performance: t.performance,
            };
          }),
      };
    }),
  };
}

export async function updateTopicPerformance(
  topicId: number,
  userId: number,
  data: { correctCount: number; errorCount: number },
): Promise<void> {
  const db = readDatabase();
  const index = db.topics.findIndex(
    (t) => t.id === topicId && t.userId === userId,
  );
  if (index >= 0) {
    const current = db.topics[index].performance || {
      questionsResolved: 0,
      accuracy: 0,
      correctCount: 0,
      errorCount: 0,
    };
    const totalCorrect = current.correctCount + data.correctCount;
    const totalError = current.errorCount + data.errorCount;
    // questionsResolved is always derived from counts — never stored independently
    const totalResolved = totalCorrect + totalError;
    const accuracy =
      totalResolved > 0 ? Math.round((totalCorrect / totalResolved) * 100) : 0;
    db.topics[index] = {
      ...db.topics[index],
      performance: {
        questionsResolved: totalResolved, // always correct + error, no divergence possible
        accuracy,
        correctCount: totalCorrect,
        errorCount: totalError,
      },
      updatedAt: now(),
    };
    writeDatabase(db);
  }
}

export interface TopicPerformanceData {
  correctCount: number;
  errorCount: number;
  errorByAttention?: number;
  errorByForgetting?: number;
  errorByTheory?: number;
  errorByTrap?: number;
  fastErrors?: number;
  slowErrors?: number;
  // TEC enriched fields
  incidencia?: number;
  totalQuestoesBanca?: number;
  bancaDominante?: string;
  bancaStats?: Record<string, { correct: number; wrong: number }>;
  dificuldade?: number;
}

export async function setTopicPerformance(
  topicId: number,
  userId: number,
  data: TopicPerformanceData,
): Promise<void> {
  await runInTransaction((db) => {
    const index = db.topics.findIndex(
      (t) => t.id === topicId && t.userId === userId,
    );
    if (index < 0) return;

    const totalResolved = data.correctCount + data.errorCount;
    const accuracy =
      totalResolved > 0
        ? Math.round((data.correctCount / totalResolved) * 100)
        : 0;
    const prev = db.topics[index].performance;
    const today = localDayISO();

    const prevHistory = (prev?.history ?? []).filter((h) => h.date !== today);
    const history = [
      ...prevHistory,
      {
        // Depois da atualização: o último registro do dia é o retrato final.
        date: today,
        accuracy,
        questionsResolved: totalResolved,
      },
    ].slice(-30);

    db.topics[index] = {
      ...db.topics[index],
      performance: {
        questionsResolved: totalResolved,
        accuracy,
        correctCount: data.correctCount,
        errorCount: data.errorCount,
        errorByAttention: data.errorByAttention ?? prev?.errorByAttention ?? 0,
        errorByForgetting:
          data.errorByForgetting ?? prev?.errorByForgetting ?? 0,
        errorByTheory: data.errorByTheory ?? prev?.errorByTheory ?? 0,
        errorByTrap: data.errorByTrap ?? prev?.errorByTrap ?? 0,
        fastErrors: data.fastErrors ?? prev?.fastErrors ?? 0,
        slowErrors: data.slowErrors ?? prev?.slowErrors ?? 0,
        history,
        incidencia: data.incidencia ?? prev?.incidencia,
        totalQuestoesBanca: data.totalQuestoesBanca ?? prev?.totalQuestoesBanca,
        bancaDominante: data.bancaDominante ?? prev?.bancaDominante,
        bancaStats: data.bancaStats ?? prev?.bancaStats,
        dificuldade: data.dificuldade ?? prev?.dificuldade,
        lastImportedAt: now(),
      },
      updatedAt: now(),
    };
    writeDatabase(db);
  });
}

export async function updateTopicNotes(
  topicId: number,
  userId: number,
  mantras: string[],
): Promise<void> {
  const db = readDatabase();
  const index = db.topics.findIndex(
    (t) => t.id === topicId && t.userId === userId,
  );
  if (index >= 0) {
    db.topics[index] = {
      ...db.topics[index],
      topicNotes: mantras,
      updatedAt: now(),
    };
    writeDatabase(db);
  }
}

export async function reorderDisciplines(
  userId: number,
  orderedDisciplineIds: number[],
): Promise<void> {
  const db = readDatabase();
  const userDisciplineIds = new Set(
    db.disciplines.filter((d) => d.userId === userId).map((d) => d.id),
  );
  const validOrdered = orderedDisciplineIds.filter((id) =>
    userDisciplineIds.has(id),
  );

  validOrdered.forEach((disciplineId, idx) => {
    const discipline = db.disciplines.find(
      (d) => d.id === disciplineId && d.userId === userId,
    );
    if (discipline) {
      discipline.order = idx + 1;
      discipline.updatedAt = now();
    }
  });

  writeDatabase(db);
}

export async function addTopicStudyTime(
  topicId: number,
  userId: number,
  seconds: number,
): Promise<void> {
  const db = readDatabase();
  const index = db.topics.findIndex(
    (t) => t.id === topicId && t.userId === userId,
  );
  if (index >= 0) {
    db.topics[index] = {
      ...db.topics[index],
      studyTimeSeconds: (db.topics[index].studyTimeSeconds || 0) + seconds,
      updatedAt: now(),
    };
    writeDatabase(db);
  }
}

export async function resetAllTopicStats(userId: number): Promise<void> {
  const db = readDatabase();
  db.topics = db.topics.map((t) => {
    if (t.userId !== userId) return t;
    return {
      ...t,
      performance: {
        questionsResolved: 0,
        accuracy: 0,
        correctCount: 0,
        errorCount: 0,
        errorByAttention: 0,
        errorByForgetting: 0,
        errorByTheory: 0,
        errorByTrap: 0,
        fastErrors: 0,
        slowErrors: 0,
        history: [],
      },
      studyTimeSeconds: 0,
      updatedAt: now(),
    };
  });
  writeDatabase(db);
}

export async function reorderTopics(
  userId: number,
  disciplineId: number,
  orderedTopicIds: number[],
): Promise<void> {
  const db = readDatabase();
  const userTopicIds = new Set(
    db.topics
      .filter((t) => t.userId === userId && t.disciplineId === disciplineId)
      .map((t) => t.id),
  );
  const validOrdered = orderedTopicIds.filter((id) => userTopicIds.has(id));

  validOrdered.forEach((topicId, idx) => {
    const topic = db.topics.find(
      (t) =>
        t.id === topicId &&
        t.userId === userId &&
        t.disciplineId === disciplineId,
    );
    if (topic) {
      topic.order = idx + 1;
      topic.updatedAt = now();
    }
  });

  writeDatabase(db);
}

export async function getWeeklyStats(userId: number): Promise<{
  thisWeek: {
    topics: number;
    questions: number;
    correct: number;
    studySeconds: number;
  };
  lastWeek: {
    topics: number;
    questions: number;
    correct: number;
    studySeconds: number;
  };
  byDiscipline: Array<{
    name: string;
    color: string;
    studySeconds: number;
    accuracy: number;
    questionsResolved: number;
  }>;
}> {
  const db = readDatabase();
  const topics = db.topics.filter((t) => t.userId === userId);
  const disciplines = db.disciplines.filter((d) => d.userId === userId);

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(weekStart.getDate() - 7);
  const lastWeekEnd = new Date(weekStart);
  lastWeekEnd.setMilliseconds(-1);

  function inRange(dateStr: string, from: Date, to: Date): boolean {
    const d = new Date(dateStr);
    return d >= from && d <= to;
  }

  const thisWeekTopics = topics.filter((t) =>
    inRange(t.createdAt || t.studyDate, weekStart, today),
  );
  const lastWeekTopics = topics.filter((t) =>
    inRange(t.createdAt || t.studyDate, lastWeekStart, lastWeekEnd),
  );

  const sumPerf = (ts: typeof topics) => ({
    topics: ts.length,
    questions: ts.reduce(
      (s, t) => s + (t.performance?.questionsResolved || 0),
      0,
    ),
    correct: ts.reduce((s, t) => s + (t.performance?.correctCount || 0), 0),
    studySeconds: ts.reduce((s, t) => s + (t.studyTimeSeconds || 0), 0),
  });

  const byDiscipline = disciplines
    .map((d) => {
      const discTopics = topics.filter((t) => t.disciplineId === d.id);
      const totalQ = discTopics.reduce(
        (s, t) => s + (t.performance?.questionsResolved || 0),
        0,
      );
      const totalC = discTopics.reduce(
        (s, t) => s + (t.performance?.correctCount || 0),
        0,
      );
      const secs = discTopics.reduce(
        (s, t) => s + (t.studyTimeSeconds || 0),
        0,
      );
      return {
        name: d.name,
        color: d.color,
        studySeconds: secs,
        accuracy: totalQ > 0 ? Math.round((totalC / totalQ) * 100) : 0,
        questionsResolved: totalQ,
      };
    })
    .filter((d) => d.studySeconds > 0 || d.questionsResolved > 0);

  return {
    thisWeek: sumPerf(thisWeekTopics),
    lastWeek: sumPerf(lastWeekTopics),
    byDiscipline,
  };
}

// ── Comparativo de períodos ───────────────────────────────────────────────
export async function getPeriodComparison(
  userId: number,
  days: number = 7,
): Promise<{
  current: {
    topics: number;
    questions: number;
    correct: number;
    studySeconds: number;
    accuracy: number;
  };
  previous: {
    topics: number;
    questions: number;
    correct: number;
    studySeconds: number;
    accuracy: number;
  };
  disciplineDeltas: Array<{
    name: string;
    color: string;
    accuracyDelta: number;
    timeDelta: number;
    currentAccuracy: number;
    prevAccuracy: number;
  }>;
}> {
  const db = readDatabase();
  const topics = db.topics.filter((t) => t.userId === userId);
  const disciplines = db.disciplines.filter((d) => d.userId === userId);

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const curStart = new Date(today);
  curStart.setDate(today.getDate() - (days - 1));
  curStart.setHours(0, 0, 0, 0);
  const prevEnd = new Date(curStart);
  prevEnd.setMilliseconds(-1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevEnd.getDate() - (days - 1));
  prevStart.setHours(0, 0, 0, 0);

  function inRange(dateStr: string, from: Date, to: Date) {
    const d = new Date(dateStr);
    return d >= from && d <= to;
  }
  function sumTopics(ts: typeof topics) {
    const q = ts.reduce(
      (s, t) => s + (t.performance?.questionsResolved || 0),
      0,
    );
    const c = ts.reduce((s, t) => s + (t.performance?.correctCount || 0), 0);
    return {
      topics: ts.length,
      questions: q,
      correct: c,
      studySeconds: ts.reduce((s, t) => s + (t.studyTimeSeconds || 0), 0),
      accuracy: q > 0 ? Math.round((c / q) * 100) : 0,
    };
  }

  const curTopics = topics.filter((t) =>
    inRange(t.createdAt || t.studyDate, curStart, today),
  );
  const prevTopics = topics.filter((t) =>
    inRange(t.createdAt || t.studyDate, prevStart, prevEnd),
  );

  const disciplineDeltas = disciplines
    .map((d) => {
      const cur = curTopics.filter((t) => t.disciplineId === d.id);
      const prev = prevTopics.filter((t) => t.disciplineId === d.id);
      const curQ = cur.reduce(
        (s, t) => s + (t.performance?.questionsResolved || 0),
        0,
      );
      const curC = cur.reduce(
        (s, t) => s + (t.performance?.correctCount || 0),
        0,
      );
      const prevQ = prev.reduce(
        (s, t) => s + (t.performance?.questionsResolved || 0),
        0,
      );
      const prevC = prev.reduce(
        (s, t) => s + (t.performance?.correctCount || 0),
        0,
      );
      const curAcc = curQ > 0 ? Math.round((curC / curQ) * 100) : 0;
      const prevAcc = prevQ > 0 ? Math.round((prevC / prevQ) * 100) : 0;
      const curSecs = cur.reduce((s, t) => s + (t.studyTimeSeconds || 0), 0);
      const prevSecs = prev.reduce((s, t) => s + (t.studyTimeSeconds || 0), 0);
      return {
        name: d.name,
        color: d.color,
        accuracyDelta: curAcc - prevAcc,
        timeDelta: curSecs - prevSecs,
        currentAccuracy: curAcc,
        prevAccuracy: prevAcc,
      };
    })
    .filter(
      (d) =>
        d.currentAccuracy > 0 ||
        d.prevAccuracy > 0 ||
        Math.abs(d.timeDelta) > 60,
    );

  return {
    current: sumTopics(curTopics),
    previous: sumTopics(prevTopics),
    disciplineDeltas,
  };
}

// ── Disciplinas negligenciadas (notificações) ─────────────────────────────
export async function getNeglectedDisciplines(
  userId: number,
  thresholdDays: number = 7,
): Promise<
  Array<{
    name: string;
    daysSinceStudy: number;
    lastStudyDate: string | null;
  }>
> {
  const db = readDatabase();
  const disciplines = db.disciplines.filter((d) => d.userId === userId);
  const topics = db.topics.filter((t) => t.userId === userId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return disciplines
    .map((d) => {
      const discTopics = topics.filter((t) => t.disciplineId === d.id);
      if (discTopics.length === 0) return null;
      const dates = discTopics
        .map((t) => t.createdAt || t.studyDate)
        .filter(Boolean)
        .sort()
        .reverse();
      const lastDate = dates[0] ? new Date(dates[0]) : null;
      const daysSince = lastDate
        ? Math.floor((today.getTime() - lastDate.getTime()) / 86400000)
        : 999;
      return {
        name: d.name,
        daysSinceStudy: daysSince,
        lastStudyDate: dates[0] || null,
      };
    })
    .filter(
      (d): d is NonNullable<typeof d> =>
        d !== null && d.daysSinceStudy >= thresholdDays,
    )
    .sort((a, b) => b.daysSinceStudy - a.daysSinceStudy);
}

// ============ STUDY HEATMAP ============
export async function getStudyHeatmap(
  userId: number,
  months: number,
): Promise<
  {
    date: string;
    count: number;
    minutes: number;
  }[]
> {
  const db = readDatabase();
  const topics = db.topics.filter((t) => t.userId === userId);

  // Build cutoff date
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  cutoff.setHours(0, 0, 0, 0);
  const cutoffStr = localDayISO(cutoff);

  // Aggregate topics by studyDate (count topics + sum studyTimeSeconds)
  const map: Record<string, { count: number; seconds: number }> = {};

  for (const t of topics) {
    const d = t.studyDate || (t.createdAt ? t.createdAt.split("T")[0] : null);
    if (!d || d < cutoffStr) continue;
    if (!map[d]) map[d] = { count: 0, seconds: 0 };
    map[d].count++;
    map[d].seconds += t.studyTimeSeconds || 0;
  }

  return Object.entries(map)
    .map(([date, { count, seconds }]) => ({
      date,
      count,
      minutes: Math.round(seconds / 60),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ============ FLASHCARD OPERATIONS (SM-2 spaced repetition) ============
export async function getFlashcardsByUser(
  userId: number,
): Promise<Flashcard[]> {
  const db = readDatabase();
  return db.flashcards.filter((f) => f.userId === userId);
}

export async function createFlashcard(data: {
  userId: number;
  disciplineId: number;
  topicId?: number;
  noteId?: number;
  front: string;
  back: string;
  /** v6.9.7: deck do cartão e origem (lei seca exige `sourceErrorId`/`noteId`). */
  deck?: string;
  sourceErrorId?: number;
  sourceNoteKey?: string;
}): Promise<Flashcard> {
  const db = readDatabase();
  db.counters.flashcards++;
  const today = localDayISO();
  const card: Flashcard = {
    id: db.counters.flashcards,
    userId: data.userId,
    disciplineId: data.disciplineId,
    topicId: data.topicId,
    noteId: data.noteId,
    front: data.front,
    back: data.back,
    interval: 1,
    easeFactor: 2.5,
    repetitions: 0,
    nextReviewDate: today,
    deck: data.deck,
    sourceErrorId: data.sourceErrorId,
    sourceNoteKey: data.sourceNoteKey,
    createdAt: now(),
    updatedAt: now(),
  };
  db.flashcards.push(card);
  writeDatabase(db);
  return card;
}

export async function updateFlashcard(
  id: number,
  userId: number,
  data: Partial<Pick<Flashcard, "front" | "back">>,
): Promise<void> {
  const db = readDatabase();
  const idx = db.flashcards.findIndex(
    (f) => f.id === id && f.userId === userId,
  );
  if (idx >= 0) {
    db.flashcards[idx] = { ...db.flashcards[idx], ...data, updatedAt: now() };
    writeDatabase(db);
  }
}

export async function deleteFlashcard(
  id: number,
  userId: number,
): Promise<void> {
  const db = readDatabase();
  db.flashcards = db.flashcards.filter(
    (f) => f.id !== id || f.userId !== userId,
  );
  writeDatabase(db);
}

// SM-2 algorithm: quality 0-5 (0-2 = fail, 3-5 = pass)
export async function reviewFlashcard(
  id: number,
  userId: number,
  quality: number,
): Promise<Flashcard> {
  const db = readDatabase();
  const idx = db.flashcards.findIndex(
    (f) => f.id === id && f.userId === userId,
  );
  if (idx < 0) throw new Error("Flashcard not found");

  const card = { ...db.flashcards[idx] };

  if (quality >= 3) {
    if (card.repetitions === 0) card.interval = 1;
    else if (card.repetitions === 1) card.interval = 6;
    else card.interval = Math.round(card.interval * card.easeFactor);
    card.repetitions++;
  } else {
    card.repetitions = 0;
    card.interval = 1;
  }

  card.easeFactor = Math.max(
    1.3,
    card.easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
  );

  const next = new Date();
  next.setDate(next.getDate() + card.interval);
  card.nextReviewDate = localDayISO(next);
  card.updatedAt = now();

  db.flashcards[idx] = card;
  writeDatabase(db);
  return card;
}

// Get today's study time in minutes (from topics updated today)
export async function getTodayStudyMinutes(userId: number): Promise<number> {
  const db = readDatabase();
  const today = localDayISO();
  const topics = db.topics.filter(
    (t) => t.userId === userId && t.updatedAt?.startsWith(today),
  );
  return Math.round(
    topics.reduce((s, t) => s + (t.studyTimeSeconds || 0), 0) / 60,
  );
}

// ============ QUESTION ERRORS ============

/**
 * Analisa o padrão da alternativa errada para classificar o viés cognitivo
 */
function detectDistractorPattern(
  userAnswer: string | undefined,
  alternatives: { letter: string; text: string }[],
):
  | "absolutist"
  | "partial"
  | "similar"
  | "negative"
  | "timing"
  | "calculation"
  | undefined {
  if (!userAnswer || !alternatives || alternatives.length === 0)
    return undefined;
  const selectedAlt = alternatives.find((a) => a.letter === userAnswer);
  if (!selectedAlt) return undefined;
  const text = selectedAlt.text.toLowerCase();
  if (/\b(sempre|nunca|apenas|somente|exclusive|qualquer)\b/.test(text))
    return "absolutist";
  if (/\b(parcial|parte|algum|incompleto)\b/.test(text)) return "partial";
  if (/\b(invers|invert|contrário|opost)\b/.test(text)) return "negative";
  if (/\b(mais|menos|igual|equivalente)\b/.test(text)) return "calculation";
  if (/\b(antes|depois|primeiro|último)\b/.test(text)) return "timing";
  if (text.length > 30) return "similar";
  return "similar";
}

function parseAlternativesFromStatement(statement: string): {
  statement: string;
  alternatives: Array<{ letter: string; text: string }>;
} {
  const lines = statement
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim());
  const parsed: Array<{ letter: string; text: string }> = [];
  let firstMarker = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!/^[A-E]$/.test(lines[i])) continue;
    let next = i + 1;
    while (next < lines.length && lines[next].trim() === "") next++;
    const text = lines[next] || "";
    if (!text || /^[A-E]$/.test(text)) continue;
    if (firstMarker < 0) firstMarker = i;
    parsed.push({ letter: lines[i], text: text.slice(0, 2000) });
    i = next;
  }
  if (parsed.length < 2 || parsed.length > 6) {
    return { statement, alternatives: [] };
  }
  const before =
    firstMarker > 0 ? lines.slice(0, firstMarker).join("\n").trim() : statement;
  return { statement: before, alternatives: parsed };
}

function sanitizeQuestionErrorData<T extends Record<string, any>>(data: T): T {
  const cleanedStatement = String(data.statement || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const providedAlternatives = Array.isArray(data.alternatives)
    ? data.alternatives
    : [];
  let alternatives =
    providedAlternatives.length > 5
      ? []
      : providedAlternatives
          .filter((a: any) => a && /^[A-E]$/.test(String(a.letter || "")))
          .map((a: any) => ({
            letter: String(a.letter),
            text: String(a.text || "")
              .replace(/\u00a0/g, " ")
              .trim(),
          }))
          .filter((a: any) => a.text.length > 0);

  let statement = cleanedStatement;
  if (alternatives.length === 0) {
    const parsed = parseAlternativesFromStatement(cleanedStatement);
    statement = parsed.statement;
    alternatives = parsed.alternatives;
  }

  if (alternatives.length > 6) alternatives = [];
  const uniqueTexts = new Set(
    alternatives.map((a: any) => a.text.toLowerCase()),
  );
  if (alternatives.length > 2 && uniqueTexts.size <= 1) alternatives = [];

  const letters = new Set(alternatives.map((a: any) => a.letter));
  const cleanAnswer = (value: any) => {
    const letter = String(value || "")
      .trim()
      .toUpperCase();
    return letter && (letters.size === 0 || letters.has(letter)) ? letter : "";
  };

  // v6.9.5: nada de placeholder enganoso. Quando o que veio é só o cabeçalho
  // (#id/banca), guardamos o texto real e marcamos `statementPending` — a UI
  // avisa "enunciado pendente" em vez de fingir que capturou a questão.
  const headerOnly = /^#?\d{5,}\s/.test(statement) && statement.length < 220;
  const statementPending =
    headerOnly ||
    (data as { statementPending?: boolean }).statementPending === true;

  return {
    ...data,
    statement,
    statementPending,
    alternatives,
    userAnswer: cleanAnswer(data.userAnswer),
    correctAnswer: cleanAnswer(data.correctAnswer),
  } as T;
}

export async function saveQuestionError(
  data: Omit<QuestionError, "id" | "createdAt">,
): Promise<QuestionError> {
  // IDEA 1: Detectar automaticamente o padrão do distrator
  const sanitized = sanitizeQuestionErrorData(data);
  const distractorPattern = detectDistractorPattern(
    sanitized.userAnswer,
    sanitized.alternatives,
  );
  return await runInTransaction((db) => {
    db.counters.questionErrors++;
    const record: QuestionError = {
      ...sanitized,
      distractorPattern,
      id: db.counters.questionErrors,
      createdAt: now(),
    };
    db.questionErrors.push(record);
    const context = eventContext(db, record.topicId, record.disciplineId);
    pushStudyEvent(
      db.users.find((user) => user.id === record.userId),
      {
        id: `err-${record.id}`,
        type: "error",
        occurredAt: record.createdAt,
        title: `Erro registrado: ${context.topicName || "questão"}`,
        detail: [record.banca, record.errorOrigin || "não classificado"]
          .filter(Boolean)
          .join(" · "),
        topicId: record.topicId,
        disciplineId: context.disciplineId,
        topicName: context.topicName,
        disciplineName: context.disciplineName,
        correct: false,
        source: "tec",
      },
    );
    writeDatabase(db);
    return record;
  });
}

export interface QuestionErrorFilters {
  topicId?: number;
  disciplineId?: number;
  /** Máximo de resultados por página (padrão 50, máx 200) */
  limit?: number;
  /** Offset para paginação */
  offset?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
}

export async function getQuestionErrorsByUser(
  userId: number,
  opts?: QuestionErrorFilters,
): Promise<PaginatedResult<QuestionError>> {
  const db = readDatabase();
  let errors = db.questionErrors.filter((e) => e.userId === userId);
  if (opts?.topicId) errors = errors.filter((e) => e.topicId === opts.topicId);
  if (opts?.disciplineId)
    errors = errors.filter((e) => e.disciplineId === opts.disciplineId);
  errors.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  errors = errors.map((error) => sanitizeQuestionErrorData(error));

  const total = errors.length;
  const limit = Math.min(opts?.limit ?? 50, 200);
  const offset = opts?.offset ?? 0;
  const items = errors.slice(offset, offset + limit);
  return {
    items,
    total,
    hasMore: offset + limit < total,
    nextOffset: offset + limit,
  };
}

/**
 * IDEA 1: Mapeamento Psicológico de Distratores
 * Analisa o padrão das alternativas erradas para identificar viés cognitivo
 */
export async function getDistractorPatternAnalysis(
  userId: number,
): Promise<{ pattern: string; count: number; percentage: number }[]> {
  const db = readDatabase();
  const errors = db.questionErrors.filter(
    (e) => e.userId === userId && e.distractorPattern,
  );
  const patternCounts: Record<string, number> = {};
  for (const err of errors) {
    const p = err.distractorPattern || "unknown";
    patternCounts[p] = (patternCounts[p] || 0) + 1;
  }
  const total = errors.length || 1;
  return Object.entries(patternCounts)
    .map(([pattern, count]) => ({
      pattern,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

export async function integrateMinedQuestions(
  userId: number,
  contestId: string,
  questions: any[],
): Promise<void> {
  return await runInTransaction((db) => {
    for (const q of questions) {
      // 1. Get or Create Discipline
      const subjectName = q.subject || "Geral";
      const normSubject = normalizeString(subjectName);
      let disc = db.disciplines.find(
        (d) => d.userId === userId && normalizeString(d.name) === normSubject,
      );
      if (!disc) {
        db.counters.disciplines++;
        const userDisciplines = db.disciplines.filter(
          (d) => d.userId === userId,
        );
        const nextOrder = userDisciplines.length
          ? Math.max(...userDisciplines.map((d) => d.order || 0)) + 1
          : 1;

        disc = {
          id: db.counters.disciplines,
          userId,
          name: subjectName,
          color: "var(--primary)",
          weight: 1,
          order: nextOrder,
          studyTimeSeconds: 0,
          createdAt: now(),
          updatedAt: now(),
        };
        db.disciplines.push(disc);
      }

      // 2. Get or Create Topic
      const topicName = q.topic || "Geral";
      let top = db.topics.find(
        (t) =>
          t.userId === userId &&
          t.disciplineId === disc!.id &&
          t.name.toLowerCase() === topicName.toLowerCase(),
      );
      if (!top) {
        db.counters.topics++;
        top = {
          id: db.counters.topics,
          userId,
          disciplineId: disc!.id,
          name: topicName,
          order: db.counters.topics,
          studyDate: now(),
          notes: `Minerado: ${contestId}`,
          studyTimeSeconds: 0,
          createdAt: now(),
          updatedAt: now(),
        };
        db.topics.push(top);
      }

      // 3. Save Question
      db.counters.questionErrors++;
      const alternatives = Array.isArray(q.alternatives)
        ? q.alternatives.map((alt: any) => ({
            letter: alt.letter,
            text: String(alt.text),
          }))
        : Object.entries(q.alternatives || {}).map(([letter, text]) => ({
            letter,
            text: String(text),
          }));

      const record: QuestionError = {
        userId,
        topicId: top.id,
        disciplineId: disc.id,
        banca: "IA",
        contest: contestId,
        statement: q.statement,
        supportText: q.supportText,
        alternatives,
        correctAnswer: q.correctAnswer,
        source: "mined",
        id: db.counters.questionErrors,
        createdAt: now(),
      };
      db.questionErrors.push(record);
    }
    writeDatabase(db);
  });
}

export async function saveQuestionErrorAnalysis(
  id: number,
  userId: number,
  aiAnalysis: string,
): Promise<QuestionError | null> {
  const db = readDatabase();
  const idx = db.questionErrors.findIndex(
    (e) => e.id === id && e.userId === userId,
  );
  if (idx === -1) return null;
  db.questionErrors[idx].aiAnalysis = aiAnalysis;
  db.questionErrors[idx].aiAnalyzedAt = now();
  writeDatabase(db);
  return db.questionErrors[idx];
}

export async function saveQuestionErrorRevisionTip(
  id: number,
  userId: number,
  tip: string,
): Promise<QuestionError | null> {
  const db = readDatabase();
  const idx = db.questionErrors.findIndex(
    (e) => e.id === id && e.userId === userId,
  );
  if (idx === -1) return null;
  db.questionErrors[idx].aiRevisionTip = tip;
  db.questionErrors[idx].aiRevisionTipAt = now();
  writeDatabase(db);
  return db.questionErrors[idx];
}

export async function saveQuestionErrorSimilarQuestions(
  id: number,
  userId: number,
  similar: string,
): Promise<QuestionError | null> {
  const db = readDatabase();
  const idx = db.questionErrors.findIndex(
    (e) => e.id === id && e.userId === userId,
  );
  if (idx === -1) return null;
  db.questionErrors[idx].aiSimilarQuestions = similar;
  db.questionErrors[idx].aiSimilarQuestionsAt = now();
  writeDatabase(db);
  return db.questionErrors[idx];
}

export async function markQuestionErrorFlashcardGenerated(
  id: number,
  userId: number,
): Promise<QuestionError | null> {
  const db = readDatabase();
  const idx = db.questionErrors.findIndex(
    (e) => e.id === id && e.userId === userId,
  );
  if (idx === -1) return null;
  db.questionErrors[idx].aiFlashcardGenerated = true;
  writeDatabase(db);
  return db.questionErrors[idx];
}

export async function deleteQuestionError(
  id: number,
  userId: number,
): Promise<void> {
  const db = readDatabase();
  db.questionErrors = db.questionErrors.filter(
    (e) => !(e.id === id && e.userId === userId),
  );
  writeDatabase(db);
}

// ============ ESSAYS ============

export async function saveEssay(
  data: Omit<Essay, "id" | "createdAt" | "updatedAt">,
): Promise<Essay> {
  const db = readDatabase();
  db.counters.essays++;
  const originalImage = persistBase64Media(data.originalImage, "essay");
  const record: Essay = {
    ...data,
    originalImage,
    id: db.counters.essays,
    createdAt: now(),
    updatedAt: now(),
  };
  db.essays.push(record);
  writeDatabase(db);
  return record;
}

export async function getEssaysByUser(
  userId: number,
  disciplineId?: number,
): Promise<Essay[]> {
  const db = readDatabase();
  let items = db.essays.filter((e) => e.userId === userId);
  if (disciplineId)
    items = items.filter((e) => e.disciplineId === disciplineId);
  return items.sort((a, b) =>
    (b.createdAt || "").localeCompare(a.createdAt || ""),
  );
}

export async function getEssayById(
  id: number,
  userId: number,
): Promise<Essay | null> {
  const db = readDatabase();
  return db.essays.find((e) => e.id === id && e.userId === userId) || null;
}

export async function updateEssay(
  id: number,
  userId: number,
  data: Partial<Omit<Essay, "id" | "userId" | "createdAt">>,
): Promise<Essay | null> {
  const db = readDatabase();
  const idx = db.essays.findIndex((e) => e.id === id && e.userId === userId);
  if (idx === -1) return null;
  const updateData = { ...data };
  if (updateData.originalImage) {
    updateData.originalImage = persistBase64Media(
      updateData.originalImage,
      "essay",
    );
  }
  db.essays[idx] = { ...db.essays[idx], ...updateData, updatedAt: now() };
  writeDatabase(db);
  return db.essays[idx];
}

export async function deleteEssay(id: number, userId: number): Promise<void> {
  const db = readDatabase();
  db.essays = db.essays.filter((e) => !(e.id === id && e.userId === userId));
  writeDatabase(db);
}

// ============ V10 NEW FEATURE STORAGE FUNCTIONS ============

/** F04 - Save recall rating when user completes a revision */
export async function saveRevisionRecallRating(
  id: number,
  userId: number,
  rating: 1 | 2 | 3 | 4 | 5,
  freeRecallText?: string,
): Promise<void> {
  const db = readDatabase();
  const idx = db.revisions.findIndex((r) => r.id === id && r.userId === userId);
  if (idx >= 0) {
    db.revisions[idx].recallRating = rating;
    if (freeRecallText !== undefined)
      db.revisions[idx].freeRecallText = freeRecallText;
    db.revisions[idx].updatedAt = now();
    writeDatabase(db);
  }
}

/** F03 - Check if a topic was revised too recently (less than minDays ago) */
export async function getLastRevisionDate(
  topicId: number,
  userId: number,
): Promise<string | null> {
  const db = readDatabase();
  const completed = db.revisions
    .filter(
      (r) =>
        r.topicId === topicId &&
        r.userId === userId &&
        r.completed &&
        r.completedAt,
    )
    .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
  return completed[0]?.completedAt?.split("T")[0] || null;
}

/** F09 - Log emotion before study session */
export async function logEmotion(
  userId: number,
  mood: 1 | 2 | 3 | 4 | 5,
): Promise<void> {
  const db = readDatabase();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return;
  if (!user.settings.emotionLog) user.settings.emotionLog = [];
  user.settings.emotionLog.push({
    date: now(),
    mood,
    hourOfDay: new Date().getHours(),
  });
  // keep last 180 entries
  if (user.settings.emotionLog.length > 180)
    user.settings.emotionLog = user.settings.emotionLog.slice(-180);
  writeDatabase(db);
}

/** F10 - Log study session for peak-hour analysis */
export async function logStudySession(
  userId: number,
  hourStart: number,
  durationMin: number,
  accuracy: number,
  disciplineId?: number,
): Promise<void> {
  const db = readDatabase();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return;
  if (!user.settings.studySessionLog) user.settings.studySessionLog = [];
  const date = localDayISO();
  user.settings.studySessionLog.push({
    date,
    hourStart,
    durationMin,
    accuracy,
    disciplineId,
  });
  if (user.settings.studySessionLog.length > 500)
    user.settings.studySessionLog = user.settings.studySessionLog.slice(-500);
  const context = eventContext(db, undefined, disciplineId);
  pushStudyEvent(user, {
    id: `ses-${date}-${hourStart}-${durationMin}`,
    type: "session",
    occurredAt: now(),
    title: "Sessão de estudo",
    detail: `${durationMin} min registrados`,
    disciplineId: context.disciplineId,
    disciplineName: context.disciplineName,
    minutes: durationMin,
    source: "manual",
  });
  writeDatabase(db);
}

/** F10 - Get peak hour analysis */
export async function getPeakHoursAnalysis(
  userId: number,
): Promise<Array<{ hour: number; avgAccuracy: number; sessions: number }>> {
  const db = readDatabase();
  const user = db.users.find((u) => u.id === userId);
  const log = user?.settings?.studySessionLog || [];
  const hourMap: Record<number, { total: number; count: number }> = {};
  for (const s of log) {
    if (s.accuracy > 0) {
      if (!hourMap[s.hourStart]) hourMap[s.hourStart] = { total: 0, count: 0 };
      hourMap[s.hourStart].total += s.accuracy;
      hourMap[s.hourStart].count++;
    }
  }
  return Object.entries(hourMap)
    .map(([hour, data]) => ({
      hour: parseInt(hour),
      avgAccuracy: Math.round((data.total / data.count) * 100) / 100,
      sessions: data.count,
    }))
    .sort((a, b) => b.avgAccuracy - a.avgAccuracy);
}

/** F15 - Log end of study time for sleep warning analysis */
export async function logStudyEndTime(
  userId: number,
  endHour: number,
  alertIssued: boolean,
): Promise<void> {
  const db = readDatabase();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return;
  if (!user.settings.sleepLog) user.settings.sleepLog = [];
  const today = localDayISO();
  const existing = user.settings.sleepLog.findIndex((s) => s.date === today);
  if (existing >= 0) {
    user.settings.sleepLog[existing] = {
      date: today,
      endStudyHour: endHour,
      alertIssued,
    };
  } else {
    user.settings.sleepLog.push({
      date: today,
      endStudyHour: endHour,
      alertIssued,
    });
  }
  if (user.settings.sleepLog.length > 90)
    user.settings.sleepLog = user.settings.sleepLog.slice(-90);
  writeDatabase(db);
}

/** F17 - Get discipline rebalance report: time invested vs accuracy vs edital weight */
export async function getDisciplineRebalanceReport(userId: number): Promise<
  Array<{
    disciplineId: number;
    name: string;
    color: string;
    studyTimeHours: number;
    accuracy: number;
    questionsResolved: number;
    revisionsDone: number;
    topicsCount: number;
    editalWeight?: number;
  }>
> {
  const db = readDatabase();
  const disciplines = db.disciplines.filter((d) => d.userId === userId);
  const topics = db.topics.filter((t) => t.userId === userId);
  const revisions = db.revisions.filter(
    (r) => r.userId === userId && r.completed,
  );
  const user = db.users.find((u) => u.id === userId);
  const editalRows = user?.settings?.editalRows || [];

  return disciplines.map((d) => {
    const dTopics = topics.filter((t) => t.disciplineId === d.id);
    const dRevisions = revisions.filter((r) =>
      dTopics.some((t) => t.id === r.topicId),
    );
    const totalQ = dTopics.reduce(
      (s, t) => s + (t.performance?.questionsResolved || 0),
      0,
    );
    const totalC = dTopics.reduce(
      (s, t) => s + (t.performance?.correctCount || 0),
      0,
    );
    const editalEntry = editalRows.find((e) =>
      e.discipline?.toLowerCase().includes(d.name.toLowerCase()),
    );
    return {
      disciplineId: d.id,
      name: d.name,
      color: d.color,
      studyTimeHours: Math.round((d.studyTimeSeconds || 0) / 360) / 10,
      accuracy: totalQ > 0 ? Math.round((totalC / totalQ) * 100) : 0,
      questionsResolved: totalQ,
      revisionsDone: dRevisions.length,
      topicsCount: dTopics.length,
      editalWeight: d.weight,
    };
  });
}

/** F19 - Forgetting velocity: compare recall ratings across revision numbers for each topic */
export async function getForgettingVelocityByDiscipline(
  userId: number,
): Promise<
  Array<{
    disciplineId: number;
    disciplineName: string;
    color: string;
    avgRecallAt25: number | null; // avg recall rating at revision 1-3
    avgRecallAt50: number | null; // avg recall rating at revision 6+
    volatility: "low" | "medium" | "high";
    revisionCount: number;
  }>
> {
  const db = readDatabase();
  const disciplines = db.disciplines.filter((d) => d.userId === userId);
  const topics = db.topics.filter((t) => t.userId === userId);
  const revisions = db.revisions.filter(
    (r) => r.userId === userId && r.completed && r.recallRating !== undefined,
  );

  return disciplines.map((d) => {
    const dTopics = topics.filter((t) => t.disciplineId === d.id);
    const dRevs = revisions.filter((r) =>
      dTopics.some((t) => t.id === r.topicId),
    );
    const early = dRevs
      .filter((r) => r.revisionNumber <= 3)
      .map((r) => r.recallRating as number);
    const late = dRevs
      .filter((r) => r.revisionNumber >= 6)
      .map((r) => r.recallRating as number);
    const avgEarly =
      early.length > 0 ? early.reduce((a, b) => a + b, 0) / early.length : null;
    const avgLate =
      late.length > 0 ? late.reduce((a, b) => a + b, 0) / late.length : null;
    const drop = avgEarly !== null && avgLate !== null ? avgEarly - avgLate : 0;
    const volatility: "low" | "medium" | "high" =
      drop < 0.5 ? "low" : drop < 1.5 ? "medium" : "high";
    return {
      disciplineId: d.id,
      disciplineName: d.name,
      color: d.color,
      avgRecallAt25: avgEarly ? Math.round(avgEarly * 10) / 10 : null,
      avgRecallAt50: avgLate ? Math.round(avgLate * 10) / 10 : null,
      volatility,
      revisionCount: dRevs.length,
    };
  });
}

// ============ TEC SNAPSHOTS — histórico de importações ============

/** Salva um snapshot completo após importação TEC (XLSX ou scraping) */
export async function saveTecSnapshot(
  userId: number,
  topics: TecTopicSnapshot[],
): Promise<TecSnapshot> {
  const db = readDatabase();
  db.counters.tecSnapshots++;
  const totalCorrect = topics.reduce((s, t) => s + t.correctCount, 0);
  const totalErrors = topics.reduce((s, t) => s + t.errorCount, 0);
  const totalQuestions = totalCorrect + totalErrors;
  const snapshot: TecSnapshot = {
    id: db.counters.tecSnapshots,
    userId,
    importedAt: now(),
    totalQuestions,
    totalCorrect,
    totalErrors,
    overallAccuracy:
      totalQuestions > 0
        ? Math.round((totalCorrect / totalQuestions) * 100)
        : 0,
    topics,
  };
  if (!db.tecSnapshots) db.tecSnapshots = [];
  db.tecSnapshots.push(snapshot);
  // Keep max 60 snapshots per user
  const userSnaps = db.tecSnapshots.filter((s) => s.userId === userId);
  if (userSnaps.length > 60) {
    const oldest = userSnaps
      .sort((a, b) => (a.importedAt || "").localeCompare(b.importedAt || ""))
      .slice(0, userSnaps.length - 60);
    const oldestIds = new Set(oldest.map((s) => s.id));
    db.tecSnapshots = db.tecSnapshots.filter((s) => !oldestIds.has(s.id));
  }
  writeDatabase(db);
  return snapshot;
}

/** Retorna os últimos N snapshots do usuário, mais recentes primeiro */
export async function getTecSnapshots(
  userId: number,
  limit = 10,
): Promise<TecSnapshot[]> {
  const db = readDatabase();
  if (!db.tecSnapshots) return [];
  return db.tecSnapshots
    .filter((s) => s.userId === userId)
    .sort((a, b) => (b.importedAt || "").localeCompare(a.importedAt || ""))
    .slice(0, limit);
}

/** Retorna o snapshot mais recente antes do atual (para comparação de delta) */
export async function getPreviousTecSnapshot(
  userId: number,
): Promise<TecSnapshot | null> {
  const snaps = await getTecSnapshots(userId, 2);
  return snaps[1] || null;
}

/**
 * Detecta regressões: tópicos que pioraram ≥ threshold pp entre o penúltimo e o último snapshot.
 * Retorna lista ordenada por queda de acerto (maior queda primeiro).
 */
export async function getTecRegressions(
  userId: number,
  thresholdPp = 5,
): Promise<
  Array<{
    topicName: string;
    disciplineName: string;
    previousAccuracy: number;
    currentAccuracy: number;
    delta: number;
    currentErrors: number;
  }>
> {
  const snaps = await getTecSnapshots(userId, 2);
  if (snaps.length < 2) return [];
  const [current, previous] = snaps;
  const regressions: Array<{
    topicName: string;
    disciplineName: string;
    previousAccuracy: number;
    currentAccuracy: number;
    delta: number;
    currentErrors: number;
  }> = [];
  for (const curTopic of current.topics) {
    const prevTopic = previous.topics.find(
      (t: any) =>
        t.topicName === curTopic.topicName &&
        t.disciplineName === curTopic.disciplineName,
    );
    if (!prevTopic) continue;
    const delta = curTopic.accuracy - prevTopic.accuracy;
    if (delta <= -thresholdPp) {
      regressions.push({
        topicName: curTopic.topicName,
        disciplineName: curTopic.disciplineName,
        previousAccuracy: prevTopic.accuracy,
        currentAccuracy: curTopic.accuracy,
        delta,
        currentErrors: curTopic.errorCount,
      });
    }
  }
  return regressions.sort((a, b) => a.delta - b.delta);
}

/**
 * Retorna os tópicos mais vulneráveis do último snapshot (acerto < threshold),
 * ordenados do pior para o melhor.
 */
export async function getWeakTopicsFromSnapshot(
  userId: number,
  accuracyThreshold = 65,
): Promise<TecTopicSnapshot[]> {
  const snaps = await getTecSnapshots(userId, 1);
  if (!snaps[0]) return [];
  return snaps[0].topics
    .filter(
      (t: any) => t.accuracy < accuracyThreshold && t.questionsResolved >= 5,
    )
    .sort((a: any, b: any) => a.accuracy - b.accuracy);
}

// ============ CADERNOS TEC (tempo real via userscript) ============

export async function saveCadernoTec(
  userId: number,
  caderno: CadernoTec,
): Promise<void> {
  const db = readDatabase();
  if (!db.cadernosTec) db.cadernosTec = {};
  if (!db.cadernosTec[userId]) db.cadernosTec[userId] = [];
  const existing = db.cadernosTec[userId].findIndex(
    (c: CadernoTec) => c.cadernoId === caderno.cadernoId,
  );
  if (existing >= 0) db.cadernosTec[userId][existing] = caderno;
  else db.cadernosTec[userId].push(caderno);
  writeDatabase(db);
}

export async function getCadernosTec(userId: number): Promise<CadernoTec[]> {
  const db = readDatabase();
  return (db.cadernosTec?.[userId] ?? []).sort(
    (a: any, b: any) =>
      new Date(b.lastSync).getTime() - new Date(a.lastSync).getTime(),
  );
}

export async function deleteCadernoTec(
  userId: number,
  cadernoId: string,
): Promise<void> {
  const db = readDatabase();
  if (!db.cadernosTec?.[userId]) return;
  db.cadernosTec[userId] = db.cadernosTec[userId].filter(
    (c: CadernoTec) => c.cadernoId !== cadernoId,
  );
  writeDatabase(db);
}

/** Gera um push token seguro usando crypto.randomBytes (64 chars hex) */
function generateSecureToken(): string {
  // Node.js crypto — mais seguro que Math.random()
  try {
    const { randomBytes } = require("crypto") as typeof import("crypto");
    return randomBytes(32).toString("hex");
  } catch {
    // Fallback para ambientes sem crypto (não deveria ocorrer no Node)
    return (
      Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2) +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2)
    );
  }
}

/** Gera e persiste um novo push token, invalidando o anterior (rotação automática) */
export async function generatePushToken(userId: number): Promise<string> {
  const token = generateSecureToken();
  const db = readDatabase();
  const idx = db.users.findIndex((u) => u.id === userId);
  if (idx >= 0) {
    db.users[idx].settings = { ...db.users[idx].settings, pushToken: token };
    writeDatabase(db);
  }
  return token;
}

/** Busca usuário pelo push token. Retorna undefined se token inválido ou não encontrado. */
export async function getUserByPushToken(
  token: string,
): Promise<User | undefined> {
  if (!token || token.length < 8) return undefined;
  const db = readDatabase();

  // Token local do processo (gerado pelo Electron em userData e injetado via
  // env). Antes existia a string pública "ELECTRON_MODE", que qualquer um
  // podia enviar para virar o users[0].
  const localToken = process.env.SOE_LOCAL_TOKEN;
  if (localToken && localToken.length >= 16 && token === localToken) {
    return db.users[0];
  }

  return db.users.find((u) => u.settings?.pushToken === token);
}

/** Revoga o push token de um usuário (limpa a configuração) */
export async function revokePushToken(userId: number): Promise<void> {
  const db = readDatabase();
  const idx = db.users.findIndex((u) => u.id === userId);
  if (idx >= 0) {
    const { pushToken: _, ...rest } = db.users[idx].settings;
    db.users[idx].settings = rest as any;
    writeDatabase(db);
  }
}
// ============ MENTOR OBSERVATIONS ============

export async function getMentorObservations(userId: number): Promise<string[]> {
  const db = readDatabase();
  const user = db.users.find((u) => u.id === userId);
  return user?.settings?.mentorObservations || [];
}

export async function addMentorObservation(
  userId: number,
  observation: string,
): Promise<void> {
  const db = readDatabase();
  const index = db.users.findIndex((u) => u.id === userId);
  if (index >= 0) {
    const user = db.users[index];
    if (!user.settings) user.settings = {} as any;
    if (!user.settings.mentorObservations)
      user.settings.mentorObservations = [];

    // Keep only last 20 observations to prevent prompt bloating
    user.settings.mentorObservations.push(`${localDayISO()}: ${observation}`);
    if (user.settings.mentorObservations.length > 20) {
      user.settings.mentorObservations.shift();
    }

    writeDatabase(db);
  }
}

// ============ FLASHCARD ARCHIVING ============

export async function archiveFlashcard(
  id: number,
  userId: number,
  archived: boolean = true,
): Promise<void> {
  const db = readDatabase();
  const index = db.flashcards.findIndex(
    (f) => f.id === id && f.userId === userId,
  );
  if (index >= 0) {
    db.flashcards[index].archived = archived;
    db.flashcards[index].updatedAt = new Date().toISOString();
    writeDatabase(db);
  }
}

// ============ CONCEPT CONFUSIONS ============

export async function getConceptConfusions(userId: number) {
  const db = readDatabase();
  const user = db.users.find((u) => u.id === userId);
  return user?.settings?.conceptConfusions || [];
}

export async function addConceptConfusion(
  userId: number,
  data: { conceptA: string; conceptB: string; explanation: string },
) {
  const db = readDatabase();
  const index = db.users.findIndex((u) => u.id === userId);
  if (index >= 0) {
    const user = db.users[index];
    if (!user.settings) user.settings = {} as any;
    if (!user.settings.conceptConfusions) user.settings.conceptConfusions = [];

    const existing = user.settings.conceptConfusions.find(
      (c) =>
        (c.conceptA === data.conceptA && c.conceptB === data.conceptB) ||
        (c.conceptA === data.conceptB && c.conceptB === data.conceptA),
    );

    if (existing) {
      existing.occurrences++;
      existing.explanation = data.explanation; // update with latest insight
      existing.detectedAt = new Date().toISOString();
    } else {
      user.settings.conceptConfusions.push({
        id: Math.random().toString(36).substr(2, 9),
        ...data,
        occurrences: 1,
        detectedAt: new Date().toISOString(),
      });
    }

    writeDatabase(db);
  }
}

export async function deleteQuestionsByContest(
  contest: string,
  userId: number,
): Promise<void> {
  const db = readDatabase();
  db.questionErrors = db.questionErrors.filter(
    (q) => q.userId !== userId || q.contest !== contest,
  );
  writeDatabase(db);
}

export async function checkExamIntegrated(
  contest: string,
  userId: number,
): Promise<boolean> {
  const db = readDatabase();
  return db.questionErrors.some(
    (q) =>
      q.userId === userId && q.contest?.toLowerCase() === contest.toLowerCase(),
  );
}

// ============ FUSION FEATURES (RAG & DEEP MAPPING) ============

const LIBRARY_TEXT_DIR = path.join(process.cwd(), "data", "library_text");
const MINED_EXAMS_DIR = path.join(process.cwd(), "data", "mined_exams");

export async function saveLibraryText(fileName: string, text: string) {
  if (!fs.existsSync(LIBRARY_TEXT_DIR))
    fs.mkdirSync(LIBRARY_TEXT_DIR, { recursive: true });
  const safeName = fileName.replace(/[^a-z0-9]/gi, "_").toLowerCase() + ".txt";
  fs.writeFileSync(path.join(LIBRARY_TEXT_DIR, safeName), text, "utf8");
}

export async function searchLibraryText(
  query: string,
  limit = 3,
): Promise<string[]> {
  if (!fs.existsSync(LIBRARY_TEXT_DIR)) return [];
  const files = fs.readdirSync(LIBRARY_TEXT_DIR);
  const snippets: { text: string; score: number }[] = [];

  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 3);

  for (const file of files) {
    const content = fs.readFileSync(path.join(LIBRARY_TEXT_DIR, file), "utf8");
    let score = 0;
    terms.forEach((term) => {
      const regex = new RegExp(term, "gi");
      const matches = content.match(regex);
      if (matches) score += matches.length;
    });

    if (score > 0) {
      // Pega um trecho ao redor do primeiro match
      const firstMatch = content.toLowerCase().indexOf(terms[0]);
      const start = Math.max(0, firstMatch - 500);
      const end = Math.min(content.length, firstMatch + 1500);
      snippets.push({
        text: `[Fonte: ${file}] ...${content.substring(start, end)}...`,
        score,
      });
    }
  }

  return snippets
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.text);
}

export async function getMinedQuestionsCountByTopic(): Promise<
  Record<string, number>
> {
  const counts: Record<string, number> = {};
  if (!fs.existsSync(MINED_EXAMS_DIR)) return counts;

  const files = fs.readdirSync(MINED_EXAMS_DIR);
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const content = fs.readFileSync(path.join(MINED_EXAMS_DIR, file), "utf8");
      const data = JSON.parse(content);
      const questions = Array.isArray(data) ? data : data.questions || [];

      questions.forEach((q: any) => {
        const topic = (q.topic || q.assunto || "Geral").trim();
        counts[topic] = (counts[topic] || 0) + 1;
      });
    } catch (e) {}
  }
  return counts;
}

export async function getRandomTecJsonQuestions(limit = 5): Promise<any[]> {
  const db = readDatabase();
  // Filtramos por questões que vieram do TEC (geralmente via scraper ou importação massiva no banco)
  const tecQuestions = db.questionErrors.filter(
    (q) => (q as any).source === "tec" || q.contest?.includes("TEC"),
  );

  if (tecQuestions.length === 0) return [];

  const shuffled = [...tecQuestions].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, limit).map((q) => ({
    id: q.id,
    statement: q.statement,
    alternatives: q.alternatives || [],
    correctAnswer: q.correctAnswer || "",
    topic: q.contest || "Geral",
    discipline: "Geral",
    banca: q.banca || "TEC",
  }));
}

/**
 * Registra uma sessão guiada completa (início, fim, tópico e resultado).
 *
 * Antes só existia `logStudySession` (hora + duração + acurácia), sem tópico e
 * sem identificação de sessão — o que impedia qualquer relatório por sessão.
 */
export async function logGuidedSession(
  userId: number,
  entry: {
    startedAt: string;
    endedAt: string;
    minutes: number;
    accuracy: number;
    questions: number;
    correct: number;
    topicId?: number;
    topicName?: string;
    disciplineId?: number;
    blockId?: string;
    revisionCompleted?: boolean;
  },
): Promise<void> {
  const db = readDatabase();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return;
  if (!user.settings.studySessionLog) user.settings.studySessionLog = [];

  const started = new Date(entry.startedAt);
  user.settings.studySessionLog.push({
    // v6.9.8 (item 2.2): o dia da sessão é o dia LOCAL — uma sessão às 23:30
    // (02:30 UTC) caía no dia seguinte.
    date: Number.isNaN(started.getTime())
      ? localDayISO()
      : localDayISO(started),
    hourStart: Number.isNaN(started.getTime()) ? 0 : started.getHours(),
    durationMin: Math.max(0, Math.round(entry.minutes)),
    accuracy: Math.max(0, Math.min(1, entry.accuracy / 100)),
    disciplineId: entry.disciplineId,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    topicId: entry.topicId,
    topicName: entry.topicName,
    blockId: entry.blockId,
    questions: entry.questions,
    correct: entry.correct,
    revisionCompleted: entry.revisionCompleted,
  });

  if (user.settings.studySessionLog.length > 500) {
    user.settings.studySessionLog = user.settings.studySessionLog.slice(-500);
  }

  pushStudyEvent(user, {
    id: `guided-${entry.startedAt}-${entry.topicId ?? "geral"}`,
    type: "session",
    occurredAt: entry.endedAt,
    title: entry.topicName ? `Sessão: ${entry.topicName}` : "Sessão guiada",
    detail: `${Math.round(entry.minutes)} min · ${entry.correct}/${entry.questions} acertos`,
    topicId: entry.topicId,
    disciplineId: entry.disciplineId,
    topicName: entry.topicName,
    minutes: Math.round(entry.minutes),
    source: "guided",
  });

  writeDatabase(db);
}

/** Últimas sessões registradas, da mais recente para a mais antiga. */
export async function getRecentStudySessions(
  userId: number,
  limit = 20,
): Promise<
  NonNullable<
    NonNullable<Database["users"][number]["settings"]["studySessionLog"]>
  >
> {
  const db = readDatabase();
  const user = db.users.find((u) => u.id === userId);
  const log = user?.settings?.studySessionLog ?? [];
  return [...log].reverse().slice(0, Math.max(1, limit));
}

// ============ EDITAL POR CONCURSO (v6.9.4, item 5) ============

export interface ExamEditalItem {
  id: string;
  name: string;
  date: string;
  rows: number;
  linkedRows: number;
  active: boolean;
}

/**
 * O edital pertence ao concurso. `activeExamId` diz qual está em uso e o
 * `dashboard.getStats` devolve as linhas do concurso ativo em
 * `settings.editalRows` (view), para a tela de Edital não precisar mudar.
 */
export async function getExamEditalOverview(userId: number): Promise<{
  activeExamId: string | null;
  exams: ExamEditalItem[];
  rows: EditalRow[];
}> {
  const db = readDatabase();
  const user = db.users.find((u) => u.id === userId);
  const settings = (user?.settings || {}) as Record<string, any>;
  const exams = Array.isArray(settings.exams) ? settings.exams : [];
  const activeExamId =
    exams.find((exam: any) => exam.id === settings.activeExamId)?.id ??
    exams[0]?.id ??
    null;
  const active = exams.find((exam: any) => exam.id === activeExamId);
  const rows: EditalRow[] = Array.isArray(active?.editalRows)
    ? active.editalRows
    : Array.isArray(settings.editalRows)
      ? settings.editalRows
      : [];
  return {
    activeExamId,
    rows,
    exams: exams.map((exam: any) => {
      const examRows: EditalRow[] = Array.isArray(exam.editalRows)
        ? exam.editalRows
        : [];
      return {
        id: exam.id,
        name: exam.name,
        date: exam.date,
        rows: examRows.length,
        linkedRows: examRows.filter(
          (row) => Array.isArray(row.topicIds) && row.topicIds.length > 0,
        ).length,
        active: exam.id === activeExamId,
      };
    }),
  };
}

export async function setActiveExam(
  userId: number,
  examId: string,
): Promise<void> {
  const db = readDatabase();
  const user = db.users.find((u) => u.id === userId);
  const exams = Array.isArray(user?.settings?.exams)
    ? user!.settings.exams
    : [];
  if (!exams.some((exam) => exam.id === examId)) {
    throw new Error("Concurso não encontrado.");
  }
  await updateUserSettings(userId, { activeExamId: examId });
}

function writeExamEditalRows(
  db: Database,
  userId: number,
  examId: string | undefined,
  rows: EditalRow[],
): void {
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new Error("Usuário não encontrado.");
  const exams = Array.isArray(user.settings?.exams) ? user.settings.exams : [];
  const targetId = examId || user.settings.activeExamId || exams[0]?.id;
  if (!targetId) {
    // Sem concurso cadastrado: mantém o comportamento antigo (editor livre).
    user.settings.editalRows = rows;
    return;
  }
  const index = exams.findIndex((exam) => exam.id === targetId);
  if (index < 0) throw new Error("Concurso não encontrado.");
  const nextExams = [...exams];
  const previousRows = Array.isArray(nextExams[index]?.editalRows)
    ? (nextExams[index].editalRows as EditalRow[])
    : [];
  nextExams[index] = {
    ...nextExams[index],
    editalRows: preserveRowLinks(rows, previousRows) as EditalRow[],
  };
  user.settings.exams = nextExams;
  user.settings.activeExamId = nextExams[index].id;
  user.settings.editalRows = [];
}

export async function setExamEditalRows(
  userId: number,
  examId: string | undefined,
  rows: EditalRow[],
): Promise<void> {
  const db = readDatabase();
  writeExamEditalRows(db, userId, examId, rows);
  writeDatabase(db);
}

/**
 * Liga linhas do edital a tópicos (sugestão aceita ou escolha manual).
 * Devolve quantas linhas foram alteradas. Backup é responsabilidade do router.
 */
export async function patchEditalRowLinks(
  userId: number,
  links: Array<{ rowId: string; topicIds: number[] }>,
): Promise<number> {
  if (!Array.isArray(links) || links.length === 0) return 0;
  const db = readDatabase();
  const user = db.users.find((u) => u.id === userId);
  const settings = (user?.settings || {}) as Record<string, any>;
  const exams = Array.isArray(settings.exams) ? settings.exams : [];
  const activeId =
    exams.find((exam: any) => exam.id === settings.activeExamId)?.id ??
    exams[0]?.id;
  const byId = new Map(links.map((link) => [link.rowId, link.topicIds || []]));
  let changed = 0;

  const patchList = (rows: EditalRow[]): EditalRow[] =>
    rows.map((row) => {
      if (!byId.has(row.id)) return row;
      changed += 1;
      return {
        ...row,
        topicIds: Array.from(
          new Set(byId.get(row.id)!.filter((id) => Number.isFinite(id))),
        ),
      };
    });

  if (activeId && exams.length > 0) {
    const index = exams.findIndex((exam: any) => exam.id === activeId);
    const rows: EditalRow[] = Array.isArray(exams[index]?.editalRows)
      ? exams[index].editalRows
      : [];
    const nextExams = [...exams];
    nextExams[index] = { ...nextExams[index], editalRows: patchList(rows) };
    user!.settings.exams = nextExams;
  } else if (Array.isArray(settings.editalRows)) {
    user!.settings.editalRows = patchList(settings.editalRows);
  }

  writeDatabase(db);
  return changed;
}

// ============ FLASHCARDS A PARTIR DO CADERNO DE ERROS (item 7) ============

function shortText(value: string | undefined, max = 400): string {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Um flashcard por erro do Caderno de Erros: frente = assertiva curta;
 * verso = resposta correta + resolução. Sem IA (usa os campos existentes) e
 * sem duplicar: o card guarda `sourceErrorId`.
 */
export async function generateFlashcardsFromErrors(
  userId: number,
  errorIds?: number[],
): Promise<{ created: Flashcard[]; skipped: number; total: number }> {
  const db = readDatabase();
  const errors = (db.questionErrors || []).filter(
    (error) =>
      error.userId === userId &&
      (!errorIds || errorIds.length === 0 || errorIds.includes(error.id)),
  );
  const already = new Set(
    (db.flashcards || [])
      .filter((card) => card.userId === userId && card.sourceErrorId)
      .map((card) => card.sourceErrorId),
  );

  const created: Flashcard[] = [];
  let skipped = 0;
  const today = localDayISO();

  for (const error of errors) {
    if (already.has(error.id)) {
      skipped += 1;
      continue;
    }
    const front = shortText(error.statement, 400) || `Erro #${error.id}`;
    const answerParts: string[] = [];
    if (error.correctAnswer)
      answerParts.push(`Resposta correta: ${error.correctAnswer}`);
    if (error.userAnswer) answerParts.push(`Você marcou: ${error.userAnswer}`);
    const explanation =
      error.resolution || error.supportText || error.aiAnalysis;
    if (explanation) answerParts.push(shortText(explanation, 900));
    const back =
      answerParts.join(String.fromCharCode(10, 10)) ||
      "Reveja o enunciado e a resolução.";

    db.counters.flashcards++;
    const card: Flashcard = {
      id: db.counters.flashcards,
      userId,
      disciplineId: error.disciplineId,
      topicId: error.topicId,
      front,
      back,
      interval: 1,
      easeFactor: 2.5,
      repetitions: 0,
      nextReviewDate: today,
      sourceErrorId: error.id,
      createdAt: now(),
      updatedAt: now(),
    };
    db.flashcards.push(card);
    created.push(card);
    already.add(error.id);
  }

  if (created.length > 0) writeDatabase(db);
  return { created, skipped, total: errors.length };
}

// ============ LEI SECA (v6.9.7, item 3) ============
/**
 * Monta o deck "Lei seca" a partir do material do próprio aluno.
 *
 * Idempotente: um cartão por `sourceErrorId` / `noteId` / `sourceNoteKey`.
 * Nada é inventado — cartão sem origem não é criado.
 */
export async function buildLeiSecaDeck(
  userId: number,
  topicIds?: number[],
): Promise<{
  created: Flashcard[];
  skipped: number;
  candidates: ReturnType<typeof buildLeiSecaCards>["candidates"];
  total: number;
}> {
  const db = readDatabase();
  const user = db.users.find((item) => item.id === userId);
  const disciplines = (db.disciplines || []).filter(
    (item) => item.userId === userId,
  );
  const topics = (db.topics || []).filter((item) => item.userId === userId);
  const errors = (db.questionErrors || []).filter(
    (item) => item.userId === userId,
  );
  const notes = (db.notes || []).filter((item) => item.userId === userId);

  const { cards, candidates } = buildLeiSecaCards({
    disciplines,
    topics,
    errors,
    notes,
    topicIds,
  });

  const existing = new Set<string>();
  for (const card of db.flashcards || []) {
    if (card.userId !== userId) continue;
    if (card.sourceErrorId) existing.add(`err:${card.sourceErrorId}`);
    if (card.noteId) existing.add(`note:${card.noteId}`);
    if (card.sourceNoteKey) existing.add(`key:${card.sourceNoteKey}`);
  }

  const today = localDayISO();
  const created: Flashcard[] = [];
  let skipped = 0;
  for (const draft of cards) {
    const key = draft.sourceErrorId
      ? `err:${draft.sourceErrorId}`
      : draft.noteId
        ? `note:${draft.noteId}`
        : draft.sourceNoteKey
          ? `key:${draft.sourceNoteKey}`
          : "";
    if (!key) {
      skipped += 1;
      continue;
    }
    if (existing.has(key)) {
      skipped += 1;
      continue;
    }
    db.counters.flashcards++;
    const card: Flashcard = {
      id: db.counters.flashcards,
      userId,
      disciplineId: draft.disciplineId,
      topicId: draft.topicId,
      noteId: draft.noteId,
      front: draft.front,
      back: draft.back,
      interval: 1,
      easeFactor: 2.5,
      repetitions: 0,
      nextReviewDate: today,
      deck: LEI_SECA_DECK,
      sourceErrorId: draft.sourceErrorId,
      sourceNoteKey: draft.sourceNoteKey,
      createdAt: now(),
      updatedAt: now(),
    };
    db.flashcards.push(card);
    created.push(card);
    existing.add(key);
  }

  if (created.length > 0) {
    if (user) {
      pushStudyEvent(user, {
        id: `lei-seca-${Date.now()}`,
        type: "lesson",
        occurredAt: now(),
        title: `Lei seca: ${created.length} cartão(ões) montado(s)`,
        detail: `Origem: ${created.length} do seu próprio material (erros e notas).`,
        source: "lei-seca",
      });
    }
    writeDatabase(db);
  }

  return { created, skipped, candidates, total: cards.length };
}

/** Cartões de hoje do deck Lei seca, respeitando a meta diária. */
export async function getLeiSecaToday(userId: number): Promise<{
  cards: Flashcard[];
  total: number;
  dueToday: number;
  cap: number;
  candidates: ReturnType<typeof buildLeiSecaCards>["candidates"];
}> {
  const db = readDatabase();
  const user = db.users.find((item) => item.id === userId);
  const today = localDayISO();
  const cards = (db.flashcards || []).filter((card) => card.userId === userId);
  const summary = summarizeLeiSecaDeck(cards as any, today, undefined);
  const cap = resolveDailyCap(user?.settings?.leiSecaDailyCap ?? summary.cap);
  const batch = selectLeiSecaToday(cards as any, today, cap) as Flashcard[];
  const { candidates } = buildLeiSecaCards({
    disciplines: (db.disciplines || []).filter(
      (item) => item.userId === userId,
    ),
    topics: (db.topics || []).filter((item) => item.userId === userId),
    errors: (db.questionErrors || []).filter((item) => item.userId === userId),
    notes: (db.notes || []).filter((item) => item.userId === userId),
  });
  return {
    cards: batch,
    total: summary.total,
    dueToday: summary.dueToday,
    cap,
    candidates,
  };
}

// ============ CONSOLIDAÇÃO DE DISCIPLINAS DUPLICADAS (v6.9.7, item 7) ============
export interface DisciplineConsolidationPreview {
  groups: Array<{
    key: string;
    targetId: number;
    targetName: string;
    targetQuestions: number;
    sources: Array<{
      id: number;
      name: string;
      questions: number;
      topics: number;
    }>;
    topics: number;
    questions: number;
  }>;
  disciplinesBefore: number;
  disciplinesAfter: number;
  totalTopics: number;
  questionsMoved: number;
}

/** Prévia (nada é escrito): origem → destino, tópicos e questões afetados. */
export async function previewDisciplineConsolidation(
  userId: number,
): Promise<DisciplineConsolidationPreview> {
  const db = readDatabase();
  const disciplines = (db.disciplines || []).filter(
    (item) => item.userId === userId,
  );
  const topics = (db.topics || []).filter((item) => item.userId === userId);
  const overview = summarizeDuplicates(disciplines);
  const topicCount = (disciplineId: number) =>
    topics.filter((topic) => topic.disciplineId === disciplineId).length;

  const groups = overview.groups.map((group) => {
    const sources = group.sources.map((source) => ({
      ...source,
      topics: topicCount(source.id),
    }));
    return {
      key: group.key,
      targetId: group.suggestedTarget.id,
      targetName: group.suggestedTarget.name,
      targetQuestions: group.suggestedTarget.questions,
      sources,
      topics: sources.reduce((sum, source) => sum + source.topics, 0),
      questions: sources.reduce((sum, source) => sum + source.questions, 0),
    };
  });

  return {
    groups,
    disciplinesBefore: overview.disciplinesBefore,
    disciplinesAfter: overview.disciplinesAfter,
    totalTopics: groups.reduce((sum, group) => sum + group.topics, 0),
    questionsMoved: groups.reduce((sum, group) => sum + group.questions, 0),
  };
}

/**
 * Consolida todos os grupos duplicados de uma vez, reutilizando
 * `mergeDisciplines` (que já faz backup por mescla e funde tópicos homônimos).
 *
 * Idempotente: sem duplicadas, devolve `consolidated: 0` e não escreve nada.
 */
export async function consolidateDuplicateDisciplines(userId: number): Promise<{
  consolidated: number;
  sourcesAbsorbed: number;
  disciplinesBefore: number;
  disciplinesAfter: number;
  questionsBefore: number;
  questionsAfter: number;
  details: Array<{
    targetName: string;
    merged: Array<{ name: string; questions: number }>;
  }>;
}> {
  const before = await previewDisciplineConsolidation(userId);
  const questionsBefore = (await getDisciplinesByUser(userId)).reduce(
    (sum, discipline) =>
      sum + (Number(discipline.performance?.questionsResolved) || 0),
    0,
  );

  const details: Array<{
    targetName: string;
    merged: Array<{ name: string; questions: number }>;
  }> = [];

  for (const group of before.groups) {
    const merged: Array<{ name: string; questions: number }> = [];
    for (const source of group.sources) {
      await mergeDisciplines(userId, source.id, group.targetId);
      merged.push({ name: source.name, questions: source.questions });
    }
    details.push({ targetName: group.targetName, merged });
  }

  const disciplinesAfterList = await getDisciplinesByUser(userId);
  const questionsAfter = disciplinesAfterList.reduce(
    (sum, discipline) =>
      sum + (Number(discipline.performance?.questionsResolved) || 0),
    0,
  );

  if (details.length > 0) {
    const db = readDatabase();
    const user = db.users.find((item) => item.id === userId);
    if (user) {
      pushStudyEvent(user, {
        id: `consolidacao-${Date.now()}`,
        type: "session",
        occurredAt: now(),
        title: `Consolidação: ${before.groups.length} grupo(s) de disciplinas duplicadas`,
        detail: `${before.disciplinesBefore} → ${before.disciplinesAfter} disciplinas · ${before.questionsMoved} questões somadas. ${details
          .map(
            (item) =>
              `${item.merged.map((m) => m.name).join(", ")} → ${item.targetName}`,
          )
          .join(" | ")}`,
        source: "consolidacao",
      });
      writeDatabase(db);
    }
  }

  return {
    consolidated: details.length,
    sourcesAbsorbed: details.reduce((sum, item) => sum + item.merged.length, 0),
    disciplinesBefore: before.disciplinesBefore,
    disciplinesAfter: disciplinesAfterList.length,
    questionsBefore,
    questionsAfter,
    details,
  };
}
