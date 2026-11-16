/** @vitest-environment node */
import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { SavedAnalogy } from "../server/learningStore";

/**
 * Aprendizagem como dado: analogias e micro-mundos ficam nas settings do
 * usuário. Os testes usam um DATA_DIR temporário (fora do OneDrive) para nunca
 * tocar o banco real — o env tem de ser setado ANTES de importar o storage,
 * por isso os imports do módulo são dinâmicos.
 */
const ROOT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "soe-learning-store-"));

let dataDir = "";
let run = 0;
let storage: typeof import("../server/jsonStorage");
let store: typeof import("../server/learningStore");

beforeEach(async () => {
  dataDir = path.join(ROOT_DIR, `run-${++run}`);
  fs.mkdirSync(dataDir, { recursive: true });
  process.env.DATA_DIR = dataDir;
  process.env.SOE_STORAGE = "json";

  storage = await import("../server/jsonStorage");
  store = await import("../server/learningStore");
  storage.setDataDir(dataDir);
  storage.resetCache();

  await storage.upsertUser({
    openId: "learning-user",
    name: "Aluno",
    email: "aluno@local",
    loginMethod: "local",
    role: "user",
  });
});

afterEach(() => {
  delete process.env.DATA_DIR;
  delete process.env.SOE_STORAGE;
});

afterAll(() => {
  try {
    fs.rmSync(ROOT_DIR, { recursive: true, force: true });
  } catch {
    /* pasta ainda em uso no Windows: o SO limpa o temp */
  }
});

async function analogyEntry(
  topicName: string,
  chosenAt?: string,
): Promise<SavedAnalogy> {
  return store.saveAnalogy(1, {
    topicName,
    analogy: `Analogia de ${topicName}`,
    mapping: ["A = B"],
    breaks: "quebra no detalhe técnico",
    bestFor: "primeira leitura",
    whyItWorks: "ancora no concreto",
    chosenAt,
  });
}

async function microWorldEntry(topicName: string, title: string) {
  return store.saveMicroWorld(1, {
    topicName,
    title,
    html: `<html><body><h1>${title}</h1></body></html>`,
    controls: ["slider"],
    challenges: ["prever o resultado"],
    limits: ["não modela custo"],
  });
}

describe("appendCapped", () => {
  it("respeita o cap mantendo o fim da lista", () => {
    const result = store.appendCapped([1, 2, 3], 4, 3);
    expect(result).toEqual([2, 3, 4]);
  });

  it("não corta quando ainda cabe", () => {
    expect(store.appendCapped([1], 2, 5)).toEqual([1, 2]);
  });

  it("não muta a lista original", () => {
    const original = [1, 2, 3];
    const result = store.appendCapped(original, 4, 2);
    expect(original).toEqual([1, 2, 3]);
    expect(result).not.toBe(original);
    expect(result).toEqual([3, 4]);
  });

  it("aceita lista vazia e cap zero", () => {
    expect(store.appendCapped([], "a", 10)).toEqual(["a"]);
    expect(store.appendCapped(["a", "b"], "c", 0)).toEqual([]);
  });
});

describe("filterByTopic", () => {
  const list = [
    { id: 1, topicName: "Direito Constitucional" },
    { id: 2, topicName: "  Controle de Constitucionalidade " },
    { id: 3, topicName: "Direito Administrativo" },
  ];

  it("sem tópico devolve tudo, do mais recente para o mais antigo", () => {
    const result = store.filterByTopic(list);
    expect(result.map((item) => item.id)).toEqual([3, 2, 1]);
  });

  it("filtra por tópico ignorando caixa e espaços", () => {
    const result = store.filterByTopic(
      list,
      "  controle DE constitucionalidade ",
    );
    expect(result.map((item) => item.id)).toEqual([2]);
  });

  it("não muta o array original", () => {
    const copy = [...list];
    const result = store.filterByTopic(list);
    expect(list).toEqual(copy);
    expect(result).not.toBe(list);
  });

  it("devolve vazio quando não há correspondência", () => {
    expect(store.filterByTopic(list, "Penal")).toEqual([]);
  });
});

