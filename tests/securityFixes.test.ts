/** @vitest-environment node */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as storage from "../server/jsonStorage";
import { safeJoin, UnsafePathError } from "../server/_core/safePath";
import { DatabaseCorruptError } from "../server/storage/engine";
import { extractJSON } from "../server/mentorRouter";

const TEST_DATA_DIR = path.join(process.cwd(), "test-data-security");

function dbFile() {
  return path.join(TEST_DATA_DIR, "database.json");
}

describe("Correções de segurança e integridade", () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    storage.setDataDir(TEST_DATA_DIR);
    storage.resetCache();
  });

  afterEach(() => {
    storage.resetCache();
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  describe("safeJoin (path traversal)", () => {
    it("aceita nomes simples dentro do diretório base", () => {
      expect(safeJoin("/base", "backup.json")).toBe(
        path.resolve("/base/backup.json"),
      );
      expect(safeJoin("/base", "backups", "b.json")).toBe(
        path.resolve("/base/backups/b.json"),
      );
    });

    it("rejeita ../ e caminhos absolutos", () => {
      expect(() => safeJoin("/base", "../../etc/passwd")).toThrow(
        UnsafePathError,
      );
      expect(() =>
        safeJoin("/base", "..", "..", "windows", "system32"),
      ).toThrow(UnsafePathError);
      expect(() => safeJoin("/base", "/etc/passwd")).toThrow(UnsafePathError);
      // caminho que apenas *começa* com o nome do base não pode passar
      expect(() => safeJoin("/base", "../base-evil/x.json")).toThrow(
        UnsafePathError,
      );
    });
  });

  describe("banco corrompido", () => {
    it("preserva o arquivo e falha alto em vez de cachear um banco vazio", () => {
      fs.writeFileSync(dbFile(), "{ isso não é json", "utf-8");

      expect(() => storage.readDatabase()).toThrow(DatabaseCorruptError);

      // arquivo original intacto
      expect(fs.readFileSync(dbFile(), "utf-8")).toBe("{ isso não é json");

      // cópia de segurança criada
      const backups = fs
        .readdirSync(TEST_DATA_DIR)
        .filter((f) => f.includes(".corrupt-"));
      expect(backups.length).toBeGreaterThanOrEqual(1);
    });

    it("não transforma estrutura inválida em perda de dados", () => {
      // JSON válido, mas sem as coleções obrigatórias: antes isso caía no
      // catch e devolvia banco vazio; agora também falha alto.
      fs.writeFileSync(
        dbFile(),
        JSON.stringify({ users: "não é array", disciplines: [] }),
        "utf-8",
      );
      expect(() => storage.readDatabase()).toThrow(DatabaseCorruptError);
    });

    it("arquivo inexistente continua iniciando um banco vazio", () => {
      const db = storage.readDatabase();
      expect(db.users).toEqual([]);
      expect(db.counters.users).toBe(0);
    });
  });

  describe("exportação não vaza credenciais", () => {
    it("remove aiApiKey e pushToken do payload", async () => {
      await storage.upsertUser({ openId: "u-sec", name: "User Sec" });
      const user = (await storage.getUserByOpenId("u-sec"))!;
      await storage.updateUserSettings(user.id, {
        aiApiKey: "sk-super-secreta",
        pushToken: "token-de-sync-123456",
      } as never);

      const json = await storage.exportDatabase();
      expect(json).not.toContain("sk-super-secreta");
      expect(json).not.toContain("token-de-sync-123456");

      const parsed = JSON.parse(json);
      expect(parsed.users[0].name).toBe("User Sec");
      expect(parsed.users[0].settings.aiApiKey).toBeUndefined();
      expect(parsed.users[0].settings.pushToken).toBeUndefined();
    });

    it("exportDatabaseForUser também remove segredos", async () => {
      await storage.upsertUser({ openId: "u2", name: "User 2" });
      const user = (await storage.getUserByOpenId("u2"))!;
      await storage.updateUserSettings(user.id, {
        aiApiKey: "sk-outra-chave",
      } as never);
      // exportDatabaseForUser recusa banco vazio: cria uma disciplina.
      await storage.createDiscipline({
        userId: user.id,
        name: "Matemática",
        color: "#000000",
        weight: 1,
      });

      const json = await storage.exportDatabaseForUser(user.id);
      expect(json).not.toContain("sk-outra-chave");
    });
  });

  describe("token mágico antigo", () => {
    it("não aceita mais a string pública ELECTRON_MODE", async () => {
      await storage.upsertUser({ openId: "u-token", name: "User Token" });
      const user = (await storage.getUserByOpenId("u-token"))!;
      await storage.updateUserSettings(user.id, {
        pushToken: "token-real-abcdef",
      } as never);

      expect(await storage.getUserByPushToken("ELECTRON_MODE")).toBeUndefined();
      expect((await storage.getUserByPushToken("token-real-abcdef"))?.id).toBe(
        user.id,
      );
    });
  });

  describe("parse de resposta da IA sem execução de código", () => {
    it("não avalia JavaScript embutido no texto do modelo", () => {
      const globals = globalThis as Record<string, unknown>;
      delete globals.__soePwned;

      const malicious =
        "{pwn: (globalThis.__soePwned = true), ok: 1}\n(mesmo assim isso não pode rodar)";
      // Pode lançar (JSON irrecuperável) — o que não pode é executar código.
      try {
        extractJSON(malicious);
      } catch {
        /* esperado */
      }

      expect(globals.__soePwned).toBeUndefined();
    });

    it("continua extraindo JSON válido", () => {
      const parsed = extractJSON('Claro!\n{"a": 1, "b": "x"}\nFim.');
      expect(parsed).toMatchObject({ a: 1, b: "x" });
    });

    it("repara chaves sem aspas e vírgula final", () => {
      const parsed = extractJSON('{"a": 1, "b": 2,}');
      expect(parsed).toMatchObject({ a: 1, b: 2 });
    });
  });

  describe("persistência", () => {
    it("grava addSyncHistory no disco (antes só mutava a memória)", async () => {
      await storage.upsertUser({ openId: "u-sync", name: "Sync" });
      const user = (await storage.getUserByOpenId("u-sync"))!;
      await storage.addSyncHistory(user.id, {
        type: "upload",
        status: "success",
        fileName: "backup.json",
      });

      const onDisk = JSON.parse(fs.readFileSync(dbFile(), "utf-8"));
      const saved = onDisk.users.find((u: { id: number }) => u.id === user.id);
      expect(saved.settings.syncHistory).toHaveLength(1);
      expect(saved.settings.syncHistory[0].fileName).toBe("backup.json");
    });

    it("não deixa arquivo .tmp para trás após a escrita", async () => {
      await storage.upsertUser({ openId: "u-tmp", name: "Tmp" });
      const user = (await storage.getUserByOpenId("u-tmp"))!;
      await storage.updateUserSettings(user.id, { theme: "dark" } as never);

      const leftovers = fs
        .readdirSync(TEST_DATA_DIR)
        .filter((f) => f.endsWith(".tmp"));
      expect(leftovers).toEqual([]);
    });
  });
});
