/** @vitest-environment node */
import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  deleteLessonFrom,
  lessonsForTopic,
  upsertLesson,
  type SavedLesson,
} from "../shared/topicLessons";
import {
  checkArtifactHtml,
  parseLessonArtifact,
} from "../server/lessonArtifact";
import {
  MAX_CONCURRENT_JOBS,
  __resetJobsForTests,
  activeJobCount,
  advanceJob,
  beginModelCall,
  cancelJob,
  failJob,
  finishJob,
  getJob,
  mapGenerationError,
  startGenerationJob,
  viewJob,
} from "../server/learningJobs";

/**
 * Aula interativa: armazenamento por tópico, validação do artefato e o job de
 * geração com progresso. O banco dos testes vive num DATA_DIR temporário — o
 * banco real do usuário nunca é aberto aqui.
 */
const ROOT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "soe-lesson-"));
let run = 0;
let storage: typeof import("../server/jsonStorage");
let store: typeof import("../server/learningStore");

beforeEach(async () => {
  const dataDir = path.join(ROOT_DIR, `run-${++run}`);
  fs.mkdirSync(dataDir, { recursive: true });
  process.env.DATA_DIR = dataDir;
  process.env.SOE_STORAGE = "json";

  storage = await import("../server/jsonStorage");
  store = await import("../server/learningStore");
  storage.setDataDir(dataDir);
  storage.resetCache();

  await storage.upsertUser({
    openId: "lesson-user",
    name: "Aluno",
    email: "aluno@local",
    loginMethod: "local",
    role: "user",
  });
});

afterEach(() => {
  delete process.env.DATA_DIR;
  delete process.env.SOE_STORAGE;
  __resetJobsForTests();
});

afterAll(() => {
  try {
    fs.rmSync(ROOT_DIR, { recursive: true, force: true });
  } catch {
    /* pasta ainda em uso no Windows: o SO limpa o temp */
  }
});

function entryOf(
  topicName: string,
  title = "Aula",
): Omit<SavedLesson, "id" | "createdAt"> {
  return {
    topicName,
    disciplineName: "Direito Constitucional",
    title,
    html: "<html><body><script>1</script></body></html>",
    steps: [
      { title: "Um", text: "Primeiro passo." },
      { title: "Dois", text: "Segundo passo." },
      { title: "Três", text: "Terceiro passo." },
    ],
    interaction: "arrastar a peça",
    question: {
      prompt: "O que acontece?",
      options: ["A", "B"],
      correctIndex: 0,
      feedback: "A é correta.",
    },
    limits: ["ignora o custo"],
  };
}

function lessonOf(topicName: string, createdAt: string, title = "Aula") {
  return {
    ...entryOf(topicName, title),
    id: `aula-${topicName}-${createdAt}`,
    createdAt,
  } satisfies SavedLesson;
}

describe("shared/topicLessons", () => {
  it("mantém no máximo 5 versões por tópico e preserva os outros tópicos", () => {
    let list: SavedLesson[] = [
      lessonOf("Outro tópico", "2026-01-01T00:00:00.000Z"),
    ];
    for (let index = 0; index < 7; index += 1) {
      list = upsertLesson(
        list,
        lessonOf("Memória virtual", `2026-02-0${index + 1}T00:00:00.000Z`),
      );
    }

    const versions = lessonsForTopic(list, "memória virtual");
    expect(versions).toHaveLength(5);
    // O outro tópico continua lá.
    expect(lessonsForTopic(list, "Outro tópico")).toHaveLength(1);
    // A mais recente é a primeira da lista.
    expect(versions[0].createdAt).toBe("2026-02-07T00:00:00.000Z");
    expect(versions[4].createdAt).toBe("2026-02-03T00:00:00.000Z");
  });

  it("não muta a lista original e apaga por id", () => {
    const first = lessonOf("Paginação", "2026-01-01T00:00:00.000Z");
    const original = [first];
    const next = upsertLesson(
      original,
      lessonOf("Paginação", "2026-01-02T00:00:00.000Z"),
    );
    expect(original).toHaveLength(1);
    expect(next).toHaveLength(2);

    const remaining = deleteLessonFrom(next, first.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].createdAt).toBe("2026-01-02T00:00:00.000Z");
    expect(deleteLessonFrom(next, "nao-existe")).toHaveLength(2);
  });
});

