import * as fs from "fs";
import * as path from "path";
import type { Database } from "../../shared/types";
import {
  DatabaseCorruptError,
  getEmptyCounters,
  normalizeDatabase,
} from "./normalize";

/**
 * Motor SQLite (node:sqlite) para o SOE.
 *
 * Estratégia: "document store" em duas tabelas (records/meta) com escrita
 * INCREMENTAL — só as linhas que mudaram são gravadas, dentro de uma transação.
 *
 * Antes: cada mutação fazia JSON.stringify do banco inteiro e reescrevia um
 * arquivo único. Agora: transação + WAL + diff por registro.
 */

const COLLECTIONS = [
  "users",
  "disciplines",
  "topics",
  "revisions",
  "mockExams",
  "notes",
  "flashcards",
  "questionErrors",
  "essays",
  "tecSnapshots",
] as const;

type Collection = (typeof COLLECTIONS)[number];

interface SqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

interface SqliteModule {
  DatabaseSync: new (filename: string) => SqliteDatabase;
}

let sqliteModule: SqliteModule | null | undefined;

/** `node:sqlite` existe? (Node >= 22.5 com --experimental-sqlite, Electron 22.21+). */
export function isSqliteAvailable(): boolean {
  return getSqliteModule() !== null;
}

function getSqliteModule(): SqliteModule | null {
  if (sqliteModule !== undefined) return sqliteModule;

  const getBuiltin = (
    process as unknown as { getBuiltinModule?: (id: string) => unknown }
  ).getBuiltinModule;
  if (typeof getBuiltin === "function") {
    try {
      const mod = getBuiltin("node:sqlite") as SqliteModule | undefined;
      if (mod?.DatabaseSync) {
        sqliteModule = mod;
        return mod;
      }
    } catch {
      /* cai para o require abaixo */
    }
  }

  try {
    const { createRequire } = require("node:module") as {
      createRequire: (filename: string) => (id: string) => unknown;
    };
    const req = createRequire(import.meta.url);
    const mod = req("node:sqlite") as SqliteModule;
    if (mod?.DatabaseSync) {
      sqliteModule = mod;
      return mod;
    }
  } catch {
    /* indisponível */
  }

  sqliteModule = null;
  return null;
}

let DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
let DB_FILE = path.join(DATA_DIR, "soe.sqlite");

let _handle: SqliteDatabase | null = null;
let _dbCache: Database | null = null;
let _persisted = new Map<Collection, Map<string, string>>();
let _persistedMeta = new Map<string, string>();
let _lastWriteError: Error | null = null;
let _writeLock: Promise<any> = Promise.resolve();

export function getLastWriteError(): Error | null {
  return _lastWriteError;
}

export function getDataDir(): string {
  return DATA_DIR;
}

export function getDbFile(): string {
  return DB_FILE;
}

export function setDataDir(newDir: string) {
  closeHandle();
  DATA_DIR = newDir;
  DB_FILE = path.join(DATA_DIR, "soe.sqlite");
  resetCache();
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function resetCache() {
  _dbCache = null;
  _persisted = new Map();
  _persistedMeta = new Map();
}

/** Fecha o handle (libera o arquivo). Usado em testes e no shutdown. */
export function closeDatabase() {
  closeHandle();
  resetCache();
}

function closeHandle() {
  if (_handle) {
    try {
      _handle.close();
    } catch {
      /* já fechado */
    }
    _handle = null;
  }
}

export function acquireWriteLock(fn: () => any) {
  _writeLock = _writeLock.then(async () => {
    try {
      await fn();
    } catch (err) {
      console.error("[sqliteEngine] Lock execution error:", err);
    }
  });
}

export async function runInTransaction<T>(
  fn: (db: Database) => T | Promise<T>,
): Promise<T> {
  const run = _writeLock.then(async () => {
    const db = readDatabase();
    return await fn(db);
  });

  _writeLock = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

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
    counters: getEmptyCounters(),
  };
}

