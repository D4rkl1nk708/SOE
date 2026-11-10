import type { Database } from "../../shared/types";
import * as jsonEngine from "./engine";
import * as sqliteEngine from "./sqliteEngine";

/**
 * Seletor de motor de persistência.
 *
 * - `SOE_STORAGE=json` força o arquivo JSON único (comportamento antigo).
 * - `SOE_STORAGE=sqlite` exige SQLite (falha se indisponível).
 * - Padrão: SQLite quando `node:sqlite` existe, senão JSON.
 *
 * O SQLite entra automaticamente em builds Electron (Node 22.21) e em Node
 * com `--experimental-sqlite`; na primeira abertura ele importa o
 * `database.json` existente e guarda o original como `.migrated-<ts>`.
 */
const requested = (process.env.SOE_STORAGE || "").toLowerCase();
const sqliteAvailable = sqliteEngine.isSqliteAvailable();

let useSqlite = false;
if (requested === "sqlite") {
  if (!sqliteAvailable) {
    throw new Error(
      "SOE_STORAGE=sqlite, mas node:sqlite não está disponível. " +
        "Rode com --experimental-sqlite (Node 22) ou use SOE_STORAGE=json.",
    );
  }
  useSqlite = true;
} else if (requested === "json") {
  useSqlite = false;
} else {
  useSqlite = sqliteAvailable;
  if (!sqliteAvailable) {
    console.warn(
      "[storage] node:sqlite indisponível — usando o motor JSON. " +
        "Rode com --experimental-sqlite para ativar o SQLite.",
    );
  }
}

/** Motor efetivamente em uso (para logs/diagnóstico). */
export const storageDriver: "sqlite" | "json" = useSqlite ? "sqlite" : "json";

const engine = useSqlite ? sqliteEngine : jsonEngine;

export { DatabaseCorruptError } from "./normalize";

export function readDatabase(): Database {
  return engine.readDatabase();
}

export function writeDatabase(db: Database): void {
  engine.writeDatabase(db);
}

export function runInTransaction<T>(
  fn: (db: Database) => T | Promise<T>,
): Promise<T> {
  return engine.runInTransaction(fn);
}

export function acquireWriteLock(fn: () => unknown) {
  return engine.acquireWriteLock(fn);
}

export function resetCache() {
  engine.resetCache();
}

export function setDataDir(dir: string) {
  engine.setDataDir(dir);
}

export function getDataDir(): string {
  return engine.getDataDir();
}

export function getDbFile(): string {
  return engine.getDbFile();
}

export function getEmptyDatabase(): Database {
  return engine.getEmptyDatabase();
}

export function getLastWriteError(): Error | null {
  return engine.getLastWriteError();
}

export function now(): string {
  return engine.now();
}

/** Libera o handle do banco (no motor JSON é no-op). */
export function closeDatabase() {
  if (useSqlite) sqliteEngine.closeDatabase();
}

export { isSqliteAvailable } from "./sqliteEngine";