describe("learningStore — aulas persistidas", () => {
  it("salva, lista da mais recente para a mais antiga e apaga", async () => {
    const saved = await store.saveLesson(1, entryOf("Licitação"));

    expect(saved.id).toMatch(/^aula-/);
    expect(saved.createdAt).toBeTruthy();

    const settings = await storage.getUserSettings(1);
    const stored = (settings as any).topicLessons as SavedLesson[];
    expect(stored).toHaveLength(1);
    expect(stored[0].topicName).toBe("Licitação");

    const listed = await store.listLessons(1, "  licitação ");
    expect(listed).toHaveLength(1);
    expect(listed[0].steps).toHaveLength(3);

    expect(await store.deleteLesson(1, saved.id)).toBe(true);
    expect(await store.listLessons(1, "Licitação")).toEqual([]);
    expect(await store.deleteLesson(1, saved.id)).toBe(false);
  });

  it("guarda histórico de 5 versões do mesmo tópico e sobrevive ao reload", async () => {
    for (let index = 0; index < 6; index += 1) {
      await store.saveLesson(1, {
        ...entryOf("Controle"),
        title: `Versão ${index + 1}`,
      });
    }
    storage.resetCache();
    const listed = await store.listLessons(1, "Controle");
    expect(listed).toHaveLength(5);
    expect(listed[0].title).toBe("Versão 6");
    expect(listed[4].title).toBe("Versão 2");
  });

  it("marca aula estudada uma vez por dia", async () => {
    const first = await storage.logLessonStudiedToday(
      1,
      "Paginação de memória",
      undefined,
      "2026-11-21T10:00:00.000Z",
    );
    expect(first).toEqual({ date: "2026-11-21", recorded: true });

    const second = await storage.logLessonStudiedToday(
      1,
      "Paginação de memória",
      undefined,
      "2026-11-21T22:30:00.000Z",
    );
    expect(second.recorded).toBe(false);

    const settings = await storage.getUserSettings(1);
    const events = ((settings as any).studyEvents || []) as Array<{
      type: string;
      occurredAt: string;
    }>;
    const lessons = events.filter((event) => event.type === "lesson");
    expect(lessons).toHaveLength(1);

    const nextDay = await storage.logLessonStudiedToday(
      1,
      "Paginação de memória",
      undefined,
      "2026-11-22T09:00:00.000Z",
    );
    expect(nextDay.recorded).toBe(true);
  });
});