function preserveCorruptCopy(): string {
  const corruptFile = `${DB_FILE}.corrupt-${Date.now()}`;
  try {
    fs.copyFileSync(DB_FILE, corruptFile);
  } catch {
    /* melhor esforço */
  }
  return corruptFile;
}

function ensureOpen(): SqliteDatabase {
  if (_handle) return _handle;

  const mod = getSqliteModule();
  if (!mod) {
    throw new Error(
      "node:sqlite indisponível. Rode com --experimental-sqlite ou use SOE_STORAGE=json.",
    );
  }

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  let handle: SqliteDatabase | null = null;
  try {
    handle = new mod.DatabaseSync(DB_FILE);
    handle.exec("PRAGMA journal_mode = WAL;");
    handle.exec("PRAGMA synchronous = NORMAL;");
    handle.exec("PRAGMA busy_timeout = 5000;");
    handle.exec(
      `CREATE TABLE IF NOT EXISTS records (
         collection TEXT NOT NULL,
         id TEXT NOT NULL,
         data TEXT NOT NULL,
         PRIMARY KEY (collection, id)
       );`,
    );
    handle.exec(
      `CREATE TABLE IF NOT EXISTS meta (
         key TEXT PRIMARY KEY,
         value TEXT NOT NULL
       );`,
    );
  } catch (error) {
    console.error("[sqliteEngine] Falha ao abrir o banco:", error);
    if (handle) {
      try {
        handle.close();
      } catch {
        /* ignore */
      }
    }
    const corruptFile = fs.existsSync(DB_FILE)
      ? preserveCorruptCopy()
      : corruptFilePlaceholder();
    throw new DatabaseCorruptError(
      `O banco SQLite (${DB_FILE}) não pôde ser aberto e foi preservado em ${corruptFile}. ` +
        `Restaure um backup ou remova o arquivo para começar do zero.`,
      corruptFile,
    );
  }

  _handle = handle;
  migrateFromJsonIfNeeded(handle);
  return handle;
}

function corruptFilePlaceholder(): string {
  return "(arquivo não existia)";
}

/** Primeira execução: importa o database.json legado uma única vez. */
function migrateFromJsonIfNeeded(handle: SqliteDatabase) {
  const jsonPath = path.join(DATA_DIR, "database.json");
  if (!fs.existsSync(jsonPath)) return;

  const count = handle
    .prepare("SELECT COUNT(*) as total FROM records")
    .get() as { total: number };
  if (Number(count?.total ?? 0) > 0) return;

  let parsed: unknown;
  try {
    // BOM no começo do arquivo quebra o JSON.parse (arquivos gerados no Windows).
    const raw = fs.readFileSync(jsonPath, "utf-8").replace(/^\uFEFF/, "");
    parsed = JSON.parse(raw);
  } catch (error) {
    const corruptFile = `${jsonPath}.corrupt-${Date.now()}`;
    try {
      fs.copyFileSync(jsonPath, corruptFile);
    } catch {
      /* melhor esforço */
    }
    throw new DatabaseCorruptError(
      `O database.json (${jsonPath}) está inválido e foi preservado em ${corruptFile}. ` +
        `Restaure um backup ou remova o arquivo para começar do zero.`,
      corruptFile,
    );
  }

  const { db } = normalizeDatabase(parsed);
  // force = grava tudo
  _persisted = new Map();
  _persistedMeta = new Map();
  persist(handle, db);

  const migratedPath = `${jsonPath}.migrated-${Date.now()}`;
  try {
    fs.renameSync(jsonPath, migratedPath);
  } catch (error) {
    console.warn(
      "[sqliteEngine] Não foi possível renomear o JSON migrado:",
      error,
    );
  }
  console.log(
    `[sqliteEngine] Banco migrado de database.json para soe.sqlite (backup: ${migratedPath}).`,
  );
}

