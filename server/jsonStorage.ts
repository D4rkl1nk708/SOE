import * as fs from "fs";
import * as path from "path";

// Data directory for JSON files
let DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
let CURRENT_USER_ID: string = "default";

export function setDataDir(newDir: string) {
  DATA_DIR = newDir;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function setDbUser(userId: string | number) {
  CURRENT_USER_ID = String(userId || "default");
  resetCache(userId);
}

function getDbFile(userId: string | number) {
  const uid = String(userId || "default");
  return path.join(DATA_DIR, `database_${uid}.json`);
}

// Ensure data directory exists
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  console.warn(
    "Could not create DATA_DIR, might be in a read-only environment like Vercel.",
    e,
  );
}

// ─── In-memory cache ──────────────────────────────────────────────────────────
// Avoids reading the file from disk on every operation.
// Invalidated on every write so reads always reflect the latest state.
interface CacheEntry {
  db: Database;
  version: number;
}
const _dbCaches = new Map<string, CacheEntry>();

export function resetCache(userId: string | number) {
  _dbCaches.delete(String(userId));
}

let _writeLock: Promise<any> = Promise.resolve();

async function runInTransaction<T>(
  userId: string | number,
  fn: (db: Database) => T | Promise<T>,
): Promise<T> {
  const result = await (_writeLock = _writeLock
    .then(async () => {
      try {
        const db = readDatabase(userId);
        const res = await fn(db);
        return res;
      } catch (err) {
        console.error("[jsonStorage] Transaction error:", err);
        throw err;
      }
    })
    .catch((err) => {
      throw err;
    }));
  return result as T;
}

// Type definitions
export interface Discipline {
  id: number;
  userId: string | number;
  name: string;
  color: string;
  weight: number;
  order: number;
  performance?: {
    questionsResolved: number;
    accuracy: number;
    correctCount: number;
    errorCount: number;
    lastImportedAt: string;
  };
  studyTimeSeconds: number; // Total study time in seconds
  createdAt: string;
  updatedAt: string;
}

