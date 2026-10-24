// @ts-ignore
import pdf from "pdf-parse/lib/pdf-parse.js";
import { normalizeString } from "../shared/utils";
import { extractJSON } from "./mentorRouter";

export interface EditalInspection {
  title: string;
  pages: number;
  chars: number;
  programChars: number;
  hasProgram: boolean;
  cargos: { id: string; title: string }[];
  sample: string;
}

export interface ParsedEditalTopic {
  id: string;
  discipline: string;
  topic: string;
  completed: boolean;
  isHeader: boolean;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export async function loadEditalText(input: {
  text?: string;
  pdfBase64?: string;
}): Promise<{ text: string; pages: number }> {
  if (input.pdfBase64) {
    const buffer = Buffer.from(input.pdfBase64, "base64");
    const data = await pdf(buffer);
    return { text: data.text || "", pages: Number(data.numpages) || 0 };
  }
  return { text: input.text || "", pages: 0 };
}

function findProgramStart(text: string): number {
  const patterns = [
    /15\s+DOS\s+OBJETOS\s+DE\s+AVALIAÇÃO/i,
    /15\.2\s+CONHECIMENTOS/i,
    /CONHECIMENTOS\s+BÁSICOS/i,
    /CONHECIMENTOS\s+ESPECÍFICOS/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return match.index;
  }
  return -1;
}

function findProgramEnd(text: string, start: number): number {
  const tail = text.slice(start);
  const patterns = [
    /\s16\s+DAS\s+DISPOSIÇÕES/i,
    /\sANEXO\s+I\b/i,
    /\sANEXO\s+II\b/i,
  ];
  let end = tail.length;
  for (const pattern of patterns) {
    const match = pattern.exec(tail);
    if (match && match.index > 500) {
      end = Math.min(end, match.index);
    }
  }
  return start + end;
}

export function extractProgram(text: string): {
  program: string;
  programStart: number;
  hasProgram: boolean;
} {
  const collapsed = collapse(text);
  const start = findProgramStart(collapsed);
  if (start < 0) {
    return { program: collapsed, programStart: 0, hasProgram: false };
  }
  const end = findProgramEnd(collapsed, start);
  return {
    program: collapsed.slice(start, end),
    programStart: start,
    hasProgram: true,
  };
}

export function detectCargos(program: string): { id: string; title: string }[] {
  const cargos: { id: string; title: string }[] = [];
  const seen = new Set<string>();
  const regex = /CARGO\s+(\d+)\s*:\s*([\s\S]{0,220})/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(program)) !== null) {
    const id = `cargo-${match[1]}`;
    if (seen.has(id)) continue;
    const title = collapse(`Cargo ${match[1]}: ${match[2]}`).slice(0, 180);
    seen.add(id);
    cargos.push({ id, title });
  }

  if (cargos.length === 0) {
    const sectionRegex = /15\.2\.\d+\s+CONHECIMENTOS[^.]{0,140}/gi;
    while ((match = sectionRegex.exec(program)) !== null) {
      const title = collapse(match[0]).slice(0, 180);
      const id = `section-${cargos.length}`;
      if (!seen.has(title)) {
        seen.add(title);
        cargos.push({ id, title });
      }
    }
  }
  return cargos;
}

function cargoRanges(
  program: string,
): Array<{ id: string; title: string; start: number; end: number }> {
  const starts: Array<{ id: string; title: string; start: number }> = [];
  const regex = /CARGO\s+(\d+)\s*:/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(program)) !== null) {
    const id = `cargo-${match[1]}`;
    if (starts.some((item) => item.id === id)) continue;
    starts.push({
      id,
      title: collapse(program.slice(match.index, match.index + 190)),
      start: match.index,
    });
  }
  return starts.map((item, index) => ({
    ...item,
    end: starts[index + 1]?.start ?? program.length,
  }));
}

