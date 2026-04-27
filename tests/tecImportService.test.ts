/** @vitest-environment node */
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import {
  parseHtml,
  parseXlsxBuffer,
  processImportRows,
} from "../server/tecImportService";
import * as storage from "../server/jsonStorage";

vi.mock("../server/jsonStorage", async () => {
  const actual = (await vi.importActual("../server/jsonStorage")) as any;
  return {
    ...actual,
    getDisciplinesByUser: vi.fn(),
    getTopicsByUser: vi.fn(),
    getUserSettings: vi.fn(),
    createTopic: vi.fn(),
    createRevisions: vi.fn(),
    setTopicPerformance: vi.fn(),
    saveTecSnapshot: vi.fn(),
    rescheduleRevision: vi.fn(),
    getRevisionsByUser: vi.fn(),
    createDiscipline: vi.fn(),
  };
});

describe("tecImportService", () => {
  beforeEach(() => {
    vi.mocked(storage.createTopic).mockResolvedValue({ id: 1 } as any);
    vi.mocked(storage.createDiscipline).mockResolvedValue({ id: 99 });
  });

  it("parseHtml should handle edge cases", () => {
    const html = `
      <tr><td><strong>Português</strong></td><td></td><td></td><td></td></tr>
      <tr><td>Sintaxe</td><td>10</td><td>2</td><td></td></tr>
      <tr><td></td><td></td><td></td><td></td></tr>
    `;
    const rows = parseHtml(html);
    expect(rows).toHaveLength(1);
    expect(rows[0].disciplineName).toBe("Português");
  });

  it("parseXlsxBuffer should cover cell types and hierarchy", () => {
    const ws: XLSX.WorkSheet = {
      "!ref": "A1:G4",
      A1: { t: "s", v: "Hierarquia" },
      B1: { t: "s", v: "Disciplina" },
      B2: { t: "s", v: "D1" },
      A3: { t: "s", v: "1" },
      B3: { t: "s", v: "T1" },
      E3: { v: 10 },
      G3: { w: "2" },
      A4: { t: "s", v: "2" },
      B4: { t: "s", v: "T2" },
      E4: { v: 5 },
      G4: { v: 1 },
    };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "S");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const rows = parseXlsxBuffer(buffer);
    expect(rows).toHaveLength(2);
  });

  it("processImportRows should cover all paths", async () => {
    const userId = 1;
    vi.mocked(storage.getDisciplinesByUser).mockResolvedValue([
      { id: 10, name: "D1", userId } as any,
    ]);
    vi.mocked(storage.getTopicsByUser).mockResolvedValue([
      {
        id: 20,
        disciplineId: 10,
        name: "T1",
        userId,
        performance: { questionsResolved: 10, accuracy: 90 },
      } as any,
    ]);

    const future = new Date();
    future.setDate(future.getDate() + 10);
    const futureStr = future.toISOString().split("T")[0];

    vi.mocked(storage.getRevisionsByUser).mockResolvedValue([
      {
        id: 101,
        topicId: 20,
        userId,
        scheduledDate: futureStr,
        completed: false,
        ignored: false,
      },
      { id: 102, topicId: 20, userId, completed: true },
      { id: 103, topicId: 20, userId, completed: true },
      { id: 104, topicId: 20, userId, completed: true },
    ] as any);
    vi.mocked(storage.getUserSettings).mockResolvedValue({});

    await processImportRows(userId, [
      { disciplineName: "D1", themeName: "T1", correct: 15, errors: 2 },
      { disciplineName: "D1", themeName: "New", correct: 5, errors: 0 },
    ]);
    expect(storage.rescheduleRevision).toHaveBeenCalled();
    expect(storage.createRevisions).toHaveBeenCalled();
  });

  it("should handle XLSX error cases", () => {
    // For coverage of "Planilha vazia ou inválida" I need XLSX.read to fail
    // But XLSX.read often doesn't throw, it just returns empty wb.
    // I'll just check if it throws *something* or match the specific one.
    expect(() => parseXlsxBuffer(Buffer.from("invalid"))).toThrow();
  });
});