export interface Topic {
  id: number;
  userId: string | number;
  disciplineId: number;
  name: string;
  order: number;
  studyDate: string;
  notes: string | null;
  performance?: {
    questionsResolved: number;
    accuracy: number;
    correctCount: number;
    errorCount: number;
    // R01 - Matriz de Origem do Erro
    errorByAttention?: number;
    errorByForgetting?: number;
    errorByTheory?: number;
    errorByTrap?: number;
    // R04 - Inferência por Tempo de Resposta (agregado)
    fastErrors?: number;
    slowErrors?: number;
    // History snapshots for R07/R09
    history?: Array<{
      date: string;
      accuracy: number;
      questionsResolved: number;
    }>;
    // TEC — dados enriquecidos de incidência e banca
    incidencia?: number; // 0.0–1.0 — percentual de incidência do assunto na banca/concurso
    totalQuestoesBanca?: number; // total de questões disponíveis no TEC para este assunto
    bancaDominante?: string; // banca com mais questões neste assunto (ex: "CESPE")
    bancaStats?: Record<string, { correct: number; wrong: number }>; // desempenho por banca
    dificuldade?: number; // 0.0–1.0 — dificuldade média do assunto no TEC
    lastImportedAt?: string; // ISO datetime da última importação TEC
  };
  studyTimeSeconds: number;
  // R26 - Anotações de Sobrevivência (per-topic)
  topicNotes?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Revision {
  id: number;
  userId: string | number;
  topicId: number;
  scheduledDate: string;
  type: "revision" | "test";
  revisionNumber: number;
  completed: boolean;
  ignored: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  link?: string; // Link opcional para caderno de questões (TEC, etc.)
  // F04 - Índice de Dificuldade de Evocação
  recallRating?: 1 | 2 | 3 | 4 | 5; // 1=não lembrei nada, 5=lembrei fácil
  // F01 - Free Recall Mode
  freeRecallText?: string; // O que o usuário escreveu no free recall
}

export interface MockExam {
  id: number;
  userId: string | number;
  name: string;
  date: string;
  correct: number;
  wrong: number;
  blank: number;
  totalQuestions: number;
  score: number; // For CESPE: correct - wrong
  createdAt: string;
}

export interface StudyNote {
  id: number;
  userId: string | number;
  disciplineId: number;
  topicId?: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSettings {
  examDate?: string;
  examName?: string;
  exams?: { id: string; name: string; date: string }[];
  editalCycle?: {
    id: string;
    title: string;
    durationMinutes: number;
    done: boolean;
  }[];
  editalRows?: {
    id: string;
    discipline: string;
    topic: string;
    completed: boolean;
    notes?: string;
    // enriched fields from xlsx import
    incidencia?: number; // 0-1 percentage weight
    quantidade?: number; // absolute question count
    acerto?: number; // 0-1 hit rate
    revisar?: boolean;
    avancar?: boolean;
    discursiva?: boolean;
    isHeader?: boolean; // first row of a discipline group
  }[];
  cycleConfig?: {
    type: "numbered" | "weekdays";
    count: number; // number of cycles (for numbered) or days of week selected
    selectedDays?: number[]; // 0=Sun,1=Mon... for weekdays type
    assignments?: { cycleKey: string; disciplineId: number }[]; // which discipline goes in which cycle
  };
  theme: "light" | "dark";
  studyStreak: {
    current: number;
    best: number;
    lastStudyDate: string | null;
  };
  /** Dias entre testes (padrão 3) */
  testIntervalDays?: number;
  /** Dias entre revisões - fase 1 (padrão 25). 0 = sem revisões */
  revisionIntervalDays?: number;
  /** Dias entre revisões - fase 2 (padrão 50) */
  revisionSecondPhaseDays?: number;
  /** Meta diária de estudo em minutos */
  dailyGoalMinutes?: number;
  /** Anotações globais do usuário - R26 */
  topicNotes?: Array<{
    id: string;
    topicPattern: string;
    text: string;
    triggeredCount: number;
  }>;
  /** Afinidade de banca - R18 */
  bancaStats?: Record<string, { correct: number; wrong: number }>;
  /** Medidor de fadiga - R28: questões por sessão registradas */
  fatigueLog?: Array<{
    date: string;
    questionsCount: number;
    hourOfDay: number;
    accuracy: number;
  }>;
  /** Metas de dopamina - R29 */
  gamificationPoints?: number;
  /** Dashboard widget visibility/order config */
  dashboardConfig?: {
    hiddenWidgets?: string[];
    extraWidgets?: string[];
  };
  // ===== NEW FEATURES v10 =====
  /** F09 - Registro de estado emocional antes de estudar */
  emotionLog?: Array<{
    date: string; // ISO datetime
    mood: 1 | 2 | 3 | 4 | 5; // 1=muito mal, 5=ótimo
    hourOfDay: number;
  }>;
  /** F10 - Horário de pico registrado (horas com melhor desempenho) */
  peakHours?: Array<{ hour: number; avgAccuracy: number; sessions: number }>;
  /** F15 - Registro de horário de encerramento de estudo (sono) */
  sleepLog?: Array<{
    date: string;
    endStudyHour: number;
    alertIssued: boolean;
  }>;
  /** F07 - Timer intercalação: tempo máximo contínuo na mesma disciplina (min) */
  attentionAlertMinutes?: number; // padrão 45
  /** F08 - Feedback postergado: mostrar gabarito só no final do bloco */
  delayedFeedback?: boolean;
  /** F16 - Modo pré-prova ativado automaticamente X dias antes */
  preExamDays?: number; // padrão 7
  /** F10 - Score de horário por sessão de estudo */
  studySessionLog?: Array<{
    date: string;
    hourStart: number;
    durationMin: number;
    accuracy: number;
    disciplineId?: number;
  }>;
  /** Token secreto usado pelo userscript Tampermonkey para autenticar pushes em tempo real */
  pushToken?: string;
  /** Chaves de API de Inteligência Artificial cadastradas pelo usuário (para o Mentor SOE) */
  aiApiKey?: string;
  aiProvider?: "gemini" | "openai" | "claude";
  /** Sincronização em Nuvem Invisível: Diretório de auto-backup (para espelhar no Google Drive/Dropbox localmente) */
  autoBackupDir?: string;
  autoBackupEnabled?: boolean;
  /** Foto de perfil em Base64 ou URL */
  profileImage?: string;
  /** Preferência do Electron: Minimizar para a bandeja ao fechar a janela */
  minimizeToTray?: boolean;
  /** F30 - Memória estratégica do Mentor (observações de longo prazo sobre o aluno) */
  mentorObservations?: string[];
  /** F31 - Matriz de Confusão Conceitual (Tópicos que o aluno confunde entre si) */
  conceptConfusions?: Array<{
    id: string;
    conceptA: string;
    conceptB: string;
    explanation: string;
    detectedAt: string;
    occurrences: number;
  }>;
  /** Sentinela (DOU) Settings */
  douName?: string;
  douIntervalMinutes?: number;
  douLastCheck?: string;
  douSeenIds?: string[];
  douResults?: Array<{ id: string; title: string; date: string; url: string }>;
}

export interface User {
  id: string | number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: "user" | "admin";
  settings: UserSettings;
  createdAt: string;
  updatedAt: string;
  lastSignedIn: string;
}

export interface Flashcard {
  id: number;
  userId: string | number;
  disciplineId: number;
  topicId?: number;
  noteId?: number;
  front: string;
  back: string;
  // spaced repetition state
  interval: number; // days until next review
  easeFactor: number; // SM-2 ease factor (default 2.5)
  repetitions: number; // times reviewed successfully
  nextReviewDate: string; // YYYY-MM-DD
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionError {
  id: string | number;
  userId: string | number;
  topicId: number;
  disciplineId: number;
  // Parsed from TEC paste
  questionId?: string; // e.g. "#3872741"
  banca?: string; // e.g. "CEBRASPE (CESPE)"
  year?: number;
  contest?: string; // e.g. "Agente Fazendário Estadual (SEFAZ PR)/Administrador"
  statement: string; // full question statement
  alternatives: { letter: string; text: string }[];
  userAnswer?: string; // e.g. "B"
  correctAnswer?: string; // e.g. "C"
  // Classification
  errorOrigin?: "attention" | "forgetting" | "theory" | "trap";
  // AI analysis saved per question
  aiAnalysis?: string;
  aiAnalyzedAt?: string;
  // AI revision tip
  aiRevisionTip?: string;
  aiRevisionTipAt?: string;
  // AI similar questions
  aiSimilarQuestions?: string;
  aiSimilarQuestionsAt?: string;
  // AI flashcard generated
  aiFlashcardGenerated?: boolean;
  resolution?: string; // NOVO: comentário da resolução importado do TEC
  supportText?: string; // NOVO: texto de apoio da questão
  source?: "manual" | "tec" | "mined"; // NOVO: origem da questão
  // IDEA 1: Mapeamento Psicológico de Distratores
  distractorPattern?:
    | "absolutist"
    | "partial"
    | "similar"
    | "negative"
    | "timing"
    | "calculation";
  createdAt: string;
}

export interface EssayCorrection {
  score: number;
  feedback: string; // Markdown formatted feedback
  errors: Array<{
    type: string;
    description: string;
    suggestion?: string;
    line?: number;
  }>;
  gradeBreakdown: Record<string, number>; // e.g., { "Gramática": 2.0, "Coesão": 3.0 }
}

export interface Essay {
  id: string | number;
  userId: string | number;
  disciplineId: number;
  topicId?: number;
  title: string; // Tema da redação
  banca: string;
  originalImage?: string; // Base64 or URL
  transcription: string;
  correction?: EssayCorrection;
  status: "draft" | "pending" | "corrected";
  createdAt: string;
  updatedAt: string;
}

// ============ TEC SNAPSHOT — histórico de performance por importação ============
export interface TecTopicSnapshot {
  topicName: string;
  disciplineName: string;
  questionsResolved: number;
  correctCount: number;
  errorCount: number;
  accuracy: number;
}

export interface TecSnapshot {
  id: string | number;
  userId: string | number;
  importedAt: string; // ISO datetime
  totalQuestions: number;
  totalCorrect: number;
  totalErrors: number;
  overallAccuracy: number;
  topics: TecTopicSnapshot[];
}

export interface CadernoTec {
  cadernoId: string;
  cadernoUrl: string;
  disciplina: string;
  lastSync: string; // ISO datetime
  topicsCount: number;
}

interface Database {
  users: User[];
  disciplines: Discipline[];
  topics: Topic[];
  revisions: Revision[];
  mockExams: MockExam[];
  notes: StudyNote[];
  flashcards: Flashcard[];
  questionErrors: QuestionError[];
  essays: Essay[];
  tecSnapshots: TecSnapshot[];
  cadernosTec: Record<number, CadernoTec[]>;
  counters: {
    users: number;
    disciplines: number;
    topics: number;
    revisions: number;
    mockExams: number;
    notes: number;
    flashcards: number;
    questionErrors: number;
    essays: number;
    tecSnapshots: number;
  };
}

// Initialize empty database
function getEmptyDatabase(): Database {
  return {
    users: [],
    disciplines: [],
    topics: [],
    revisions: [],
    mockExams: [],
    notes: [],
    flashcards: [],
    questionErrors: [],
    essays: [],
    tecSnapshots: [],
    cadernosTec: {},
    counters: {
      users: 0,
      disciplines: 0,
      topics: 0,
      revisions: 0,
      mockExams: 0,
      notes: 0,
      flashcards: 0,
      questionErrors: 0,
      essays: 0,
      tecSnapshots: 0,
    },
  };
}

// Read database from file (uses in-memory cache when available)
function fixEncoding(str: string): string {
  if (typeof str !== "string") return str;
  try {
    let hasHigh = false;
    for (let i = 0; i < str.length; i++) {
      if (str.charCodeAt(i) > 127) {
        hasHigh = true;
        break;
      }
    }
    if (!hasHigh) return str;
    const bytes = Buffer.alloc(str.length);
    for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
    const fixed = bytes.toString("utf8");
    if (!fixed.includes("\ufffd")) return fixed;
  } catch {}
  return str;
}

function readDatabase(userId: string | number): Database {
  const uid = String(userId || "default");
  const cache = _dbCaches.get(uid);
  if (cache) return cache.db;

  const dbFile = getDbFile(uid);
  const legacyFile = path.join(DATA_DIR, "database.json");

  try {
    const hasUserFile = fs.existsSync(dbFile);
    let db: any = null;

    if (hasUserFile) {
      const data = fs.readFileSync(dbFile, "utf-8");
      try {
        if (data.trim().length > 0) db = JSON.parse(data);
      } catch (e) {
        console.error(
          `[jsonStorage] Parse error for ${uid}, will try migration or empty.`,
        );
      }
    }

    // Check if the current db is "empty" (no real study data)
    const isEmpty =
      !db ||
      (!db.disciplines?.length && !db.topics?.length && !db.revisions?.length);

    // 2. Migration: If current db is empty but legacy global file exists with data
    if (
      isEmpty &&
      fs.existsSync(legacyFile) &&
      uid !== "anonymous" &&
      uid !== "default"
    ) {
      console.log(
        `[jsonStorage] Current database is empty. Checking legacy database.json for migration...`,
      );
      try {
        const data = fs.readFileSync(legacyFile, "utf-8");
        const legacyDb = JSON.parse(data);

        if (legacyDb.disciplines?.length || legacyDb.topics?.length) {
          console.log(
            `[jsonStorage] Legacy data found (${legacyDb.disciplines?.length} disciplines). Migrating...`,
          );
          const migratedDb = ensureDatabaseStructure(legacyDb);

          // Map ALL records to the new UUID
          const mapRecord = (r: any) => {
            if (r) r.userId = uid;
          };
          migratedDb.disciplines.forEach(mapRecord);
          migratedDb.topics.forEach(mapRecord);
          migratedDb.revisions.forEach(mapRecord);
          if (migratedDb.mockExams) migratedDb.mockExams.forEach(mapRecord);
          if (migratedDb.notes) migratedDb.notes.forEach(mapRecord);
          if (migratedDb.flashcards) migratedDb.flashcards.forEach(mapRecord);
          if (migratedDb.questionErrors)
            migratedDb.questionErrors.forEach(mapRecord);
          if (migratedDb.essays) migratedDb.essays.forEach(mapRecord);
          if (migratedDb.tecSnapshots)
            migratedDb.tecSnapshots.forEach(mapRecord);

          // Save and backup
          fs.writeFileSync(dbFile, JSON.stringify(migratedDb, null, 2));
          const backupPath = legacyFile + ".migrated." + Date.now();
          fs.renameSync(legacyFile, backupPath);

          _dbCaches.set(uid, { db: migratedDb, version: 0 });
          return migratedDb;
        }
      } catch (migErr) {
        console.error("[jsonStorage] Migration failed:", migErr);
      }
    }

    if (db) {
      const migratedDb = ensureDatabaseStructure(db);
      _dbCaches.set(uid, { db: migratedDb, version: 0 });
      return migratedDb;
    }
  } catch (error) {
    console.error("[jsonStorage] Error reading database:", error);
  }

  const empty = getEmptyDatabase();
  _dbCaches.set(uid, { db: empty, version: 0 });
  return empty;
}

/**
 * Ensures a database object has all required fields and basic record integrity
 */
function ensureDatabaseStructure(db: any): Database {
  if (!db.users) db.users = [];
  if (!db.disciplines) db.disciplines = [];
  if (!db.topics) db.topics = [];
  if (!db.revisions) db.revisions = [];
  if (!db.mockExams) db.mockExams = [];
  if (!db.notes) db.notes = [];
  if (!db.flashcards) db.flashcards = [];
  if (!db.questionErrors) db.questionErrors = [];
  if (!db.essays) db.essays = [];
  if (!db.tecSnapshots) db.tecSnapshots = [];

  if (!db.counters) {
    db.counters = {
      users: db.users.length,
      disciplines: db.disciplines.length,
      topics: db.topics.length,
      revisions: db.revisions.length,
      mockExams: db.mockExams.length,
      notes: db.notes.length,
      flashcards: db.flashcards.length,
      questionErrors: db.questionErrors.length,
    };
  }

  // Ensure revisions have ignored field
  db.revisions = db.revisions.map((r: any) => ({
    ...r,
    ignored: r.ignored || false,
  }));

  return db as Database;
}

async function writeDatabase(
  db: Database,
  userId: string | number,
): Promise<void> {
  const dbFile = getDbFile(userId);
  try {
    fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), "utf-8");
    _dbCaches.set(String(userId), { db, version: 0 });
  } catch (err) {
    console.error(`[jsonStorage] Error writing database for ${userId}:`, err);
    throw err;
  }
}

function acquireWriteLock(fn: () => any): Promise<void> {
  const p = _writeLock.then(async () => {
    try {
      await fn();
    } catch (err) {
      console.error("[jsonStorage] Lock execution error:", err);
    }
  });
  _writeLock = p;
  return p;
}

// Get current timestamp
function now(): string {
  return new Date().toISOString();
}

// ============ USER OPERATIONS ============

export async function upsertUser(
  userData: Partial<User> & { openId: string },
): Promise<void> {
  const db = readDatabase(userData.openId);
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

  await writeDatabase(db, userData.openId);
}

export async function getUserByOpenId(
  openId: string,
): Promise<User | undefined> {
  const db = readDatabase(openId);
  return db.users.find((u) => u.openId === openId);
}

export async function getUserSettings(
  userId: string | number,
): Promise<UserSettings | undefined> {
  const db = readDatabase(userId);
  const user = db.users.find((u) => u.openId === userId);
  return user?.settings;
}

export async function updateUserSettings(
  userId: string | number,
  data: Partial<UserSettings>,
): Promise<void> {
  return runInTransaction(userId, async (db) => {
    const idx = db.users.findIndex((u) => u.openId === userId);
    if (idx >= 0) {
      db.users[idx].settings = { ...db.users[idx].settings, ...data };
    } else {
      db.users.push({
        id: (db.counters?.users || 0) + 1,
        openId: userId,
        name: "Usuário",
        email: String(userId),
        settings: { theme: "light", ...data },
        createdAt: now(),
        updatedAt: now(),
        lastSignedIn: now(),
      });
      if (db.counters) db.counters.users = (db.counters.users || 0) + 1;
    }
    await writeDatabase(db, userId);
  });
}

// ============ DISCIPLINE OPERATIONS ============

export async function getDisciplinesByUser(
  userId: string | number,
): Promise<Discipline[]> {
  const db = readDatabase(userId);
  return db.disciplines
    .filter((d) => d.userId === userId)
    .sort((a, b) => {
      const orderA =
        typeof a.order === "number" ? a.order : Number.MAX_SAFE_INTEGER;
      const orderB =
        typeof b.order === "number" ? b.order : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return b.weight - a.weight;
    });
}

export async function getDisciplineById(
  id: number,
  userId: string | number,
): Promise<Discipline | null> {
  const db = readDatabase(userId);
  return db.disciplines.find((d) => d.id === id && d.userId === userId) || null;
}

export async function createDiscipline(
  userId: string | number,
  data: {
    userId: string | number;
    name: string;
    color: string;
    weight: number;
  },
): Promise<{ id: number }> {
  const db = readDatabase(userId);
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
  await writeDatabase(db, userId);

  return { id: newDiscipline.id };
}

export async function updateDiscipline(
  id: number,
  userId: string | number,
  data: Partial<
    Pick<
      Discipline,
      "name" | "color" | "weight" | "order" | "performance" | "studyTimeSeconds"
    >
  >,
): Promise<void> {
  const db = readDatabase(userId);
  const index = db.disciplines.findIndex(
    (d) => d.id === id && d.userId === userId,
  );

  if (index >= 0) {
    db.disciplines[index] = {
      ...db.disciplines[index],
      ...data,
      updatedAt: now(),
    };
    await writeDatabase(db, userId);
  }
}

export async function deleteDiscipline(
  id: number,
  userId: string | number,
): Promise<void> {
  const db = readDatabase(userId);
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
  db.disciplines = db.disciplines.filter(
    (d) => d.id !== id || d.userId !== userId,
  );
  await writeDatabase(db, userId);
}

// ============ TOPIC OPERATIONS ============

export interface TopicFilters {
  disciplineId?: number;
  search?: string;
}

export async function getTopicsByUser(
  userId: string | number,
  filters?: TopicFilters,
): Promise<Topic[]> {
  const db = readDatabase(userId);
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
    return b.studyDate.localeCompare(a.studyDate);
  });
}

