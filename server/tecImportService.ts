/**
 * Serviço de importação TEC Concursos.
 * Extrai lógica de negócio do router, mantendo-o fino.
 *
 * Responsabilidades:
 * - Parsear planilha XLSX
 * - Parsear HTML de scraping
 * - Criar/atualizar disciplinas e tópicos
 * - Salvar snapshot TEC
 * - Ajustar cronograma adaptativo por desempenho
 */

import * as XLSX from "xlsx";
import * as storage from "./jsonStorage";
import type { RevisionInput } from "./jsonStorage";
import {
  buildSchedule,
  formatDateForDb,
  getScheduleParams,
} from "../shared/scheduling";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ImportResult {
  updatedCount: number;
  createdCount: number;
  message: string;
  topicsWithNewErrors: {
    topicId: number;
    topicName: string;
    newErrors: number;
  }[];
}

interface ParsedRow {
  disciplineName: string;
  themeName: string;
  correct: number;
  errors: number;
}

// ─── Utilitários compartilhados ───────────────────────────────────────────────

/** Corrige mojibake: bytes UTF-8 lidos como Latin-1 */
function fixEncoding(str: string): string {
  try {
    let hasHigh = false;
    for (let i = 0; i < str.length; i++) {
      if (str.charCodeAt(i) > 127) {
        hasHigh = true;
        break;
      }
    }
    if (!hasHigh) return str;
    const bytes = Buffer.alloc(str.length);
    for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
    const fixed = bytes.toString("utf8");
    if (!fixed.includes("\ufffd")) return fixed;
  } catch {
    /* fall through */
  }
  return str;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDisciplineForMatch(s: string): string {
  const idx = s.indexOf(" - ");
  return idx >= 0 ? s.slice(idx + 3).trim() : s;
}

// ─── Parser XLSX ──────────────────────────────────────────────────────────────

export function parseXlsxBuffer(buffer: Buffer): ParsedRow[] {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellText: true,
    cellFormula: false,
    codepage: 65001,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Planilha vazia ou inválida");
  const worksheet = workbook.Sheets[sheetName];

  const getCellValue = (
    ws: XLSX.WorkSheet,
    row: number,
    col: number,
  ): string => {
    const addr = XLSX.utils.encode_cell({ r: row, c: col });
    const cell = ws[addr];
    if (!cell) return "";
    let val = "";
    if (cell.t === "s" || cell.t === "inlineStr") val = String(cell.v ?? "");
    else if (cell.v !== undefined) val = String(cell.v);
    else if (cell.w !== undefined) val = String(cell.w);
    return fixEncoding(val).trim();
  };

  const rangeStr = worksheet["!ref"];
  if (!rangeStr) throw new Error("Planilha vazia");
  let range = XLSX.utils.decode_range(rangeStr);

  // Alguns arquivos têm !ref incorreto — varrer para achar o fim real
  if (range.e.r < range.s.r + 1) {
    let lastRow = 0;
    for (let r = 1; r <= 2000; r++) {
      const cell =
        worksheet[XLSX.utils.encode_cell({ r, c: 0 })] ||
        worksheet[XLSX.utils.encode_cell({ r, c: 1 })];
      if (cell && String(cell.w ?? cell.v ?? "").trim()) lastRow = r;
    }
    if (lastRow === 0) throw new Error("Planilha sem dados.");
    range = { s: range.s, e: { r: lastRow, c: Math.max(range.e.c, 6) } };
  }

  // Detectar colunas pelo header
  let colHierarchy = 0,
    colName = 1,
    colCorrect = 4,
    colWrong = 6;
  for (let c = range.s.c; c <= range.e.c; c++) {
    const h = getCellValue(worksheet, range.s.r, c).toLowerCase();
    if (h.includes("hierarquia")) colHierarchy = c;
    else if (h.includes("índice") || h.includes("indice") || h === "disciplina")
      colName = c;
    else if (h.includes("quantidade de acertos") || h === "acertos")
      colCorrect = c;
    else if (h.includes("quantidade de erros") || h === "erros") colWrong = c;
  }

  const rows: ParsedRow[] = [];
  let currentDisciplineName = "";

  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const hierarchyVal = getCellValue(worksheet, r, colHierarchy);
    const nameVal = getCellValue(worksheet, r, colName);
    if (!nameVal) continue;

    const cellAddr = XLSX.utils.encode_cell({ r, c: colHierarchy });
    const rawCell = worksheet[cellAddr];
    const isDisc =
      hierarchyVal === "" ||
      !rawCell ||
      rawCell.v === null ||
      rawCell.v === undefined;

    if (isDisc) {
      currentDisciplineName = nameVal.replace(/\s*\([^)]*\)\s*$/, "").trim();
      continue;
    }

    // Importa apenas tópicos D1 (sem pontos na hierarquia)
    const hierDepth = (hierarchyVal.match(/\./g) ?? []).length + 1;
    if (hierDepth > 1) continue;

    rows.push({
      disciplineName: currentDisciplineName || nameVal,
      themeName: nameVal,
      correct: Math.round(
        parseFloat(getCellValue(worksheet, r, colCorrect)) || 0,
      ),
      errors: Math.round(parseFloat(getCellValue(worksheet, r, colWrong)) || 0),
    });
  }

  return rows;
}