export function selectProgramForRole(program: string, role?: string): string {
  if (!role || !role.trim()) return program;
  const ranges = cargoRanges(program);
  if (ranges.length === 0) return program;

  const roleTokens = normalizeString(role)
    .split(" ")
    .filter((token) => token.length >= 3);
  let best: { range: (typeof ranges)[number]; score: number } | null = null;
  for (const range of ranges) {
    const title = normalizeString(range.title);
    const score = roleTokens.reduce(
      (sum, token) => sum + (title.includes(token) ? 1 : 0),
      0,
    );
    if (!best || score > best.score) best = { range, score };
  }
  if (!best || best.score === 0) return program;

  // Conteúdos básicos/complementares valem para todos os cargos.
  const prefix = program.slice(0, ranges[0].start);
  return collapse(
    `${prefix} ${program.slice(best.range.start, best.range.end)}`,
  );
}

function chunkText(text: string, maxChars = 26000): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length && chunks.length < 8) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const cut = text.lastIndexOf(". ", end);
      if (cut > start + maxChars * 0.55) end = cut + 2;
    }
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks.filter((chunk) => chunk.length > 40);
}

export async function inspectEdital(input: {
  text?: string;
  pdfBase64?: string;
}): Promise<EditalInspection> {
  const { text, pages } = await loadEditalText(input);
  const { program, programStart, hasProgram } = extractProgram(text);
  const cargos = detectCargos(program);
  const title = collapse(text).slice(0, 220);
  return {
    title,
    pages,
    chars: text.length,
    programChars: program.length,
    hasProgram,
    cargos,
    sample: program.slice(0, 600),
  };
}

function buildPrompt(
  chunk: string,
  role: string | undefined,
  chunkIndex: number,
  totalChunks: number,
): string {
  return `Você é um especialista em concursos públicos brasileiros. Sua tarefa é transformar o conteúdo programático de um edital em uma grade de estudos DISCIPLINA → TÓPICO.

CARGO/ESPECIALIDADE PRETENDIDO: ${role || "todos os cargos presentes no trecho"}
TRECHO ${chunkIndex + 1} DE ${totalChunks}:
---
${chunk}
---

REGRAS:
1. Extraia apenas conteúdo programático de estudo. Ignore regras de inscrição, cronograma, requisitos, vagas, datas e demais burocracia.
2. Use o nome da disciplina/área como "discipline" (ex.: "Auditoria Governamental", "Língua Portuguesa", "Ciência de Dados").
3. Use cada tópico numerado ou assunto delimitado como "topic". Se houver subitens, junte em um tópico principal curto e objetivo.
4. NÃO invente conteúdo que não esteja no trecho.
5. Se o trecho não tiver conteúdo programático, retorne [].
6. Se houver vários cargos, considere apenas o cargo pretendido informado acima.

Retorne APENAS um JSON válido, sem markdown:
[{"discipline":"...","topic":"..."}]
`;
}

export async function parseEditalWithAi(params: {
  text: string;
  role?: string;
  apiKey: string;
  provider: "gemini" | "openai" | "claude";
  callAi: (
    provider: "gemini" | "openai" | "claude",
    apiKey: string,
    prompt: string,
    maxTokens: number,
  ) => Promise<string>;
}): Promise<ParsedEditalTopic[]> {
  const { program, hasProgram } = extractProgram(params.text);
  const selected = selectProgramForRole(program, params.role);
  const content = hasProgram ? selected : collapse(params.text);
  const chunks = chunkText(content);
  const seen = new Set<string>();
  const result: ParsedEditalTopic[] = [];

  for (let index = 0; index < chunks.length; index++) {
    const response = await params.callAi(
      params.provider,
      params.apiKey,
      buildPrompt(chunks[index], params.role, index, chunks.length),
      4000,
    );
    const parsed = extractJSON(response) as any;
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.topics)
        ? parsed.topics
        : Array.isArray(parsed?.data)
          ? parsed.data
          : null;
    if (!list) {
      throw new Error("A IA não retornou uma lista de tópicos válida.");
    }
    for (const item of list) {
      const discipline = collapse(String(item?.discipline || ""));
      const topic = collapse(String(item?.topic || ""));
      if (!discipline || !topic || topic.length < 2) continue;
      const key = `${normalizeString(discipline)}::${normalizeString(topic)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        id: `ai-${Date.now()}-${result.length}`,
        discipline,
        topic,
        completed: false,
        isHeader: false,
      });
      if (result.length >= 800) break;
    }
    if (result.length >= 800) break;
  }

  return result;
}