export async function getTopicById(
  id: number,
  userId: string | number,
): Promise<Topic | null> {
  const db = readDatabase(userId);
  return db.topics.find((t) => t.id === id && t.userId === userId) || null;
}

export async function createTopic(
  userId: string | number,
  data: {
    userId: string | number;
    disciplineId: number;
    name: string;
    studyDate: string;
    notes: string | null;
    studyTimeSeconds?: number;
  },
): Promise<{ id: number }> {
  const db = readDatabase(userId);
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
  await writeDatabase(db, userId);
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
  userId: string | number,
  data: TopicUpdateData,
): Promise<void> {
  const db = readDatabase(userId);
  const index = db.topics.findIndex((t) => t.id === id && t.userId === userId);
  if (index >= 0) {
    db.topics[index] = { ...db.topics[index], ...data, updatedAt: now() };
    await writeDatabase(db, userId);
  }
}

export async function deleteTopic(
  id: number,
  userId: string | number,
): Promise<void> {
  const db = readDatabase(userId);
  db.revisions = db.revisions.filter((r) => r.topicId !== id);
  db.notes = db.notes.filter((n) => n.topicId !== id);
  db.topics = db.topics.filter((t) => t.id !== id || t.userId !== userId);
  await writeDatabase(db, userId);
}