// ─── Parser HTML (scraping) ───────────────────────────────────────────────────

export function parseHtml(html: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  let currentDiscipline = "";
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;

  while ((trMatch = trRegex.exec(html)) !== null) {
    const row = trMatch[1];
    const tds: string[] = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRegex.exec(row)) !== null) {
      const text = tdMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/&#\d+;/g, "")
        .trim();
      tds.push(text);
    }

    if (tds.length >= 4) {
      const nameCol = tds[0] || tds[1] || "";
      const isDisc =
        /data-type=['"]disciplina['"]/i.test(row) ||
        /<(strong|b)>/i.test(row.split("</td>")[0]) ||
        /class=['"][^'"]*disciplina[^'"]*['"]/i.test(row);

      if (isDisc && nameCol) {
        currentDiscipline = nameCol.replace(/\s*\([^)]*\)\s*$/, "").trim();
      } else if (nameCol && currentDiscipline) {
        const nums = tds.filter((t) => /^\d+$/.test(t.trim())).map(Number);
        if (nums.length >= 2) {
          rows.push({
            disciplineName: currentDiscipline,
            themeName: nameCol,
            correct: nums[0],
            errors: nums[1],
          });
        }
      }
    }
  }

  return rows;
}

// ─── Processamento principal ──────────────────────────────────────────────────

async function createTopicWithSchedule(
  userId: string | number,
  disciplineId: number,
  themeName: string,
  studyDate: string,
): Promise<number> {
  const { id: topicId } = await storage.createTopic({
    userId,
    disciplineId,
    name: themeName,
    studyDate,
    notes: null,
  });
  const settings = await storage.getUserSettings(userId);
  const params = getScheduleParams(settings);
  const activities = buildSchedule(new Date(studyDate), params);
  const revisionRecords: RevisionInput[] = activities.map((a) => ({
    userId,
    topicId,
    scheduledDate: formatDateForDb(a.date),
    type: a.type,
    revisionNumber: a.revisionNumber,
    completed: false,
  }));
  await storage.createRevisions(revisionRecords);
  return topicId;
}

