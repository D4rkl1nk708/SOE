/** @vitest-environment node */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { labRouter } from "../server/labRouter";
import * as storage from "../server/jsonStorage";
import * as db from "../server/db";
import * as ai from "../server/aiProviders";
import fs from "fs";

vi.mock("../server/jsonStorage");
vi.mock("../server/db");
vi.mock("../server/aiProviders");
vi.mock("fs");

// Mock pdf-parse
vi.mock("pdf-parse", () => {
  return vi.fn().mockResolvedValue({
    text:
      "Sample PDF Text with enough content to pass the 100 char limit check. " +
      "X".repeat(100),
  });
});

describe("labRouter procedures", () => {
  const ctx = { user: { id: 1 } };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify([
        {
          statement: "Q1",
          alternatives: { A: "1", B: "2" },
          correctAnswer: "A",
        },
      ]),
    );
    vi.mocked(fs.readdirSync).mockReturnValue(["prova1.json"] as any);
    vi.mocked(fs.statSync).mockReturnValue({ mtime: new Date() } as any);
    vi.mocked(db.getDisciplinesByUser).mockResolvedValue([]);
    vi.mocked(db.getTopicsByUser).mockResolvedValue([]);
    vi.mocked(db.checkExamIntegrated).mockResolvedValue(true);
    vi.mocked(ai.callAiProvider).mockResolvedValue(
      '[{"statement": "Q1", "alternatives": {"A": "1"}, "correctAnswer": "A", "subject": "Math", "topic": "Alg"}]',
    );
  });

  /*
  it("processPdf extracts questions", async () => {
    const caller = labRouter.createCaller(ctx as any);
    const res = await caller.processPdf({ base64: "YmFzZTY0", fileName: "test.pdf", apiKey: "key" });
    expect(res.success).toBe(true);
    expect(res.count).toBe(1);
    expect(fs.writeFileSync).toHaveBeenCalled();
  });
  */

  it("importJson saves file", async () => {
    const caller = labRouter.createCaller(ctx as any);
    const res = await caller.importJson({
      base64: "YmFzZTY0",
      fileName: "test.json",
    });
    expect(res.success).toBe(true);
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it("integrateExam creates disciplines and topics if missing", async () => {
    vi.mocked(db.getDisciplinesByUser).mockResolvedValue([]);
    vi.mocked(db.createDiscipline).mockResolvedValue({ id: 10 } as any);
    vi.mocked(db.createTopic).mockResolvedValue({ id: 20 } as any);

    const caller = labRouter.createCaller(ctx as any);
    const res = await caller.integrateExam({ fileName: "prova1.json" });
    expect(res.success).toBe(true);
    expect(db.saveQuestionError).toHaveBeenCalled();
  });

  it("listHistory returns files with metadata", async () => {
    const caller = labRouter.createCaller(ctx as any);
    const history = await caller.listHistory();
    expect(history.length).toBe(1);
    expect(history[0].name).toBe("prova1.json");
    expect(history[0].isIntegrated).toBe(true);
  });

  it("analyzeBancaTrend calls AI", async () => {
    vi.mocked(ai.callAiProvider).mockResolvedValue("Trend analysis report");
    const caller = labRouter.createCaller(ctx as any);
    const res = await caller.analyzeBancaTrend({
      fileNames: ["prova1.json"],
      apiKey: "key",
      provider: "openai",
    });
    expect(res.analysis).toBe("Trend analysis report");
  });

  it("mapToEdital matches questions to topics", async () => {
    vi.mocked(ai.callAiProvider).mockResolvedValue('{"mapping": []}');
    const caller = labRouter.createCaller(ctx as any);
    const res = await caller.mapToEdital({
      fileName: "prova1.json",
      apiKey: "key",
      provider: "openai",
    });
    expect(res.mapping).toBeDefined();
  });

  it("searchOnlineExams returns results from Google", async () => {
    const mockHtml = '<a href="/url?q=https://site.com/prova.pdf">Link</a>';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockHtml),
    } as any);

    const caller = labRouter.createCaller(ctx as any);
    const results = await caller.searchOnlineExams({
      banca: "CESPE",
      cargo: "PF",
      ano: "2024",
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].url).toContain("prova.pdf");
  });

  it("downloadFromUrl fetches and converts to base64", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
    } as any);

    const caller = labRouter.createCaller(ctx as any);
    const res = await caller.downloadFromUrl({
      url: "https://site.com/prova.pdf",
      fileName: "prova.pdf",
    });
    expect(res.base64).toBeDefined();
    expect(res.fileName).toBe("prova.pdf");
  });
});
