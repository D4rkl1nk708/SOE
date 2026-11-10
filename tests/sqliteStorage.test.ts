/** @vitest-environment node */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// `node:sqlite` existe? (Node >= 22.5 com --experimental-sqlite, Electron 22.21+)
const hasSqlite = (() => {
  try {
    const getBuiltin = (
      process as unknown as { getBuiltinModule?: (id: string) => any }
    ).getBuiltinModule;
    return Boolean(getBuiltin?.("node:sqlite")?.DatabaseSync);
  } catch {
    return false;
  }
})();

// Fora do OneDrive: a sincronização mantém handles e causa EBUSY no Windows.
const TEST_DATA_DIR = path.join(
  os.tmpdir(),
  `soe-sqlite-test-${process.pid}-${Date.now()}`,
);

let storage: typeof import("../server/jsonStorage");
let sqliteEngine: typeof import("../server/storage/sqliteEngine");

beforeAll(async () => {
  if (!hasSqlite) return;
  process.env.SOE_STORAGE = "sqlite";
  sqliteEngine = await import("../server/storage/sqliteEngine");
  storage = await import("../server/jsonStorage");
});

describe.skipIf(!hasSqlite)("Motor SQLite (node:sqlite)", () => {
  // Diretório único por teste: no Windows o node:sqlite mantém o arquivo
  // travado mesmo após close(), então não dá para reaproveitar a pasta.
  let dataDir = "";
  let counter = 0;

  beforeEach(() => {
    storage.closeDatabase();
    dataDir = `${TEST_DATA_DIR}-${++counter}`;
    fs.mkdirSync(dataDir, { recursive: true });
    storage.setDataDir(dataDir);
    storage.resetCache();
  });

  afterEach(() => {
    storage.closeDatabase();
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* arquivo ainda travado no Windows: fica no temp e o SO limpa */
    }
  });

  it("é o motor efetivamente selecionado", async () => {
    const { storageDriver } = await import("../server/storage/index");
    expect(storageDriver).toBe("sqlite");
    expect(sqliteEngine.isSqliteAvailable()).toBe(true);
  });

  it("faz o CRUD básico e cria o arquivo soe.sqlite", async () => {
    await storage.upsertUser({ openId: "u-sql", name: "SQL User" });
    const user = (await storage.getUserByOpenId("u-sql"))!;
    expect(user.name).toBe("SQL User");

    const disc = await storage.createDiscipline({
      userId: user.id,
      name: "Direito",
      color: "#111111",
      weight: 2,
    });
    const topic = await storage.createTopic({
      userId: user.id,
      disciplineId: disc.id,
      name: "Tópico 1",
    } as never);

    expect(
      (await storage.getTopicsByUser(user.id)).map((t) => t.name),
    ).toContain("Tópico 1");

    await storage.setTopicPerformance(topic.id, user.id, {
      correctCount: 7,
      errorCount: 3,
    } as never);

    const reloaded = await storage.getTopicById(topic.id, user.id);
    expect(reloaded?.performance?.correctCount).toBe(7);

    expect(fs.existsSync(path.join(dataDir, "soe.sqlite"))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, "database.json"))).toBe(false);
  });

  it("persiste de verdade após reabrir o banco (restart simulado)", async () => {
    await storage.upsertUser({ openId: "u-persist", name: "Persistente" });
    const before = (await storage.getUserByOpenId("u-persist"))!;

    // setDataDir fecha o handle e zera o cache: próxima leitura vem do disco.
    storage.setDataDir(dataDir);

    const after = (await storage.getUserByOpenId("u-persist"))!;
    expect(after.id).toBe(before.id);
    expect(after.name).toBe("Persistente");
  });

  it("atualiza sem duplicar linhas (escrita incremental)", async () => {
    await storage.upsertUser({ openId: "u-inc", name: "Inc" });
    const user = (await storage.getUserByOpenId("u-inc"))!;
    for (let i = 0; i < 5; i++) {
      await storage.createDiscipline({
        userId: user.id,
        name: `Disc ${i}`,
        color: "#000000",
        weight: 1,
      });
    }

    await storage.updateUserSettings(user.id, { theme: "dark" } as never);

    // Conta pela API: sem duplicação de linhas após vários saves.
    const db = storage.readDatabase();
    expect(db.disciplines).toHaveLength(5);
    expect(db.users).toHaveLength(1);
  });

  it("migra o database.json existente e preserva o original", async () => {
    const legacy = {
      users: [
        {
          id: 1,
          openId: "legacy",
          name: "Legado",
          role: "admin",
          settings: { theme: "light" },
          createdAt: new Date().toISOString(),
        },
      ],
      disciplines: [
        {
          id: 1,
          userId: 1,
          name: "Matéria Legada",
          color: "#abc",
          weight: 1,
          order: 1,
          studyTimeSeconds: 0,
        },
      ],
      topics: [],
      revisions: [],
      counters: { users: 1, disciplines: 1, topics: 0, revisions: 0 },
    };
    fs.writeFileSync(
      path.join(dataDir, "database.json"),
      JSON.stringify(legacy),
      "utf-8",
    );

    storage.resetCache();
    storage.setDataDir(dataDir);

    const db = storage.readDatabase();
    expect(db.disciplines.map((d) => d.name)).toContain("Matéria Legada");

    const migrated = fs
      .readdirSync(dataDir)
      .filter((f) => f.startsWith("database.json.migrated-"));
    expect(migrated.length).toBe(1);
    expect(fs.existsSync(path.join(dataDir, "soe.sqlite"))).toBe(true);
  });

  it("não apaga dados quando o database.json legado está corrompido", () => {
    fs.writeFileSync(
      path.join(dataDir, "database.json"),
      "{ inválido",
      "utf-8",
    );
    storage.resetCache();
    storage.setDataDir(dataDir);

    expect(() => storage.readDatabase()).toThrow();
    // o arquivo original continua lá para recuperação manual
    expect(fs.existsSync(path.join(dataDir, "database.json"))).toBe(true);
  });
});
