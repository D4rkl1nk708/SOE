import { normalizeString } from "../../shared/merge";
import type {
  Database,
  Discipline,
  QuestionAttempt,
  Revision,
  Topic,
  User,
} from "../../shared/types";

/** Erro lançado quando o banco existe mas não é um banco válido. */
export class DatabaseCorruptError extends Error {
  constructor(
    message: string,
    public readonly preservedAt: string,
  ) {
    super(message);
    this.name = "DatabaseCorruptError";
  }
}

/** Corrige strings que foram gravadas como latin1 mas deveriam ser utf8. */
export function fixEncoding(str: string): string {
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

/** Valida o mínimo necessário antes de migrar: o resto é normalizado abaixo. */
export function isValidDatabaseShape(value: unknown): value is Database {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const db = value as Record<string, unknown>;
  return (
    Array.isArray(db.users) &&
    Array.isArray(db.disciplines) &&
    Array.isArray(db.topics) &&
    Array.isArray(db.revisions)
  );
}

export function getEmptyCounters() {
  return {
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
    questionAttempts: 0,
  };
}

/** Nome da migração aplicada — os motores usam isso para gerar backup antes de gravar. */
export type StorageMigration = "questionAttempts" | "editalPerExam";

/**
 * Item 2 (v6.9.4): `settings.questionAttempts` vira a coleção `questionAttempts`.
 * A tentativa ganha `userId` (a coleção é global) e o array antigo é esvaziado
 * para não existir duas fontes para o mesmo dado.
 */
function migrateQuestionAttemptsCollection(db: Database): boolean {
  if (
    !Array.isArray((db as unknown as Record<string, unknown>).questionAttempts)
  ) {
    (db as unknown as Record<string, unknown>).questionAttempts = [];
  }
  const collection = db.questionAttempts as QuestionAttempt[];
  const seen = new Set(collection.map((item) => String(item?.id)));

  let moved = false;
  for (const user of db.users) {
    const legacy = Array.isArray(user.settings?.questionAttempts)
      ? user.settings.questionAttempts
      : [];
    if (legacy.length === 0) {
      // Remove a chave vazia: settings não é mais o dono desse histórico.
      if (user.settings && "questionAttempts" in user.settings) {
        delete (user.settings as unknown as Record<string, unknown>)
          .questionAttempts;
      }
      continue;
    }
    for (const attempt of legacy) {
      if (!attempt || typeof attempt !== "object") continue;
      const id =
        attempt.id ||
        `att-legacy-${user.id}-${attempt.createdAt || Date.now()}-${collection.length}`;
      if (seen.has(String(id))) continue;
      seen.add(String(id));
      collection.push({ ...attempt, id: String(id), userId: user.id });
      moved = true;
    }
    delete (user.settings as unknown as Record<string, unknown>)
      .questionAttempts;
    moved = true;
  }
  if (moved) {
    collection.sort((a, b) =>
      String(a.createdAt || "").localeCompare(String(b.createdAt || "")),
    );
    db.counters.questionAttempts = collection.length;
  }
  return moved;
}

/**
 * Sem concurso ativo definido, escolhe o concurso cujo nome aparece no texto das
 * linhas do edital (ex.: linhas citando "CGU" vão para "CGU - Dev"), em vez de
 * despejar tudo no primeiro da lista. Devolve undefined se nada casar.
 */
function pickExamByRowsContent(exams: any[], rows: any[]): any | undefined {
  const fold = (text: string) =>
    String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const haystack = fold(
    rows.map((row) => `${row?.discipline || ""} ${row?.topic || ""}`).join(" "),
  );
  let best: any | undefined;
  let bestScore = 0;
  for (const exam of exams) {
    const tokens = fold(exam?.name)
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3);
    let score = 0;
    for (const token of tokens) {
      if (new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`).test(haystack))
        score += 1;
    }
    if (score > bestScore) {
      best = exam;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Item 5 (v6.9.4): o edital deixa de ser global (`settings.editalRows`) e passa
 * a pertencer a um concurso (`exams[i].editalRows`), com `activeExamId`.
 * Migração única: o edital atual vai para o concurso ativo (ou o primeiro).
 */
function migrateEditalPerExam(db: Database): boolean {
  let migrated = false;
  for (const user of db.users) {
    const settings = (user.settings || {}) as Record<string, any>;
    const exams = Array.isArray(settings.exams) ? settings.exams : [];
    const legacyRows = Array.isArray(settings.editalRows)
      ? settings.editalRows
      : [];
    if (legacyRows.length === 0 || exams.length === 0) continue;
    const alreadyHasRows = exams.some(
      (exam: any) =>
        Array.isArray(exam.editalRows) && exam.editalRows.length > 0,
    );
    if (alreadyHasRows) {
      // Já existe edital por concurso: o array global é legado duplicado.
      settings.editalRows = [];
      migrated = true;
      continue;
    }
    const target =
      exams.find((exam: any) => exam.id === settings.activeExamId) ||
      pickExamByRowsContent(exams, legacyRows) ||
      exams[0];
    target.editalRows = legacyRows;
    settings.activeExamId = target.id;
    settings.editalRows = [];
    migrated = true;
  }
  return migrated;
}

/**
 * Normaliza um banco vindo do disco (JSON antigo ou SQLite) aplicando as
 * migrações de campo, o reparo de encoding e a deduplicação de disciplinas.
 *
 * `changed` indica que o resultado difere do que estava gravado e precisa ser
 * persistido de volta. `migrations` lista as migrações de dados aplicadas nesta
 * leitura (para o motor gerar backup antes de gravar).
 */
export function normalizeDatabase(raw: unknown): {
  db: Database;
  changed: boolean;
  migrations: StorageMigration[];
} {
  if (!isValidDatabaseShape(raw)) {
    throw new Error(
      "Estrutura inválida: users/disciplines/topics/revisions ausentes ou não são arrays.",
    );
  }

  const db = raw;
  const wasEncodingFixed = Boolean(
    (db as { _encodingFixed?: boolean })._encodingFixed,
  );

  // `counters` ausente não pode derrubar a carga (era a causa do banco
  // "vazio" que depois sobrescrevia o arquivo bom).
  if (!db.counters || typeof db.counters !== "object") {
    db.counters = getEmptyCounters();
  }

  // Migration for new fields if they don't exist
  if (!db.mockExams) db.mockExams = [];
  if (!db.notes) db.notes = [];
  if (!db.flashcards) db.flashcards = [];
  if (!db.questionErrors) db.questionErrors = [];
  if (!db.essays) db.essays = [];
  if (!db.tecSnapshots) db.tecSnapshots = [];
  if (!db.cadernosTec) db.cadernosTec = {};
  if (!db.questionAttempts) db.questionAttempts = [];
  if (!db.counters.mockExams) db.counters.mockExams = 0;
  if (!db.counters.notes) db.counters.notes = 0;
  if (!db.counters.flashcards) db.counters.flashcards = 0;
  if (!db.counters.questionErrors) db.counters.questionErrors = 0;
  if (!db.counters.essays) db.counters.essays = 0;
  if (!db.counters.tecSnapshots) db.counters.tecSnapshots = 0;
  if (!db.counters.questionAttempts)
    db.counters.questionAttempts = db.questionAttempts.length || 0;

  type RawRecord = Record<string, unknown>;
  db.disciplines = (db.disciplines as unknown as RawRecord[])
    .map((d) => ({
      ...d,
      name: fixEncoding(d.name as string),
      studyTimeSeconds: (d.studyTimeSeconds as number) || 0,
      weight: (d.weight as number) || 1,
      order: (d.order as number) || 0,
    }))
    .sort((a, b) => (b.weight as number) - (a.weight as number))
    .map((d, idx) => ({
      ...d,
      order: d.order || idx + 1,
    })) as unknown as Discipline[];

  db.topics = (db.topics as unknown as RawRecord[]).map((t) => ({
    ...t,
    name: fixEncoding(t.name as string),
    notes: t.notes ? fixEncoding(t.notes as string) : t.notes,
    studyTimeSeconds: (t.studyTimeSeconds as number) || 0,
    order: typeof t.order === "number" ? t.order : Number(t.id),
  })) as unknown as Topic[];

  db.users = (db.users as unknown as RawRecord[]).map((u) => {
    const rawSettings = (u.settings as RawRecord) || {
      theme: "light",
      studyStreak: { current: 0, best: 0, lastStudyDate: null },
    };
    const examsFromLegacy =
      rawSettings.examDate && rawSettings.examName
        ? [
            {
              id: "legacy-exam",
              name: rawSettings.examName as string,
              date: rawSettings.examDate as string,
            },
          ]
        : [];
    return {
      ...u,
      settings: {
        ...rawSettings,
        exams: Array.isArray(rawSettings.exams)
          ? rawSettings.exams
          : examsFromLegacy,
        editalCycle: Array.isArray(rawSettings.editalCycle)
          ? rawSettings.editalCycle
          : [],
        editalRows: Array.isArray(rawSettings.editalRows)
          ? rawSettings.editalRows
          : [],
      },
    };
  }) as unknown as User[];

  db.revisions = (db.revisions as unknown as RawRecord[]).map((r) => ({
    ...r,
    ignored: (r.ignored as boolean) || false,
  })) as unknown as Revision[];

  // Deduplicate disciplines by normalized name, but only within the same
  // user. Nomes iguais em usuários diferentes são legítimos.
  const seenDiscNorm = new Map<string, Discipline>();
  const dupDiscMap = new Map<number, number>();
  const uniqueDisciplines: Discipline[] = [];
  for (const d of db.disciplines) {
    const norm = normalizeString(d.name);
    if (!norm) {
      uniqueDisciplines.push(d);
      continue;
    }
    const key = `${d.userId}::${norm}`;
    const canonical = seenDiscNorm.get(key);
    if (!canonical) {
      seenDiscNorm.set(key, d);
      uniqueDisciplines.push(d);
    } else {
      dupDiscMap.set(d.id, canonical.id);
      canonical.studyTimeSeconds = Math.max(
        canonical.studyTimeSeconds || 0,
        d.studyTimeSeconds || 0,
      );
    }
  }

  const dedupeChanged = dupDiscMap.size > 0;
  if (dedupeChanged) {
    db.disciplines = uniqueDisciplines;
    const remapDisciplineId = (record: any) => {
      if (record && dupDiscMap.has(record.disciplineId)) {
        record.disciplineId = dupDiscMap.get(record.disciplineId)!;
      }
    };
    for (const t of db.topics) remapDisciplineId(t);
    for (const qe of db.questionErrors || []) remapDisciplineId(qe);
    for (const n of db.notes || []) remapDisciplineId(n);
    for (const f of db.flashcards || []) remapDisciplineId(f);
    for (const e of db.essays || []) remapDisciplineId(e);
    for (const a of db.questionAttempts || []) remapDisciplineId(a);
  }

  const migrations: StorageMigration[] = [];
  if (migrateQuestionAttemptsCollection(db))
    migrations.push("questionAttempts");
  if (migrateEditalPerExam(db)) migrations.push("editalPerExam");

  const changed = dedupeChanged || !wasEncodingFixed || migrations.length > 0;
  db._encodingFixed = true;

  return { db, changed, migrations };
}