const GOOD_HTML = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><style>
body{background:#0b0f1a;color:#e8e8ed;font-family:system-ui}
@media (prefers-reduced-motion: reduce){canvas{display:block}}
</style></head><body>
<canvas id="c" width="600" height="300"></canvas>
<button id="play">Play</button><button id="pause">Pause</button>
<script>
const ctx = document.getElementById("c").getContext("2d");
let t = 0;
function frame(){ t += 1; ctx.clearRect(0,0,600,300); ctx.fillStyle="#2997ff"; ctx.fillRect(t % 600, 40, 40, 40); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
</script></body></html>`;

describe("validador de artefato de aula", () => {
  it("aceita um artefato bom", () => {
    const check = checkArtifactHtml(GOOD_HTML);
    expect(check.ok).toBe(true);

    const parsed = parseLessonArtifact(
      {
        title: "Fluxo de licitação",
        html: GOOD_HTML,
        steps: [
          { title: "Edital", text: "A administração publica o edital." },
          { title: "Propostas", text: "Os interessados entregam propostas." },
          { title: "Julgamento", text: "A comissão classifica as propostas." },
        ],
        interaction: "arraste a proposta para a fase",
        question: {
          prompt: "Qual fase vem primeiro?",
          options: ["Edital", "Julgamento"],
          correctIndex: 0,
          feedback: "O edital abre o procedimento.",
        },
        limits: ["não modela prazos recursais"],
      },
      { topicName: "Licitação", disciplineName: "Direito Administrativo" },
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.lesson.steps).toHaveLength(3);
      expect(parsed.lesson.question.correctIndex).toBe(0);
      expect(parsed.lesson.limits).toEqual(["não modela prazos recursais"]);
    }
  });

  it("rejeita artefato que tenta usar rede", () => {
    const withFetch = GOOD_HTML.replace(
      "requestAnimationFrame(frame);",
      "fetch('https://exemplo.com/dados');",
    );
    const check = checkArtifactHtml(withFetch);
    expect(check.ok).toBe(false);
    expect(check.problems.map((item) => item.code)).toContain("NETWORK");

    const withSrc = GOOD_HTML.replace(
      "<canvas",
      '<script src="chart.js"></script><canvas',
    );
    const srcCheck = checkArtifactHtml(withSrc);
    expect(srcCheck.ok).toBe(false);
    expect(srcCheck.problems.map((item) => item.code)).toContain(
      "EXTERNAL_SOURCE",
    );

    const withHttp = GOOD_HTML.replace(
      "</style>",
      "/* http://cdn.exemplo.com */</style>",
    );
    expect(checkArtifactHtml(withHttp).ok).toBe(false);
  });

  it("rejeita aula sem passos, sem pergunta ou sem limites", () => {
    const base = {
      title: "X",
      html: GOOD_HTML,
      steps: [
        { title: "a", text: "b" },
        { title: "c", text: "d" },
        { title: "e", text: "f" },
      ],
      interaction: "slider",
      question: {
        prompt: "p",
        options: ["1", "2"],
        correctIndex: 1,
        feedback: "f",
      },
      limits: ["ignora custo"],
    };

    expect(
      parseLessonArtifact(
        { ...base, steps: [{ title: "a", text: "b" }] },
        {
          topicName: "t",
        },
      ).ok,
    ).toBe(false);
    expect(
      parseLessonArtifact({ ...base, question: undefined }, { topicName: "t" })
        .ok,
    ).toBe(false);
    expect(
      parseLessonArtifact({ ...base, limits: [] }, { topicName: "t" }).ok,
    ).toBe(false);
    expect(
      parseLessonArtifact(
        {
          ...base,
          html: GOOD_HTML.replace(/prefers-reduced-motion/g, "prefers-motion"),
        },
        { topicName: "t" },
      ).ok,
    ).toBe(false);
  });
});

describe("job de geração", () => {
  it("avança o progresso sem nunca voltar e só chega a 100 com resultado", () => {
    const job = startGenerationJob(1, "lesson", () => new Promise(() => {}));
    beginModelCall(job);

    const samples: number[] = [];
    for (const percent of [40, 12, 70, 60, 99, 150]) {
      advanceJob(job, percent);
      samples.push(job.percent);
    }
    expect(samples).toEqual([40, 40, 70, 70, 99, 99]);
    expect(job.percent).toBeLessThan(100);

    finishJob(job, { ok: true });
    expect(job.percent).toBe(100);
    expect(job.status).toBe("done");
    expect(viewJob(job).result).toEqual({ ok: true });
  });

  it("não chega a 100 quando o resultado é vazio", () => {
    const job = startGenerationJob(1, "lesson", () => new Promise(() => {}));
    advanceJob(job, 80);
    finishJob(job, undefined);
    expect(job.status).toBe("error");
    expect(job.percent).toBeLessThan(100);
  });

  it("cancelar libera o slot e descarta o resultado que chegar depois", async () => {
    let release: (value: unknown) => void = () => {};
    const job = startGenerationJob(
      1,
      "lesson",
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    expect(activeJobCount(1)).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 0));

    cancelJob(job);
    expect(job.status).toBe("cancelled");
    expect(activeJobCount(1)).toBe(0);

    release({ late: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(job.status).toBe("cancelled");
    expect(job.result).toBeUndefined();
  });

  it("erro fica no job com código e mensagem legível, sem stack trace", async () => {
    const job = startGenerationJob(1, "lesson", async () => {
      throw new Error("QUOTA_EXCEEDED: quota estourou");
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(job.status).toBe("error");
    expect(job.error?.code).toBe("QUOTA_EXCEEDED");
    expect(job.error?.message).toMatch(/Cota da IA esgotada/);
    expect(job.error?.message).not.toMatch(/at .*\.ts:/);

    const timeout = mapGenerationError(new Error("sem resposta em 25s"));
    expect(timeout.code).toBe("TIMEOUT");
    const invalid = mapGenerationError(
      new Error("A IA não devolveu um JSON legível. Gere novamente."),
    );
    expect(invalid.code).toBe("INVALID_JSON");
  });

  it("não aceita mais de 2 gerações simultâneas por usuário", () => {
    startGenerationJob(1, "lesson", () => new Promise(() => {}));
    startGenerationJob(1, "microWorld", () => new Promise(() => {}));
    expect(activeJobCount(1)).toBe(MAX_CONCURRENT_JOBS);

    startGenerationJob(2, "lesson", () => new Promise(() => {}));
    expect(activeJobCount(2)).toBe(1);
  });

  it("job expirado/inexistente não é encontrado", () => {
    expect(getJob("job-inexistente")).toBeUndefined();
  });
});
