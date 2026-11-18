/** @vitest-environment node */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as sqliteEngine from "../server/storage/sqliteEngine";

const DIR = path.join(process.cwd(), "test-data-sqlite-migration");
const available = sqliteEngine.isSqliteAvailable();

const attempts = [
  {
    id: "a1",
    topicId: 1,
    answered: true,
    correct: true,
    confidence: null,
    confidencePhase: null,
    createdAt: "2026-01-01T10:00:00.000Z",
  },
  {
    id: "a2",
    topicId: 1,
    answered: true,
    correct: false,
    confidence: null,
    confidencePhase: null,
    createdAt: "2026-01-01T10:05:00.000Z",
  },
];

/** Cria um SQLite no formato da 6.9.3: tentativas dentro de users.settings. */
async function createLegacySqlite(
  settingsOverride: Record<string, unknown> = {},
) {
  const { DatabaseSync } = await import("node:sqlite");
  const raw = new DatabaseSync(path.join(DIR, "soe.sqlite"));
  raw.exec(
    `CREATE TABLE records (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (collection, id));
     CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  );
  const insert = raw.prepare(
    "INSERT INTO records (collection, id, data) VALUES (?, ?, ?)",
  );
  insert.run(
    "users",
    "1",
    JSON.stringify({
      id: 1,
      openId: "u1",
      name: "Aluno",
      email: null,
      loginMethod: null,
      role: "user",
      settings: {
        theme: "light",
        questionAttempts: attempts,
        exams: [{ id: "exam-1", name: "Prova", date: "2027-01-10" }],
        editalRows: [
          { id: "r1", discipline: "D", topic: "T", completed: false },
        ],
        ...settingsOverride,
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      lastSignedIn: "2026-01-01T00:00:00.000Z",
    }),
  );
  raw
    .prepare("INSERT INTO meta (key, value) VALUES (?, ?)")
    .run("counters", JSON.stringify({ users: 1, disciplines: 0 }));
  raw.close();
}

beforeEach(() => {
  if (fs.existsSync(DIR)) fs.rmSync(DIR, { recursive: true });
  fs.mkdirSync(DIR, { recursive: true });
});

afterEach(() => {
  sqliteEngine.closeDatabase();
  if (fs.existsSync(DIR)) fs.rmSync(DIR, { recursive: true });
});

describe.skipIf(!available)("SQLite existente — migrações persistem", () => {
  it("REGRESSÃO 6.9.4: tentativas migradas chegam ao disco depois de uma escrita qualquer", async () => {
    await createLegacySqlite();
    sqliteEngine.setDataDir(DIR);

    const db = sqliteEngine.readDatabase();
    expect(db.questionAttempts).toHaveLength(2);

    // o app grava qualquer coisa depois (ex.: trocar tema)
    db.users[0].settings.theme = "dark";
    sqliteEngine.writeDatabase(db);

    // reabre do disco
    sqliteEngine.closeDatabase();
    sqliteEngine.setDataDir(DIR);
    const reread = sqliteEngine.readDatabase();

    expect(reread.questionAttempts).toHaveLength(2);
    expect(reread.users[0].settings.questionAttempts).toBeUndefined();
    // edital também migrou e continua lá
    const exam = (reread.users[0].settings.exams as any[])[0];
    expect(exam.editalRows).toHaveLength(1);
  });

  it("edital legado vai para o concurso citado nas linhas, não para o primeiro", async () => {
    await createLegacySqlite({
      exams: [
        { id: "exam-a", name: "Transpetro", date: "2026-12-06" },
        { id: "exam-b", name: "CGU - Dev", date: "2026-12-13" },
      ],
      editalRows: [
        {
          id: "r1",
          discipline: "Auditoria Governamental e Atuação Integrada da CGU",
          topic: "Controle interno",
          completed: false,
        },
      ],
    });
    sqliteEngine.setDataDir(DIR);
    const db = sqliteEngine.readDatabase();
    const exams = db.users[0].settings.exams as any[];
    expect(exams.find((e) => e.id === "exam-b").editalRows).toHaveLength(1);
    expect(exams.find((e) => e.id === "exam-a").editalRows ?? []).toHaveLength(
      0,
    );
    expect(db.users[0].settings.activeExamId).toBe("exam-b");
  });

  it("migração roda uma vez e o backup do .sqlite é criado", async () => {
    await createLegacySqlite();
    sqliteEngine.setDataDir(DIR);
    sqliteEngine.readDatabase();
    const backups = fs.readdirSync(path.join(DIR, "backups"));
    expect(backups.some((name) => name.endsWith(".sqlite"))).toBe(true);
  });
});