// ============ REVISION OPERATIONS ============

export interface RevisionFilters {
  topicId?: number;
  completed?: boolean;
  ignored?: boolean;
}

export async function getRevisionsByUser(
  userId: string | number,
  filters?: RevisionFilters,
): Promise<Revision[]> {
  const db = readDatabase(userId);
  let revisions = db.revisions.filter((r) => r.userId === userId);
  if (filters?.topicId)
    revisions = revisions.filter((r) => r.topicId === filters.topicId);
  if (filters?.completed !== undefined)
    revisions = revisions.filter((r) => r.completed === filters.completed);
  if (filters?.ignored !== undefined)
    revisions = revisions.filter((r) => r.ignored === filters.ignored);
  return revisions.sort((a, b) =>
    a.scheduledDate.localeCompare(b.scheduledDate),
  );
}

export interface RevisionInput {
  userId: string | number;
  topicId: number;
  scheduledDate: string;
  type: "revision" | "test";
  revisionNumber: number;
  completed?: boolean;
}

export async function createRevisions(
  userId: string | number,
  revisionsData: RevisionInput[],
): Promise<void> {
  if (revisionsData.length === 0) return;
  const db = readDatabase(userId);
  // Batch all inserts before a single write — avoids N disk writes
  for (const data of revisionsData) {
    db.counters.revisions++;
    db.revisions.push({
      id: db.counters.revisions,
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
  }
  await writeDatabase(db, userId); // single write for all revisions
}

export async function markRevisionCompleted(
  id: number,
  userId: string | number,
  completed: boolean,
): Promise<void> {
  const db = readDatabase(userId);
  const index = db.revisions.findIndex(
    (r) => r.id === id && r.userId === userId,
  );
  if (index >= 0) {
    db.revisions[index].completed = completed;
    db.revisions[index].completedAt = completed ? now() : null;
    db.revisions[index].updatedAt = now();
    await writeDatabase(db, userId);
  }
}

export async function rescheduleRevision(
  id: number,
  userId: string | number,
  newDate: string,
): Promise<void> {
  const db = readDatabase(userId);
  const index = db.revisions.findIndex(
    (r) => r.id === id && r.userId === userId,
  );
  if (index >= 0) {
    db.revisions[index].scheduledDate = newDate;
    db.revisions[index].updatedAt = now();
    await writeDatabase(db, userId);
  }
}

export async function markRevisionIgnored(
  id: number,
  userId: string | number,
  ignored: boolean,
): Promise<void> {
  const db = readDatabase(userId);
  const index = db.revisions.findIndex(
    (r) => r.id === id && r.userId === userId,
  );
  if (index >= 0) {
    db.revisions[index].ignored = ignored;
    db.revisions[index].updatedAt = now();
    await writeDatabase(db, userId);
  }
}

export async function updateRevisionLink(
  id: number,
  userId: string | number,
  link: string,
): Promise<void> {
  const db = readDatabase(userId);
  const index = db.revisions.findIndex(
    (r) => r.id === id && r.userId === userId,
  );
  if (index >= 0) {
    db.revisions[index].link = link;
    db.revisions[index].updatedAt = now();
    await writeDatabase(db, userId);
  }
}

// ============ MOCK EXAM OPERATIONS ============

export async function getMockExamsByUser(
  userId: string | number,
): Promise<MockExam[]> {
  const db = readDatabase(userId);
  return db.mockExams
    .filter((m) => m.userId === userId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function createMockExam(
  userId: string | number,
  data: Omit<MockExam, "id" | "createdAt">,
): Promise<MockExam> {
  const db = readDatabase(userId);
  db.counters.mockExams++;
  const newExam: MockExam = {
    id: db.counters.mockExams,
    ...data,
    createdAt: now(),
  };
  db.mockExams.push(newExam);
  await writeDatabase(db, userId);
  return newExam;
}

export async function updateMockExam(
  id: number,
  userId: string | number,
  data: Partial<Omit<MockExam, "id" | "userId" | "createdAt">>,
): Promise<void> {
  const db = readDatabase(userId);
  const index = db.mockExams.findIndex(
    (m) => m.id === id && m.userId === userId,
  );
  if (index >= 0) {
    db.mockExams[index] = { ...db.mockExams[index], ...data };
    await writeDatabase(db, userId);
  }
}

export async function deleteMockExam(
  id: number,
  userId: string | number,
): Promise<void> {
  const db = readDatabase(userId);
  db.mockExams = db.mockExams.filter(
    (m) => !(m.id === id && m.userId === userId),
  );
  await writeDatabase(db, userId);
}

// ============ NOTE OPERATIONS ============

export async function getNotesByUser(
  userId: string | number,
): Promise<StudyNote[]> {
  const db = readDatabase(userId);
  return db.notes
    .filter((n) => n.userId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function upsertNote(
  userId: string | number,
  data: Partial<StudyNote> & {
    userId: string | number;
    disciplineId: number;
    title: string;
    content: string;
  },
): Promise<void> {
  const db = readDatabase(userId);
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
  await writeDatabase(db, userId);
}

export async function createNote(
  userId: string | number,
  data: {
    userId: string | number;
    title: string;
    content: string;
    disciplineId?: number;
    topicId?: number;
  },
): Promise<void> {
  const db = readDatabase(userId);
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
  await writeDatabase(db, userId);
}

export async function updateNote(
  id: number,
  userId: string | number,
  data: Partial<
    Pick<StudyNote, "title" | "content" | "disciplineId" | "topicId">
  >,
): Promise<void> {
  const db = readDatabase(userId);
  const index = db.notes.findIndex((n) => n.id === id && n.userId === userId);
  if (index >= 0) {
    db.notes[index] = { ...db.notes[index], ...data, updatedAt: now() };
    await writeDatabase(db, userId);
  }
}

export async function deleteNote(
  userId: string | number,
  id: number,
): Promise<void> {
  const db = readDatabase(userId);
  db.notes = db.notes.filter((n) => n.id !== id || n.userId !== userId);
  await writeDatabase(db, userId);
}

// ============ BACKUP OPERATIONS ============

export async function exportDatabase(userId: string | number): Promise<string> {
  const db = readDatabase(userId);
  return JSON.stringify(db, null, 2);
}

export async function importDatabase(
  userId: string | number,
  jsonString: string,
): Promise<void> {
  try {
    const targetUserId = String(userId);
    const db = JSON.parse(jsonString);
    console.log(
      `[jsonStorage] Incoming JSON length: ${jsonString.length}. Top-level keys: ${Object.keys(db).join(", ")}`,
    );

    // Basic validation
    if (db.users && db.disciplines && db.topics && db.revisions) {
      console.log(`[jsonStorage] Importing database for user ${targetUserId}`);
      console.log(
        `[jsonStorage] Data summary: ${db.disciplines?.length || 0} disciplines, ${db.topics?.length || 0} topics, ${db.revisions?.length || 0} revisions`,
      );

      // Ensure all required arrays exist
      db.users = db.users || [];
      db.disciplines = db.disciplines || [];
      db.topics = db.topics || [];
      db.revisions = db.revisions || [];
      db.mockExams = db.mockExams || [];
      db.notes = db.notes || [];
      db.flashcards = db.flashcards || [];
      db.questionErrors = db.questionErrors || [];
      db.essays = db.essays || [];
      db.tecSnapshots = db.tecSnapshots || [];

      // Ensure counters exist
      if (!db.counters) {
        db.counters = {
          users: db.users.length,
          disciplines: db.disciplines.length,
          topics: db.topics.length,
          revisions: db.revisions.length,
          notes: db.notes.length,
          mockExams: db.mockExams.length,
          questionErrors: db.questionErrors.length,
          flashcards: db.flashcards.length,
          essays: 0,
          tecSnapshots: 0,
        };
      }

      // Ensure all records belong to the current user
      const mapRecord = (r: any) => {
        if (r) r.userId = targetUserId;
      };

      db.disciplines.forEach(mapRecord);
      db.topics.forEach(mapRecord);
      db.revisions.forEach(mapRecord);
      db.mockExams.forEach(mapRecord);
      db.notes.forEach(mapRecord);
      db.flashcards.forEach(mapRecord);
      db.questionErrors.forEach(mapRecord);
      db.essays.forEach(mapRecord);
      db.tecSnapshots.forEach(mapRecord);

      // Find or create the current user in the imported database
      const existingUserIndex = db.users.findIndex((u: any) => {
        const uId = String(u.openId || u.id || "");
        return uId === targetUserId;
      });

      if (existingUserIndex >= 0) {
        console.log(
          `[jsonStorage] User ${targetUserId} matched with imported user ${db.users[existingUserIndex].openId || db.users[existingUserIndex].id}`,
        );
        db.users[existingUserIndex].openId = targetUserId;
      } else {
        console.log(
          `[jsonStorage] User ${targetUserId} NOT found in imported data. Current users in JSON:`,
          db.users.map((u: any) => ({ id: u.id, openId: u.openId })),
        );
        console.log("[jsonStorage] Creating new user record...");

        // Add current user to the database
        db.users.push({
          id: (db.counters.users || 0) + 1,
          openId: targetUserId,
          name: "Usuário Importado",
          email: `${targetUserId}@soe.local`,
          settings: db.users[0]?.settings || { theme: "light" },
        });
        db.counters.users = (db.counters.users || 0) + 1;
      }

      // Persistence
      await writeDatabase(db, targetUserId);
      console.log(`[jsonStorage] Import successful for user ${targetUserId}`);
    } else {
      throw new Error(
        "Formato de banco de dados inválido (campos obrigatórios ausentes: users, disciplines, topics, revisions).",
      );
    }
  } catch (error) {
    console.error("[jsonStorage] Import Error:", error);
    throw new Error("Falha ao importar banco: " + (error as Error).message);
  }
}

// ============ CALENDAR & DASHBOARD DATA ============

export async function getCalendarData(
  userId: string | number,
  startDate: string,
  endDate: string,
) {
  const db = readDatabase(userId);
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

export async function getDashboardStats(userId: string | number) {
  const db = readDatabase(userId);
  const user = db.users.find((u) => u.openId === userId);
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
      r.scheduledDate < now().split("T")[0],
  ).length;
  const completedRevisions = revisions.filter((r) => r.completed).length;

  return {
    totalTopics: topics.length,
    totalDisciplines: disciplines.length,
    pendingRevisions,
    completedRevisions,
    settings: user?.settings,
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
  userId: string | number,
  data: { correctCount: number; errorCount: number },
): Promise<void> {
  const db = readDatabase(userId);
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
    await writeDatabase(db, userId);
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
  userId: string | number,
  data: TopicPerformanceData,
): Promise<void> {
  await runInTransaction(userId, async (db) => {
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
    const today = now().split("T")[0];

    const prevHistory = (prev?.history ?? []).filter((h) => h.date !== today);
    const history = [
      ...prevHistory,
      {
        date: today,
        accuracy: prev?.accuracy ?? 0,
        questionsResolved: prev?.questionsResolved ?? 0,
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
    await writeDatabase(db, userId);
  });
}

export async function updateTopicNotes(
  topicId: number,
  userId: string | number,
  mantras: string[],
): Promise<void> {
  const db = readDatabase(userId);
  const index = db.topics.findIndex(
    (t) => t.id === topicId && t.userId === userId,
  );
  if (index >= 0) {
    db.topics[index] = {
      ...db.topics[index],
      topicNotes: mantras,
      updatedAt: now(),
    };
    await writeDatabase(db, userId);
  }
}

export async function reorderDisciplines(
  userId: string | number,
  orderedDisciplineIds: number[],
): Promise<void> {
  const db = readDatabase(userId);
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

  await writeDatabase(db, userId);
}

export async function addTopicStudyTime(
  topicId: number,
  userId: string | number,
  seconds: number,
): Promise<void> {
  const db = readDatabase(userId);
  const index = db.topics.findIndex(
    (t) => t.id === topicId && t.userId === userId,
  );
  if (index >= 0) {
    db.topics[index] = {
      ...db.topics[index],
      studyTimeSeconds: (db.topics[index].studyTimeSeconds || 0) + seconds,
      updatedAt: now(),
    };
    await writeDatabase(db, userId);
  }
}

export async function resetAllTopicStats(
  userId: string | number,
): Promise<void> {
  const db = readDatabase(userId);
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
  await writeDatabase(db, userId);
}

export async function reorderTopics(
  userId: string | number,
  disciplineId: number,
  orderedTopicIds: number[],
): Promise<void> {
  const db = readDatabase(userId);
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

  await writeDatabase(db, userId);
}

export async function getWeeklyStats(userId: string | number): Promise<{
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
  const db = readDatabase(userId);
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
  userId: string | number,
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
  const db = readDatabase(userId);
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
  userId: string | number,
  thresholdDays: number = 7,
): Promise<
  Array<{
    name: string;
    daysSinceStudy: number;
    lastStudyDate: string | null;
  }>
> {
  const db = readDatabase(userId);
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
  userId: string | number,
  months: number,
): Promise<
  {
    date: string;
    count: number;
    minutes: number;
  }[]
> {
  const db = readDatabase(userId);
  const topics = db.topics.filter((t) => t.userId === userId);

  // Build cutoff date
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  cutoff.setHours(0, 0, 0, 0);
  const cutoffStr = cutoff.toISOString().split("T")[0];

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
  userId: string | number,
): Promise<Flashcard[]> {
  const db = readDatabase(userId);
  return db.flashcards.filter((f) => f.userId === userId);
}

export async function createFlashcard(
  userId: string | number,
  data: {
    userId: string | number;
    disciplineId: number;
    topicId?: number;
    noteId?: number;
    front: string;
    back: string;
  },
): Promise<Flashcard> {
  const db = readDatabase(userId);
  db.counters.flashcards++;
  const today = now().split("T")[0];
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
    createdAt: now(),
    updatedAt: now(),
  };
  db.flashcards.push(card);
  await writeDatabase(db, userId);
  return card;
}

export async function updateFlashcard(
  id: number,
  userId: string | number,
  data: Partial<Pick<Flashcard, "front" | "back">>,
): Promise<void> {
  const db = readDatabase(userId);
  const idx = db.flashcards.findIndex(
    (f) => f.id === id && f.userId === userId,
  );
  if (idx >= 0) {
    db.flashcards[idx] = { ...db.flashcards[idx], ...data, updatedAt: now() };
    await writeDatabase(db, userId);
  }
}

export async function deleteFlashcard(
  id: number,
  userId: string | number,
): Promise<void> {
  const db = readDatabase(userId);
  db.flashcards = db.flashcards.filter(
    (f) => f.id !== id || f.userId !== userId,
  );
  await writeDatabase(db, userId);
}

// SM-2 algorithm: quality 0-5 (0-2 = fail, 3-5 = pass)
export async function reviewFlashcard(
  id: number,
  userId: string | number,
  quality: number,
): Promise<Flashcard> {
  const db = readDatabase(userId);
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
  card.nextReviewDate = next.toISOString().split("T")[0];
  card.updatedAt = now();

  db.flashcards[idx] = card;
  await writeDatabase(db, userId);
  return card;
}

// Get today's study time in minutes (from topics updated today)
export async function getTodayStudyMinutes(
  userId: string | number,
): Promise<number> {
  const db = readDatabase(userId);
  const today = new Date().toISOString().split("T")[0];
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

export async function createQuestionError(
  userId: string | number,
  data: Omit<QuestionError, "id" | "createdAt">,
): Promise<QuestionError> {
  const distractorPattern = detectDistractorPattern(
    data.userAnswer,
    data.alternatives,
  );
  return await runInTransaction(userId, async (db) => {
    db.counters.questionErrors++;
    const record: QuestionError = {
      ...data,
      distractorPattern,
      id: db.counters.questionErrors,
      createdAt: now(),
    };
    db.questionErrors.push(record);
    await writeDatabase(db, userId);
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
  userId: string | number,
  opts?: QuestionErrorFilters,
): Promise<PaginatedResult<QuestionError>> {
  const db = readDatabase(userId);
  let errors = db.questionErrors.filter((e) => e.userId === userId);
  if (opts?.topicId) errors = errors.filter((e) => e.topicId === opts.topicId);
  if (opts?.disciplineId)
    errors = errors.filter((e) => e.disciplineId === opts.disciplineId);
  errors.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

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
  userId: string | number,
): Promise<{ pattern: string; count: number; percentage: number }[]> {
  const db = readDatabase(userId);
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

export async function saveQuestionErrorAnalysis(
  id: number,
  userId: string | number,
  aiAnalysis: string,
): Promise<QuestionError | null> {
  const db = readDatabase(userId);
  const idx = db.questionErrors.findIndex(
    (e) => e.id === id && e.userId === userId,
  );
  if (idx === -1) return null;
  db.questionErrors[idx].aiAnalysis = aiAnalysis;
  db.questionErrors[idx].aiAnalyzedAt = now();
  await writeDatabase(db, userId);
  return db.questionErrors[idx];
}

export async function saveQuestionErrorRevisionTip(
  id: number,
  userId: string | number,
  tip: string,
): Promise<QuestionError | null> {
  const db = readDatabase(userId);
  const idx = db.questionErrors.findIndex(
    (e) => e.id === id && e.userId === userId,
  );
  if (idx === -1) return null;
  db.questionErrors[idx].aiRevisionTip = tip;
  db.questionErrors[idx].aiRevisionTipAt = now();
  await writeDatabase(db, userId);
  return db.questionErrors[idx];
}

export async function saveQuestionErrorSimilarQuestions(
  id: number,
  userId: string | number,
  similar: string,
): Promise<QuestionError | null> {
  const db = readDatabase(userId);
  const idx = db.questionErrors.findIndex(
    (e) => e.id === id && e.userId === userId,
  );
  if (idx === -1) return null;
  db.questionErrors[idx].aiSimilarQuestions = similar;
  db.questionErrors[idx].aiSimilarQuestionsAt = now();
  await writeDatabase(db, userId);
  return db.questionErrors[idx];
}

export async function markQuestionErrorFlashcardGenerated(
  id: number,
  userId: string | number,
): Promise<QuestionError | null> {
  const db = readDatabase(userId);
  const idx = db.questionErrors.findIndex(
    (e) => e.id === id && e.userId === userId,
  );
  if (idx === -1) return null;
  db.questionErrors[idx].aiFlashcardGenerated = true;
  await writeDatabase(db, userId);
  return db.questionErrors[idx];
}

export async function deleteQuestionError(
  id: number,
  userId: string | number,
): Promise<void> {
  const db = readDatabase(userId);
  db.questionErrors = db.questionErrors.filter(
    (e) => !(e.id === id && e.userId === userId),
  );
  await writeDatabase(db, userId);
}

// ============ ESSAYS ============

export async function saveEssay(
  userId: string | number,
  data: Omit<Essay, "id" | "createdAt" | "updatedAt">,
): Promise<Essay> {
  const db = readDatabase(userId);
  db.counters.essays++;
  const record: Essay = {
    ...data,
    id: db.counters.essays,
    createdAt: now(),
    updatedAt: now(),
  };
  db.essays.push(record);
  await writeDatabase(db, userId);
  return record;
}

export async function getEssaysByUser(
  userId: string | number,
  disciplineId?: number,
): Promise<Essay[]> {
  const db = readDatabase(userId);
  let items = db.essays.filter((e) => e.userId === userId);
  if (disciplineId)
    items = items.filter((e) => e.disciplineId === disciplineId);
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getEssayById(
  id: number,
  userId: string | number,
): Promise<Essay | null> {
  const db = readDatabase(userId);
  return db.essays.find((e) => e.id === id && e.userId === userId) || null;
}

export async function updateEssay(
  id: number,
  userId: string | number,
  data: Partial<Omit<Essay, "id" | "userId" | "createdAt">>,
): Promise<Essay | null> {
  const db = readDatabase(userId);
  const idx = db.essays.findIndex((e) => e.id === id && e.userId === userId);
  if (idx === -1) return null;
  db.essays[idx] = { ...db.essays[idx], ...data, updatedAt: now() };
  await writeDatabase(db, userId);
  return db.essays[idx];
}

export async function deleteEssay(
  id: number,
  userId: string | number,
): Promise<void> {
  const db = readDatabase(userId);
  db.essays = db.essays.filter((e) => !(e.id === id && e.userId === userId));
  await writeDatabase(db, userId);
}

// ============ V10 NEW FEATURE STORAGE FUNCTIONS ============

/** F04 - Save recall rating when user completes a revision */
export async function saveRevisionRecallRating(
  id: number,
  userId: string | number,
  rating: 1 | 2 | 3 | 4 | 5,
  freeRecallText?: string,
): Promise<void> {
  const db = readDatabase(userId);
  const idx = db.revisions.findIndex((r) => r.id === id && r.userId === userId);
  if (idx >= 0) {
    db.revisions[idx].recallRating = rating;
    if (freeRecallText !== undefined)
      db.revisions[idx].freeRecallText = freeRecallText;
    db.revisions[idx].updatedAt = now();
    await writeDatabase(db, userId);
  }
}

/** F03 - Check if a topic was revised too recently (less than minDays ago) */
export async function getLastRevisionDate(
  topicId: number,
  userId: string | number,
): Promise<string | null> {
  const db = readDatabase(userId);
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
  userId: string | number,
  mood: 1 | 2 | 3 | 4 | 5,
): Promise<void> {
  const db = readDatabase(userId);
  const user = db.users.find((u) => u.openId === userId);
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
  await writeDatabase(db, userId);
}

/** F10 - Log study session for peak-hour analysis */
export async function logStudySession(
  userId: string | number,
  hourStart: number,
  durationMin: number,
  accuracy: number,
  disciplineId?: number,
): Promise<void> {
  const db = readDatabase(userId);
  const user = db.users.find((u) => u.openId === userId);
  if (!user) return;
  if (!user.settings.studySessionLog) user.settings.studySessionLog = [];
  user.settings.studySessionLog.push({
    date: now().split("T")[0],
    hourStart,
    durationMin,
    accuracy,
    disciplineId,
  });
  if (user.settings.studySessionLog.length > 500)
    user.settings.studySessionLog = user.settings.studySessionLog.slice(-500);
  await writeDatabase(db, userId);
}

/** F10 - Get peak hour analysis */
export async function getPeakHoursAnalysis(
  userId: string | number,
): Promise<Array<{ hour: number; avgAccuracy: number; sessions: number }>> {
  const db = readDatabase(userId);
  const user = db.users.find((u) => u.openId === userId);
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
  userId: string | number,
  endHour: number,
  alertIssued: boolean,
): Promise<void> {
  const db = readDatabase(userId);
  const user = db.users.find((u) => u.openId === userId);
  if (!user) return;
  if (!user.settings.sleepLog) user.settings.sleepLog = [];
  const today = now().split("T")[0];
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
  await writeDatabase(db, userId);
}

/** F17 - Get discipline rebalance report: time invested vs accuracy vs edital weight */
export async function getDisciplineRebalanceReport(
  userId: string | number,
): Promise<
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
  const db = readDatabase(userId);
  const disciplines = db.disciplines.filter((d) => d.userId === userId);
  const topics = db.topics.filter((t) => t.userId === userId);
  const revisions = db.revisions.filter(
    (r) => r.userId === userId && r.completed,
  );
  const user = db.users.find((u) => u.openId === userId);
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
  userId: string | number,
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
  const db = readDatabase(userId);
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
  userId: string | number,
  topics: TecTopicSnapshot[],
): Promise<TecSnapshot> {
  const db = readDatabase(userId);
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
      .sort((a, b) => a.importedAt.localeCompare(b.importedAt))
      .slice(0, userSnaps.length - 60);
    const oldestIds = new Set(oldest.map((s) => s.id));
    db.tecSnapshots = db.tecSnapshots.filter((s) => !oldestIds.has(s.id));
  }
  await writeDatabase(db, userId);
  return snapshot;
}

/** Retorna os últimos N snapshots do usuário, mais recentes primeiro */
export async function getTecSnapshots(
  userId: string | number,
  limit = 10,
): Promise<TecSnapshot[]> {
  const db = readDatabase(userId);
  if (!db.tecSnapshots) return [];
  return db.tecSnapshots
    .filter((s) => s.userId === userId)
    .sort((a, b) => b.importedAt.localeCompare(a.importedAt))
    .slice(0, limit);
}

/** Retorna o snapshot mais recente antes do atual (para comparação de delta) */
export async function getPreviousTecSnapshot(
  userId: string | number,
): Promise<TecSnapshot | null> {
  const snaps = await getTecSnapshots(userId, 2);
  return snaps[1] || null;
}

/**
 * Detecta regressões: tópicos que pioraram ≥ threshold pp entre o penúltimo e o último snapshot.
 * Retorna lista ordenada por queda de acerto (maior queda primeiro).
 */
export async function getTecRegressions(
  userId: string | number,
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
      (t) =>
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
  userId: string | number,
  accuracyThreshold = 65,
): Promise<TecTopicSnapshot[]> {
  const snaps = await getTecSnapshots(userId, 1);
  if (!snaps[0]) return [];
  return snaps[0].topics
    .filter((t) => t.accuracy < accuracyThreshold && t.questionsResolved >= 5)
    .sort((a, b) => a.accuracy - b.accuracy);
}

// ============ CADERNOS TEC (tempo real via userscript) ============

export async function saveCadernoTec(
  userId: string | number,
  caderno: CadernoTec,
): Promise<void> {
  const db = readDatabase(userId);
  if (!db.cadernosTec) db.cadernosTec = {};
  if (!db.cadernosTec[userId]) db.cadernosTec[userId] = [];
  const existing = db.cadernosTec[userId].findIndex(
    (c: CadernoTec) => c.cadernoId === caderno.cadernoId,
  );
  if (existing >= 0) db.cadernosTec[userId][existing] = caderno;
  else db.cadernosTec[userId].push(caderno);
  await writeDatabase(db, userId);
}

export async function getCadernosTec(
  userId: string | number,
): Promise<CadernoTec[]> {
  const db = readDatabase(userId);
  return (db.cadernosTec?.[userId] ?? []).sort(
    (a, b) => new Date(b.lastSync).getTime() - new Date(a.lastSync).getTime(),
  );
}

export async function deleteCadernoTec(
  userId: string | number,
  cadernoId: string,
): Promise<void> {
  const db = readDatabase(userId);
  if (!db.cadernosTec?.[userId]) return;
  db.cadernosTec[userId] = db.cadernosTec[userId].filter(
    (c: CadernoTec) => c.cadernoId !== cadernoId,
  );
  await writeDatabase(db, userId);
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
export async function generatePushToken(
  userId: string | number,
): Promise<string> {
  const token = generateSecureToken();
  const db = readDatabase(userId);
  const idx = db.users.findIndex((u) => u.openId === userId);
  if (idx >= 0) {
    db.users[idx].settings = { ...db.users[idx].settings, pushToken: token };
    await writeDatabase(db, userId);
  }
  return token;
}

/** Busca usuário pelo push token. Retorna undefined se token inválido ou não encontrado. */
export async function getUserByPushToken(
  token: string,
): Promise<User | undefined> {
  if (!token || token.length < 8) return undefined;

  // In multi-file mode, we must scan all files
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.startsWith("database_") && f.endsWith(".json"))
    .sort((a, b) => {
      // Prioritize files with UUID-like names over "default", "anonymous", "local-user"
      const aIsUuid = a.length > 30;
      const bIsUuid = b.length > 30;
      if (aIsUuid && !bIsUuid) return -1;
      if (!aIsUuid && bIsUuid) return 1;
      return 0;
    });

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(DATA_DIR, file), "utf-8");
      const db = JSON.parse(content);
      const uidFromFilename = file
        .replace("database_", "")
        .replace(".json", "");

      // Only consider users whose openId matches the filename (isolation check)
      const user = db.users.find(
        (u: any) =>
          u.settings?.pushToken === token &&
          String(u.openId || u.id) === uidFromFilename,
      );

      if (user) return user;
    } catch (e) {
      // Skip broken files
    }
  }
  return undefined;
}

/** Revoga o push token de um usuário (limpa a configuração) */
export async function revokePushToken(userId: string | number): Promise<void> {
  const db = readDatabase(userId);
  const idx = db.users.findIndex((u) => u.openId === userId);
  if (idx >= 0) {
    const { pushToken: _, ...rest } = db.users[idx].settings;
    db.users[idx].settings = rest as any;
    await writeDatabase(db, userId);
  }
}
// ============ MENTOR OBSERVATIONS ============

export async function getMentorObservations(
  userId: string | number,
): Promise<string[]> {
  const db = readDatabase(userId);
  const user = db.users.find((u) => u.openId === userId);
  return user?.settings?.mentorObservations || [];
}

export async function addMentorObservation(
  userId: string | number,
  observation: string,
): Promise<void> {
  const db = readDatabase(userId);
  const index = db.users.findIndex((u) => u.openId === userId);
  if (index >= 0) {
    const user = db.users[index];
    if (!user.settings) user.settings = {} as any;
    if (!user.settings.mentorObservations)
      user.settings.mentorObservations = [];

    // Keep only last 20 observations to prevent prompt bloating
    user.settings.mentorObservations.push(
      `${new Date().toISOString().split("T")[0]}: ${observation}`,
    );
    if (user.settings.mentorObservations.length > 20) {
      user.settings.mentorObservations.shift();
    }

    await writeDatabase(db, userId);
  }
}

// ============ FLASHCARD ARCHIVING ============

export async function archiveFlashcard(
  id: number,
  userId: string | number,
  archived: boolean = true,
): Promise<void> {
  const db = readDatabase(userId);
  const index = db.flashcards.findIndex(
    (f) => f.id === id && f.userId === userId,
  );
  if (index >= 0) {
    db.flashcards[index].archived = archived;
    db.flashcards[index].updatedAt = new Date().toISOString();
    await writeDatabase(db, userId);
  }
}

// ============ CONCEPT CONFUSIONS ============

export async function getConceptConfusions(userId: string | number) {
  const db = readDatabase(userId);
  const user = db.users.find((u) => u.openId === userId);
  return user?.settings?.conceptConfusions || [];
}

export async function addConceptConfusion(
  userId: string | number,
  data: { conceptA: string; conceptB: string; explanation: string },
) {
  const db = readDatabase(userId);
  const index = db.users.findIndex((u) => u.openId === userId);
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

    await writeDatabase(db, userId);
  }
}

export async function deleteQuestionsByContest(
  contest: string,
  userId: string | number,
): Promise<void> {
  const db = readDatabase(userId);
  db.questionErrors = db.questionErrors.filter(
    (q) => q.userId !== userId || q.contest !== contest,
  );
  await writeDatabase(db, userId);
}

export async function checkExamIntegrated(
  contest: string,
  userId: string | number,
): Promise<boolean> {
  const db = readDatabase(userId);
  return db.questionErrors.some(
    (q) =>
      q.userId === userId && q.contest?.toLowerCase() === contest.toLowerCase(),
  );
}
