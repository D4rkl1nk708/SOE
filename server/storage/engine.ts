import * as fs from "fs";
import * as path from "path";
import { normalizeString } from "../../shared/merge";
import type {
  Discipline,
  Topic,
  Revision,
  User,
  Database,
} from "../../shared/types";

// Data directory for JSON files
let DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
let DB_FILE = path.join(DATA_DIR, "database.json");

export function setDataDir(newDir: string) {
  DATA_DIR = newDir;
  DB_FILE = path.join(DATA_DIR, "database.json");
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getDataDir(): string {
  return DATA_DIR;
}

export function getDbFile(): string {
  return DB_FILE;
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {}
}

// ─── In-memory cache ──────────────────────────────────────────────────────────
let _dbCache: Database | null = null;
let _dbCacheVersion = 0; // bumped on every write

export function resetCache() {
  _dbCache = null;
  _dbCacheVersion = 0;
}

let _writeLock: Promise<any> = Promise.resolve();

export function acquireWriteLock(fn: () => any) {
  _writeLock = _writeLock.then(async () => {
    try {
      await fn();
    } catch (err) {
      console.error("[jsonStorage Engine] Lock execution error:", err);
    }
  });
}

export async function runInTransaction<T>(
  fn: (db: Database) => T | Promise<T>,
): Promise<T> {
  const result = await (_writeLock = _writeLock
    .then(async () => {
      try {
        const db = readDatabase();
        const res = await fn(db);
        return res;
      } catch (err) {
        console.error("[jsonStorage Engine] Transaction error:", err);
        throw err;
      }
    })
    .catch(() => {}));
  return result as T;
}

// Initialize empty database
export function getEmptyDatabase(): Database {
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

export function readDatabase(): Database {
  if (_dbCache !== null) return _dbCache;

  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, "utf-8");
      const db = JSON.parse(data);
      if (db.users) {
        console.log(
          `[Database] Banco carregado. Usuários encontrados: ${db.users.length}`,
        );
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

      // Persist encoding/dedupe fixes back to disk (one-time migration)
      if (!db._encodingFixed || dedupeChanged) {
        db._encodingFixed = true;
        try {
          const migTmp = DB_FILE + ".mig.tmp";
          fs.writeFileSync(migTmp, JSON.stringify(db, null, 2), "utf-8");
          fs.renameSync(migTmp, DB_FILE);
        } catch {}
      }
      _dbCache = db;
      return db;
    }
  } catch (error) {
    console.error("[jsonStorage Engine] Error reading database:", error);
  }
  const empty = getEmptyDatabase();
  _dbCache = empty;
  return empty;
}

let _autoBackupTimeout: any = null;
function triggerDebouncedBackup(db: Database) {
  if (_autoBackupTimeout) clearTimeout(_autoBackupTimeout);
  _autoBackupTimeout = setTimeout(() => {
    try {
      if (db.users && db.users.length > 0) {
        const primaryUser = db.users[0];
        if (
          primaryUser.settings?.autoBackupEnabled &&
          primaryUser.settings.autoBackupDir
        ) {
          const targetDir = primaryUser.settings.autoBackupDir;
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          const backupFile = path.join(targetDir, "soe_backup_sync.json");
          fs.copyFileSync(DB_FILE, backupFile);
        }
      }
    } catch (copyErr) {
      console.error("SOE Auto-Backup Error:", copyErr);
    }
  }, 3000);
}

// Write database to file (invalidates cache, queues through write lock)
export function writeDatabase(db: Database): void {
  _dbCache = db;
  _dbCacheVersion++;

  acquireWriteLock(() => {
    try {
      const tempFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(db), "utf-8");
      fs.renameSync(tempFile, DB_FILE);
      triggerDebouncedBackup(db);
    } catch (error) {
      _dbCache = null;
      console.error("[jsonStorage Engine] Error writing database:", error);
      throw error;
    }
  });
}

export function now(): string {
  return new Date().toISOString();
}