describe("analogias", () => {
  it("persiste em settings.topicAnalogies com id e chosenAt", async () => {
    const saved = await analogyEntry("Imunidade tributária");

    expect(saved.id).toBeTruthy();
    expect(saved.chosenAt).toBeTruthy();
    expect(saved.whyItWorks).toBe("ancora no concreto");

    const settings = await storage.getUserSettings(1);
    const stored = (settings as any).topicAnalogies as any[];
    expect(Array.isArray(stored)).toBe(true);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(saved.id);
    expect(stored[0].analogy).toBe("Analogia de Imunidade tributária");
  });

  it("lista da mais recente para a mais antiga", async () => {
    await analogyEntry("Primeiro tópico", "2026-01-01T10:00:00.000Z");
    await analogyEntry("Segundo tópico", "2026-02-01T10:00:00.000Z");
    await analogyEntry("Terceiro tópico", "2026-03-01T10:00:00.000Z");

    const all = await store.listAnalogies(1);
    expect(all.map((item) => item.topicName)).toEqual([
      "Terceiro tópico",
      "Segundo tópico",
      "Primeiro tópico",
    ]);
  });

  it("filtra por tópico no listAnalogies", async () => {
    await analogyEntry(
      "Controle de constitucionalidade",
      "2026-01-01T10:00:00.000Z",
    );
    await analogyEntry("Direito Penal", "2026-02-01T10:00:00.000Z");
    await analogyEntry(
      "Controle de Constitucionalidade",
      "2026-03-01T10:00:00.000Z",
    );

    const filtered = await store.listAnalogies(
      1,
      " CONTROLE de constitucionalidade ",
    );
    expect(filtered).toHaveLength(2);
    expect(filtered[0].chosenAt).toBe("2026-03-01T10:00:00.000Z");
    expect(await store.listAnalogies(1, "Direito Penal")).toHaveLength(1);
    // Correspondência é exata (só trim + caixa), não substring.
    expect(await store.listAnalogies(1, "Penal")).toEqual([]);
    expect(await store.listAnalogies(1, "nada a ver")).toEqual([]);
  });

  it("atualiza no lugar quando o id já existe", async () => {
    const first = await analogyEntry("Economia", "2026-01-01T10:00:00.000Z");
    const second = await store.saveAnalogy(1, {
      id: first.id,
      topicName: "Economia",
      analogy: "Analogia revisada",
      mapping: ["X = Y"],
      breaks: "quebra em elasticidade",
      bestFor: "revisão",
    });

    expect(second.id).toBe(first.id);
    expect(second.chosenAt).toBe("2026-01-01T10:00:00.000Z");
    const all = await store.listAnalogies(1);
    expect(all).toHaveLength(1);
    expect(all[0].analogy).toBe("Analogia revisada");
  });

  it("aplica o cap de 200 mantendo as mais recentes", async () => {
    const seed = Array.from({ length: store.MAX_ANALOGIES }, (_, index) => ({
      id: `seed-${index}`,
      topicName: `Tópico ${index}`,
      analogy: `Analogia ${index}`,
      mapping: [] as string[],
      breaks: "",
      bestFor: "",
      chosenAt: new Date(2026, 0, 1, 0, 0, index).toISOString(),
    }));
    await storage.updateUserSettings(1, {
      topicAnalogies: seed,
    } as any);

    await analogyEntry("Tópico novo", "2026-12-31T23:59:59.000Z");

    const settings = await storage.getUserSettings(1);
    const stored = (settings as any).topicAnalogies as typeof seed;
    expect(stored).toHaveLength(store.MAX_ANALOGIES);
    expect(stored[0].id).not.toBe("seed-0");
    expect(stored[stored.length - 1].topicName).toBe("Tópico novo");

    const listed = await store.listAnalogies(1);
    expect(listed).toHaveLength(store.MAX_ANALOGIES);
    expect(listed[0].topicName).toBe("Tópico novo");
  });

  it("lança quando o usuário não existe", async () => {
    await expect(
      store.saveAnalogy(9999, {
        topicName: "Fantasma",
        analogy: "a",
        mapping: [],
        breaks: "",
        bestFor: "",
      }),
    ).rejects.toThrow(/não encontrado/i);
  });
});