function rowsOf(db: Database): Map<Collection, Map<string, string>> {
  const target = new Map<Collection, Map<string, string>>();
  for (const collection of COLLECTIONS) {
    const records = ((db as unknown as Record<string, unknown>)[collection] ??
      []) as Array<{ id: number | string }>;
    const map = new Map<string, string>();
    for (const record of records) {
      if (record == null) continue;
      map.set(String(record.id), JSON.stringify(record));
    }
    target.set(collection, map);
  }
  return target;
}

function metaOf(db: Database): Map<string, string> {
  return new Map<string, string>([
    ["counters", JSON.stringify(db.counters ?? getEmptyCounters())],
    ["cadernosTec", JSON.stringify(db.cadernosTec ?? {})],
    [
      "encodingFixed",
      String(
        (db as unknown as { _encodingFixed?: boolean })._encodingFixed ?? true,
      ),
    ],
  ]);
}

/** Grava somente o que mudou, em uma transação. */
function persist(handle: SqliteDatabase, db: Database): void {
  const target = rowsOf(db);
  const meta = metaOf(db);

  const upsertRecord = handle.prepare(
    `INSERT INTO records (collection, id, data) VALUES (?, ?, ?)
     ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data`,
  );
  const deleteRecord = handle.prepare(
    "DELETE FROM records WHERE collection = ? AND id = ?",
  );
  const upsertMeta = handle.prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );

  handle.exec("BEGIN IMMEDIATE");
  try {
    for (const collection of COLLECTIONS) {
      const previous = _persisted.get(collection) ?? new Map<string, string>();
      const next = target.get(collection)!;

      for (const [id, json] of next) {
        if (previous.get(id) !== json) upsertRecord.run(collection, id, json);
      }
      for (const id of previous.keys()) {
        if (!next.has(id)) deleteRecord.run(collection, id);
      }
    }

    for (const [key, value] of meta) {
      if (_persistedMeta.get(key) !== value) upsertMeta.run(key, value);
    }

    handle.exec("COMMIT");
  } catch (error) {
    try {
      handle.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw error;
  }

  _persisted = target;
  _persistedMeta = meta;
}

export function readDatabase(): Database {
  if (_dbCache !== null) return _dbCache;

  const handle = ensureOpen();

  const db = getEmptyDatabase();
  for (const collection of COLLECTIONS) {
    const rows = handle
      .prepare("SELECT data FROM records WHERE collection = ?")
      .all(collection) as Array<{ data: string }>;
    (db as unknown as Record<string, unknown>)[collection] = rows.map((row) =>
      JSON.parse(row.data),
    );
  }

  const metaRows = handle
    .prepare("SELECT key, value FROM meta")
    .all() as Array<{
    key: string;
    value: string;
  }>;
  for (const { key, value } of metaRows) {
    try {
      if (key === "counters") db.counters = JSON.parse(value);
      else if (key === "cadernosTec") db.cadernosTec = JSON.parse(value);
      else if (key === "encodingFixed") {
        (db as unknown as { _encodingFixed?: boolean })._encodingFixed =
          value === "true";
      }
    } catch (error) {
      console.error(`[sqliteEngine] meta inválida (${key}):`, error);
    }
  }

  const normalized = normalizeDatabase(db).db;

  // Reconstrói o snapshot para que a próxima escrita saiba o que já está no disco.
  _persisted = rowsOf(normalized);
  _persistedMeta = metaOf(normalized);
  _dbCache = normalized;
  return normalized;
}

export function writeDatabase(db: Database): void {
  try {
    const handle = ensureOpen();
    persist(handle, db);
  } catch (error) {
    _dbCache = null;
    _lastWriteError = error instanceof Error ? error : new Error(String(error));
    console.error("[sqliteEngine] Error writing database:", error);
    throw _lastWriteError;
  }

  _dbCache = db;
  _lastWriteError = null;
}

export function now(): string {
  return new Date().toISOString();
}
