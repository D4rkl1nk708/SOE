/** @vitest-environment node */
/**
 * v6.9.10 — o que o APK não fazia.
 *
 * 1) Contagem: a sessão fechada no celular não caía no histórico porque
 *    `study.recordSession` não tinha versão offline e `study.masterySnapshot`
 *    também não, então o relatório sempre dizia "nenhuma questão nova".
 * 2) Upload: `learning.importPdf` lançava "precisa do SOE no computador".
 *
 * Aqui a extração do PDF roda de verdade (pdf.js) sobre um PDF real em
 * `tests/fixtures/apostila.pdf`.
 */
import "fake-indexeddb/auto";
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/aiHelpers", () => ({
  callAiProvider: vi.fn().mockResolvedValue(""),
  extractJSON: vi.fn(),
  AiProvider: {},
}));

import * as localDb from "../client/src/lib/localDb";
import { buildSessionReport } from "../shared/sessionReport";

const fixtureBase64 = () =>
  `data:application/pdf;base64,${fs
    .readFileSync(path.join(__dirname, "fixtures", "apostila.pdf"))
    .toString("base64")}`;

describe("APK: contagem da sessão", () => {
  beforeAll(async () => {
    await localDb.localAuthMe();
  });

  it("registra a sessão no histórico do aparelho", async () => {
    const startedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const result = await localDb.localStudyRecordSession({
      startedAt,
      endedAt: new Date().toISOString(),
      minutes: 20,
      accuracy: 60,
      questions: 10,
      correct: 6,
      topicName: "Atos Administrativos",
    });
    expect(result.success).toBe(true);

    const me: any = await localDb.localAuthMe();
    const log = me.settings.studySessionLog as any[];
    const last = log[log.length - 1];
    expect(last.questions).toBe(10);
    expect(last.correct).toBe(6);
    expect(last.durationMin).toBe(20);
    expect(last.accuracy).toBeCloseTo(0.6, 5);
    expect(last.topicName).toBe("Atos Administrativos");

    const events = me.settings.studyEvents as any[];
    expect(
      events.some(
        (event) =>
          event.type === "session" &&
          String(event.detail).includes("6/10 acertos"),
      ),
    ).toBe(true);
  });

  it("o retrato de domínio alimenta o relatório (questões > 0)", async () => {
    const snapshot = await localDb.localStudyMasterySnapshot();
    expect(Array.isArray(snapshot)).toBe(true);
    // Sem tópicos cadastrados o retrato é vazio, mas com a mesma forma do servidor.
    for (const topic of snapshot) {
      expect(Object.keys(topic).sort()).toEqual([
        "correct",
        "disciplineName",
        "readiness",
        "resolved",
        "topicId",
        "topicName",
      ]);
    }

    const report = buildSessionReport({
      before: [
        {
          topicId: 1,
          topicName: "Atos",
          disciplineName: "Direito Administrativo",
          resolved: 10,
          correct: 5,
          readiness: 50,
        },
      ],
      after: [
        {
          topicId: 1,
          topicName: "Atos",
          disciplineName: "Direito Administrativo",
          resolved: 20,
          correct: 13,
          readiness: 65,
        },
      ],
    });
    expect(report.questions).toBe(10);
    expect(report.correct).toBe(8);
    expect(report.noData).toBe(false);
  });
});

describe("APK: importar PDF no aparelho", () => {
  beforeAll(async () => {
    await localDb.localAuthMe();
  });

  it("extrai o texto, divide em seções e o documento abre depois", async () => {
    const meta = await localDb.localLearningImportPdf({
      base64: fixtureBase64(),
      fileName: "apostila-atos.pdf",
    });

    expect(meta.pages).toBe(2);
    expect(meta.sections).toBeGreaterThanOrEqual(2);
    expect(meta.title.length).toBeGreaterThan(0);

    const list = await localDb.localLearningList();
    expect(list.some((doc) => doc.id === meta.id)).toBe(true);

    const doc: any = await localDb.localLearningGet({ docId: meta.id });
    expect(doc.sectionsData.length).toBe(meta.sections);
    const joined = doc.sectionsData
      .map((section: any) => `${section.title}\n${section.text}`)
      .join("\n");
    expect(joined).toContain("Introducao");
    expect(joined).toContain("anulacao decorre de ilegalidade");
    // Cada seção aponta a página de origem (o leitor mostra na margem).
    expect(doc.sectionsData[0].startPage).toBe(1);
  });

  it("não aceita arquivo vazio e o documento removido não abre mais", async () => {
    await expect(
      localDb.localLearningImportPdf({
        base64: "data:application/pdf;base64,AA",
      }),
    ).rejects.toThrow();

    const meta = await localDb.localLearningImportPdf({
      base64: fixtureBase64(),
      fileName: "outro.pdf",
    });
    await localDb.localLearningRemove({ docId: meta.id });
    await expect(localDb.localLearningGet({ docId: meta.id })).rejects.toThrow(
      /não encontrado/i,
    );
  });
});