export async function processImportRows(
  userId: string | number,
  rows: ParsedRow[],
): Promise<ImportResult> {
  let disciplines = await storage.getDisciplinesByUser(userId);
  let topics = await storage.getTopicsByUser(userId);
  let updatedCount = 0;
  let createdCount = 0;
  const createdDisciplines: string[] = [];
  const createdTopics: string[] = [];
  const topicsWithNewErrors: ImportResult["topicsWithNewErrors"] = [];

  for (const row of rows) {
    const normDisc = normalize(extractDisciplineForMatch(row.disciplineName));

    let discipline = disciplines.find((d) => {
      const n = normalize(d.name);
      return n === normDisc || n.includes(normDisc) || normDisc.includes(n);
    });

    if (!discipline) {
      const { id } = await storage.createDiscipline({
        userId,
        name: row.disciplineName,
        color: "#3B82F6",
        weight: 1,
      });
      disciplines = await storage.getDisciplinesByUser(userId);
      discipline = disciplines.find((d) => d.id === id)!;
      createdDisciplines.push(row.disciplineName);
    }

    const normTheme = normalize(row.themeName);
    let topic = topics.find(
      (t) =>
        t.disciplineId === discipline!.id &&
        (normalize(t.name) === normTheme ||
          (normTheme.length >= 5 && normalize(t.name).startsWith(normTheme))),
    );
    if (!topic && normTheme.length >= 5) {
      const byPrefix = topics.filter(
        (t) =>
          t.disciplineId === discipline!.id &&
          normalize(t.name).startsWith(normTheme),
      );
      if (byPrefix.length === 1) topic = byPrefix[0];
    }

    if (topic) {
      const prevErrors = topic.performance?.errorCount ?? 0;
      const newErrors = row.errors - prevErrors;
      await storage.setTopicPerformance(topic.id, userId, {
        correctCount: row.correct,
        errorCount: row.errors,
      });
      if (newErrors > 0)
        topicsWithNewErrors.push({
          topicId: topic.id,
          topicName: topic.name,
          newErrors,
        });
      updatedCount++;
    } else {
      const studyDate = formatDateForDb(new Date());
      const topicId = await createTopicWithSchedule(
        userId,
        discipline!.id,
        row.themeName,
        studyDate,
      );
      await storage.setTopicPerformance(topicId, userId, {
        correctCount: row.correct,
        errorCount: row.errors,
      });
      topics = await storage.getTopicsByUser(userId);
      createdTopics.push(row.themeName);
      createdCount++;
    }
  }

  // Salvar snapshot TEC
  await saveSnapshot(userId);

  // Ajuste adaptativo de cronograma por desempenho
  await adjustScheduleByPerformance(userId);

  let message = `${updatedCount} tema(s) atualizado(s).`;
  if (createdCount > 0) message += ` ${createdCount} tema(s) criado(s).`;
  if (createdDisciplines.length > 0)
    message += ` Disciplinas criadas: ${[...new Set(createdDisciplines)].join(", ")}.`;
  message += " Snapshot salvo. Cronograma ajustado automaticamente.";

  return { updatedCount, createdCount, message, topicsWithNewErrors };
}

async function saveSnapshot(userId: string | number): Promise<void> {
  const [allTopics, allDiscs] = await Promise.all([
    storage.getTopicsByUser(userId),
    storage.getDisciplinesByUser(userId),
  ]);
  const discById = new Map(allDiscs.map((d) => [d.id, d]));
  const snapshotTopics = allTopics
    .filter((t) => t.performance && t.performance.questionsResolved > 0)
    .map((t) => ({
      topicName: t.name,
      disciplineName: discById.get(t.disciplineId)?.name ?? "Desconhecida",
      questionsResolved: t.performance!.questionsResolved,
      correctCount: t.performance!.correctCount,
      errorCount: t.performance!.errorCount,
      accuracy: t.performance!.accuracy,
    }));
  await storage.saveTecSnapshot(userId, snapshotTopics);
}

async function adjustScheduleByPerformance(
  userId: string | number,
): Promise<void> {
  const [allTopics, allRevisions] = await Promise.all([
    storage.getTopicsByUser(userId),
    storage.getRevisionsByUser(userId),
  ]);

  const topicById = new Map(allTopics.map((t) => [t.id, t]));
  const completedCountByTopic = new Map<number, number>();
  for (const r of allRevisions.filter((r) => r.completed)) {
    completedCountByTopic.set(
      r.topicId,
      (completedCountByTopic.get(r.topicId) ?? 0) + 1,
    );
  }

  const today = new Date();
  const todayStr = formatDateForDb(today);
  const pending = allRevisions.filter((r) => !r.completed && !r.ignored);

  for (const rev of pending) {
    const topic = topicById.get(rev.topicId);
    if (!topic?.performance || topic.performance.questionsResolved < 5)
      continue;
    const acc = topic.performance.accuracy;
    const completedCount = completedCountByTopic.get(rev.topicId) ?? 0;
    const daysFromToday = Math.round(
      (new Date(rev.scheduledDate).getTime() - today.getTime()) / 86_400_000,
    );

    if (acc < 60 && daysFromToday > 2) {
      // Aceleração: reduz à metade (mínimo 1 dia)
      const newDate = new Date(today);
      newDate.setDate(
        today.getDate() + Math.max(1, Math.ceil(daysFromToday / 2)),
      );
      await storage.rescheduleRevision(
        rev.id,
        userId,
        formatDateForDb(newDate),
      );
    } else if (
      acc > 82 &&
      completedCount >= 3 &&
      daysFromToday > 0 &&
      daysFromToday < 30
    ) {
      // Desaceleração: estende 50%
      const newDate = new Date(today);
      newDate.setDate(today.getDate() + Math.round(daysFromToday * 1.5));
      await storage.rescheduleRevision(
        rev.id,
        userId,
        formatDateForDb(newDate),
      );
    }
  }
}
