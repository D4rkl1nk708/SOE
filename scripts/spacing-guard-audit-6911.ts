/**
 * Auditoria do guard de espaçamento (v6.9.11, A1/4.2).
 *
 * Roda SEMPRE numa CÓPIA da base: o script recusa um DATA_DIR que aponte para
 * a pasta real do app. Mostra quantas revisões mudaram, o antes/depois das
 * violações de gap, os 2 primeiros movimentos e o resultado do segundo passe
 * (idempotência). O backup feito pelo próprio guard fica em `<DATA_DIR>/backups`.
 *
 * Uso:
 *   DATA_DIR=/tmp/soe-copia SOE_STORAGE=sqlite \
 *     npx tsx scripts/spacing-guard-audit-6911.ts
 */
import * as fs from "fs";
import * as path from "path";
import * as storage from "../server/jsonStorage";
import { MIN_RECALL_GAP_DAYS, planSpacingFixes } from "../shared/spacingGuard";
import { localDayISO } from "../shared/localDay";

const dir = String(process.env.DATA_DIR || "").trim();
if (!dir) {
  console.error("DATA_DIR é obrigatório (aponte para uma CÓPIA).");
  process.exit(1);
}
const normalized = path.resolve(dir).toLowerCase();
if (
  normalized.includes("appdata") &&
  normalized.includes("estudo_25_50_dias") &&
  !normalized.includes("copy")
) {
  console.error("Recusado: este caminho parece a base real do app.");
  process.exit(1);
}

storage.setDataDir(dir);
storage.resetCache();
const db = storage.readDatabase();
const user = db.users[0];
if (!user) {
  console.error("Base sem usuário.");
  process.exit(1);
}

const before = db.revisions.filter((revision) => revision.userId === user.id);
const pending = before.filter(
  (revision) =>
    !revision.completed &&
    !revision.ignored &&
    String(revision.scheduledDate) >= localDayISO(),
);
const plannedFixes = planSpacingFixes({
  revisions: before.map((revision) => ({
    id: revision.id,
    topicId: revision.topicId,
    scheduledDate: revision.scheduledDate,
    completed: revision.completed,
    completedAt: revision.completedAt,
    ignored: revision.ignored,
  })),
  today: localDayISO(),
});

console.log(
  JSON.stringify(
    {
      base: dir,
      driver: process.env.SOE_STORAGE || "(default)",
      dbFile: storage.getDbFile(),
      userId: user.id,
      revisions: before.length,
      pendingFuture: pending.length,
      plannedFixes: plannedFixes.length,
      minGapDays: MIN_RECALL_GAP_DAYS,
      samplePlan: plannedFixes.slice(0, 3),
    },
    null,
    2,
  ),
);

const result = await storage.applySpacingGuard(user.id, {});
console.log(
  JSON.stringify(
    {
      moved: result.moved,
      backup: result.backup,
      sample: result.fixes.slice(0, 3),
    },
    null,
    2,
  ),
);

const after = storage.readDatabase();
const remainingFixes = planSpacingFixes({
  revisions: after.revisions
    .filter((revision) => revision.userId === user.id)
    .map((revision) => ({
      id: revision.id,
      topicId: revision.topicId,
      scheduledDate: revision.scheduledDate,
      completed: revision.completed,
      completedAt: revision.completedAt,
      ignored: revision.ignored,
    })),
  today: localDayISO(),
});

const second = await storage.applySpacingGuard(user.id, {});
console.log(
  JSON.stringify(
    {
      revisionsAfter: after.revisions.length,
      remainingGapViolations: remainingFixes.length,
      idempotentSecondRun: second.moved === 0,
      backupsDir: path.join(dir, "backups"),
      backups: fs.existsSync(path.join(dir, "backups"))
        ? fs.readdirSync(path.join(dir, "backups")).slice(-3)
        : [],
    },
    null,
    2,
  ),
);

storage.closeDatabase();
