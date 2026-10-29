/**
 * Remove revisões duplicadas do banco.
 *
 * A chave única de uma revisão é (userId, topicId, scheduledDate,
 * revisionNumber, type) — a mesma que `createRevisions` usa para ser
 * idempotente. Registros criados antes dessa trava (ex.: o mentor gravava uma
 * revisão "emergencial" a cada análise) ficaram empilhados e apareciam
 * repetidos no dia.
 *
 * Mantém um único registro por chave, preferindo o que estiver concluído,
 * e salva um backup antes de escrever.
 */
const fs = require("fs");
const path = require("path");

const DB_FILE = path.join(process.cwd(), "data", "database.json");
const BACKUP_DIR = path.join(process.cwd(), "data", "backups");

const raw = fs.readFileSync(DB_FILE, "utf-8");
const db = JSON.parse(raw);
const revisions = db.revisions || [];

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupFile = path.join(BACKUP_DIR, `database-before-dedupe-${stamp}.json`);
fs.writeFileSync(backupFile, raw);

const byKey = new Map();
const kept = [];
let removed = 0;

for (const revision of revisions) {
  const key = [
    revision.userId,
    revision.topicId,
    revision.scheduledDate,
    revision.revisionNumber,
    revision.type,
  ].join("|");

  const keeper = byKey.get(key);
  if (!keeper) {
    byKey.set(key, revision);
    kept.push(revision);
    continue;
  }

  // Prefere o registro concluído e o que tem data de conclusão.
  if (!keeper.completed && revision.completed) {
    keeper.completed = true;
  }
  if (!keeper.completedAt && revision.completedAt) {
    keeper.completedAt = revision.completedAt;
  }
  if (revision.updatedAt) keeper.updatedAt = revision.updatedAt;
  removed++;
}

db.revisions = kept;

const tmp = `${DB_FILE}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(db));
fs.renameSync(tmp, DB_FILE);

console.log(
  JSON.stringify(
    {
      antes: revisions.length,
      depois: kept.length,
      removidas: removed,
      backup: backupFile,
    },
    null,
    2,
  ),
);
