import { normalizeString } from "../../shared/merge";
import type {
  Database,
  Discipline,
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
  };
}

/**
 * Normaliza um banco vindo do disco (JSON antigo ou SQLite) aplicando as
 * migrações de campo, o reparo de encoding e a deduplicação de disciplinas.
 *
 * `changed` indica que o resultado difere do que estava gravado e precisa ser
 * persistido de volta.
 */
export function normalizeDatabase(raw: unknown): {
  db: Database;
  changed: boolean;
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
  if (!db.counters.mockExams) db.counters.mockExams = 0;
  if (!db.counters.notes) db.counters.notes = 0;
  if (!db.counters.flashcards) db.counters.flashcards = 0;
  if (!db.counters.questionErrors) db.counters.questionErrors = 0;
  if (!db.counters.essays) db.counters.essays = 0;
  if (!db.counters.tecSnapshots) db.counters.tecSnapshots = 0;

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
  }

  const changed = dedupeChanged || !wasEncodingFixed;
  db._encodingFixed = true;

  return { db, changed };
}
