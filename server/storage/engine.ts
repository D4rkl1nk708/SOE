import * as fs from "fs";
import * as path from "path";
import type { Database } from "../../shared/types";
import {
  DatabaseCorruptError,
  getEmptyCounters,
  normalizeDatabase,
} from "./normalize";

export { DatabaseCorruptError };

// Data directory for JSON files
let DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
let DB_FILE = path.join(DATA_DIR, "database.json");

export function setDataDir(newDir: string) {
  DATA_DIR = newDir;
  DB_FILE = path.join(DATA_DIR, "database.json");
  _dbCache = null;
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
let _lastWriteError: Error | null = null;

/** Último erro de escrita, para a UI poder avisar que o dado não foi salvo. */
export function getLastWriteError(): Error | null {
  return _lastWriteError;
}

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
  const run = _writeLock.then(async () => {
    const db = readDatabase();
    return await fn(db);
  });

  // A fila continua andando mesmo quando a transação falha, mas o erro é
  // propagado para o chamador (antes era engolido e a escrita se perdia em silêncio).
  _writeLock = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
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
    counters: getEmptyCounters(),
  };
}

export function readDatabase(): Database {
  if (_dbCache !== null) return _dbCache;

  // Arquivo inexistente = primeiro uso. Só neste caso começamos vazio.
  if (!fs.existsSync(DB_FILE)) {
    _dbCache = getEmptyDatabase();
    return _dbCache;
  }

  try {
    // BOM no começo do arquivo quebra o JSON.parse (arquivos gerados no Windows).
    const raw = fs.readFileSync(DB_FILE, "utf-8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);
    const { db, changed } = normalizeDatabase(parsed);

    // Persiste reparos de encoding/dedupe uma única vez.
    if (changed) {
      try {
        writeFileAtomic(db);
      } catch (migrationError) {
        console.error(
          "[jsonStorage Engine] Falha ao gravar migração:",
          migrationError,
        );
      }
    }

    _dbCache = db;
    return db;
  } catch (error) {
    // NUNCA devolver um banco vazio aqui: a próxima escrita persistiria o vazio
    // por cima do arquivo do usuário. Preservamos o arquivo e falhamos alto.
    const corruptFile = `${DB_FILE}.corrupt-${Date.now()}.json`;
    try {
      fs.copyFileSync(DB_FILE, corruptFile);
    } catch (copyError) {
      console.error(
        "[jsonStorage Engine] Não foi possível preservar a cópia do banco inválido:",
        copyError,
      );
    }
    console.error(
      `[jsonStorage Engine] Banco de dados inválido. Cópia preservada em ${corruptFile}`,
      error,
    );
    throw new DatabaseCorruptError(
      `O banco de dados (${DB_FILE}) não pôde ser lido e foi preservado em ${corruptFile}. ` +
        `Restaure um backup ou remova o arquivo para começar do zero.`,
      corruptFile,
    );
  }
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

  // Não segura o event loop aberto (testes e shutdown do Electron).
  if (typeof _autoBackupTimeout.unref === "function") {
    _autoBackupTimeout.unref();
  }
}

/** Escrita atômica: tmp único + fsync + rename. */
function writeFileAtomic(db: Database): void {
  const payload = JSON.stringify(db);
  const tempFile = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;

  try {
    const fd = fs.openSync(tempFile, "w");
    try {
      fs.writeFileSync(fd, payload, "utf-8");
      // Garante que os bytes chegaram ao disco antes do rename.
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tempFile, DB_FILE);
  } catch (error) {
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch {
      /* ignora falha ao limpar o temporário */
    }
    throw error;
  }
}

/**
 * Grava o banco de forma atômica e propaga o erro para o chamador. Antes a
 * escrita era enfileirada em um `Promise` cujo `catch` só logava: a UI
 * confirmava "salvo" e o dado se perdia em ENOSPC/EBUSY.
 */
export function writeDatabase(db: Database): void {
  try {
    writeFileAtomic(db);
  } catch (error) {
    _dbCache = null;
    _lastWriteError = error instanceof Error ? error : new Error(String(error));
    console.error("[jsonStorage Engine] Error writing database:", error);
    throw _lastWriteError;
  }

  _dbCache = db;
  _dbCacheVersion++;
  _lastWriteError = null;
  triggerDebouncedBackup(db);
}

export function now(): string {
  return new Date().toISOString();
}