describe("micro-mundos", () => {
  it("persiste em settings.microWorlds com id e createdAt", async () => {
    const saved = await microWorldEntry("Cinemática", "Gráfico vivo");

    expect(saved.id).toBeTruthy();
    expect(saved.createdAt).toBeTruthy();
    const settings = await storage.getUserSettings(1);
    const stored = (settings as any).microWorlds as any[];
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe("Gráfico vivo");
    expect(stored[0].controls).toEqual(["slider"]);
  });

  it("substitui o micro-mundo anterior do mesmo tópico", async () => {
    await microWorldEntry("Cinemática", "Versão 1");
    await microWorldEntry("Termodinâmica", "Outro tópico");
    const second = await microWorldEntry("  cinemática ", "Versão 2");

    const settings = await storage.getUserSettings(1);
    const stored = (settings as any).microWorlds as any[];
    expect(stored).toHaveLength(2);
    expect(stored.map((item) => item.title)).toEqual([
      "Outro tópico",
      "Versão 2",
    ]);

    const forTopic = await store.listMicroWorlds(1, "CINEMÁTICA");
    expect(forTopic).toHaveLength(1);
    expect(forTopic[0].id).toBe(second.id);
    expect(forTopic[0].limits).toEqual(["não modela custo"]);
  });

  it("lista do mais recente para o mais antigo e filtra por tópico", async () => {
    await microWorldEntry("A", "antigo");
    await microWorldEntry("B", "meio");
    await microWorldEntry("C", "novo");

    const all = await store.listMicroWorlds(1);
    expect(all.map((item) => item.title)).toEqual(["novo", "meio", "antigo"]);
    expect(await store.listMicroWorlds(1, undefined)).toHaveLength(3);
    expect((await store.listMicroWorlds(1, "B")).map((i) => i.title)).toEqual([
      "meio",
    ]);
  });

  it("aplica o cap de 50 mantendo os mais recentes", async () => {
    const seed = Array.from({ length: store.MAX_MICROWORLDS }, (_, index) => ({
      id: `mw-seed-${index}`,
      topicName: `Tópico ${index}`,
      title: `Seed ${index}`,
      html: "<html></html>",
      controls: [] as string[],
      challenges: [] as string[],
      limits: [] as string[],
      createdAt: new Date(2026, 0, 1, 0, 0, index).toISOString(),
    }));
    await storage.updateUserSettings(1, { microWorlds: seed } as any);

    await microWorldEntry("Tópico novo", "Novo");

    const settings = await storage.getUserSettings(1);
    const stored = (settings as any).microWorlds as typeof seed;
    expect(stored).toHaveLength(store.MAX_MICROWORLDS);
    expect(stored[0].id).not.toBe("mw-seed-0");
    expect(stored[stored.length - 1].title).toBe("Novo");

    const listed = await store.listMicroWorlds(1);
    expect(listed[0].title).toBe("Novo");
    expect(listed).toHaveLength(store.MAX_MICROWORLDS);
  });

  it("sobrevive ao reload do banco (dados no disco)", async () => {
    await microWorldEntry("Persistência", "Fica");
    await analogyEntry("Persistência", "2026-05-05T10:00:00.000Z");

    storage.resetCache();
    const worlds = await store.listMicroWorlds(1);
    const analogies = await store.listAnalogies(1);
    expect(worlds).toHaveLength(1);
    expect(worlds[0].title).toBe("Fica");
    expect(analogies).toHaveLength(1);
  });
});
