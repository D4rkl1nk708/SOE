/**
 * Núcleo canônico de captura do TEC Concursos.
 *
 * Roda de duas formas:
 *  - importado pelos testes (TypeScript puro, sem dependências de Node);
 *  - embutido nos 4 scripts injetados (electron/tec-content.js,
 *    electron/tec-preload.cjs, android/.../tec-content.js,
 *    chrome-extension/src/content.js) por scripts/sync-tec-core.mjs.
 *
 * REGRA DE OURO: nada aqui faz requisição, clique, scroll ou navegação.
 * A captura é 100% passiva: lê o DOM que a página já renderizou.
 */

import { cleanLabel, isGenericLabel, normalizeLabel } from "./tecLabels";

export { cleanLabel, isGenericLabel, normalizeLabel } from "./tecLabels";

export type AnswerKind = "correct" | "wrong" | null;
export type IdSource = "header" | "attribute" | "url" | null;

export interface TecHeader {
  disciplina: string;
  assunto: string;
}

export interface QuestionIdInfo {
  questionId: string | null;
  source: IdSource;
}

export interface TecAlternative {
  letter: string;
  text: string;
}

export interface TecLocationLike {
  pathname: string;
  search: string;
  href: string;
}

export interface TecElementLike {
  innerText?: string;
  textContent?: string | null;
  getAttribute?: (name: string) => string | null;
  querySelector?: (selector: string) => TecElementLike | null;
  querySelectorAll?: (selector: string) => ArrayLike<TecElementLike>;
  contains?: (other: TecElementLike) => boolean;
}

export interface TecDocumentLike {
  body?: TecElementLike | null;
  querySelector?: (selector: string) => TecElementLike | null;
  querySelectorAll?: (selector: string) => ArrayLike<TecElementLike>;
}

export interface CaptureSnapshot {
  bodyText: string;
  doc: TecDocumentLike | null;
  location: TecLocationLike;
  now?: number;
}

export interface CaptureEvent {
  kind: Exclude<AnswerKind, null>;
  questionId: string | null;
  disciplina: string;
  assunto: string;
  questionLabel: string;
  statement: string;
  alternatives: TecAlternative[];
  correctAnswer: string;
  userAnswer: string;
  resolution: string;
  banca: string;
  year: number;
  contest: string;
  timeSpentSeconds: number;
  signature: string;
  dedupKey: string;
  transitionCount: number;
  statementPending: boolean;
}

export interface WrongQuestionInput {
  bodyText: string;
  doc?: TecDocumentLike | null;
  questionId?: string | null;
  disciplina?: string;
  assunto?: string;
  banca?: string;
  year?: number;
  contest?: string;
  dedupKey?: string;
}

export interface WrongQuestionPayload {
  questionId: string;
  banca: string;
  year: number;
  contest: string;
  statement: string;
  alternatives: TecAlternative[];
  correctAnswer: string;
  userAnswer: string;
  resolution: string;
  disciplina: string;
  assunto: string;
  timeSpentSeconds?: number;
  statementPending?: true;
}

export interface CaptureEngineOptions {
  maxSeconds?: number;
  now?: () => number;
}

export interface InstallTecCaptureOptions {
  win: any;
  doc: any;
  loc: TecLocationLike;
  storage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  } | null;
  post: (message: any) => void;
  cadernoId?: string | null;
  getBanca?: (() => string | null) | null;
  onEvent?: ((event: CaptureEvent) => void) | null;
  onUrlChange?: (() => void) | null;
  pollMs?: number;
  debounceMs?: number;
  maxSeconds?: number;
  now?: () => number;
}

export interface CaptureHandle {
  scrape: () => CaptureEvent | null;
  engine: ReturnType<typeof createCaptureEngine>;
  stop: () => void;
}

// ─── utilidades de texto ────────────────────────────────────────────────────

const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TBODY",
  "TD",
  "TFOOT",
  "TH",
  "THEAD",
  "TR",
  "UL",
]);

function normalizeNewlines(value: unknown): string {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type TextNodeLike = {
  nodeType?: number;
  tagName?: string;
  textContent?: string | null;
  childNodes?: ArrayLike<TextNodeLike>;
};

/**
 * innerText confiável: o happy-dom concatena nós sem quebra de linha (e no
 * navegador innerText depende de layout). Este walker usa a árvore real e
 * insere \n em elementos de bloco — igual ao que o usuário vê.
 */
export function elementText(el: TecElementLike | null | undefined): string {
  if (!el) return "";
  const node = el as unknown as TextNodeLike;
  if (!node.childNodes || typeof node.childNodes.length !== "number") {
    try {
      const inner = (el as TecElementLike).innerText;
      if (typeof inner === "string" && inner.trim())
        return normalizeNewlines(inner);
    } catch (_) {
      /* ignore */
    }
    return normalizeNewlines((el as TecElementLike).textContent ?? "");
  }

  const parts: string[] = [];
  const walk = (current: TextNodeLike): void => {
    if (current.nodeType === 3) {
      parts.push(current.textContent ?? "");
      return;
    }
    if (current.nodeType !== 1) return;
    const tag = String(current.tagName ?? "").toUpperCase();
    if (tag === "BR") {
      parts.push("\n");
      return;
    }
    const block = BLOCK_TAGS.has(tag);
    if (block && parts.length > 0) parts.push("\n");
    const kids = current.childNodes;
    if (kids) for (let i = 0; i < kids.length; i += 1) walk(kids[i]);
    if (block) parts.push("\n");
  };
  walk(node);
  return normalizeNewlines(parts.join(""));
}

function safeQuery(
  doc: TecDocumentLike | null | undefined,
  selector: string,
): TecElementLike | null {
  if (!doc || typeof doc.querySelector !== "function") return null;
  try {
    return doc.querySelector(selector);
  } catch (_) {
    return null;
  }
}

function safeQueryAll(
  doc: TecDocumentLike | null | undefined,
  selector: string,
): TecElementLike[] {
  if (!doc || typeof doc.querySelectorAll !== "function") return [];
  try {
    return Array.from(
      doc.querySelectorAll(selector) as ArrayLike<TecElementLike>,
    );
  } catch (_) {
    return [];
  }
}

// ─── cabeçalho (disciplina / assunto) ───────────────────────────────────────

const LABEL_LINE = /(?:^|\n)\s*(?:mat[eé]ria|disciplina)\s*:\s*([^\n]+)/i;
const TOPIC_LINE =
  /(?:^|\n)\s*(?:assunto|t[oó]pico|conte[uú]do)\s*:\s*([^\n]+)/i;

/**
 * Extrai disciplina/assunto do cabeçalho, descartando rótulos de navegação
 * ("Matéria: Desenvolvimento / Assunto: Blog" é conteúdo do site, não prova).
 */
export function parseTecHeader(
  bodyText: string,
  doc?: TecDocumentLike | null,
): TecHeader {
  const text = normalizeNewlines(bodyText);

  const candidates: Array<{ disciplina: string; assunto: string }> = [];

  // 1. Formato em uma linha: "Matéria: X / Assunto: Y" (com ou sem a barra)
  const inline =
    text.match(/mat[eé]ria\s*:\s*([^\n/]+?)\s*\/\s*assunto\s*:\s*([^\n]+)/i) ??
    text.match(/mat[eé]ria\s*:\s*([^\n]+?)\s+assunto\s*:\s*([^\n]+)/i);
  if (inline) {
    candidates.push({
      disciplina: cleanLabel(inline[1]),
      assunto: cleanLabel(inline[2]),
    });
  }

  // 2. Linhas separadas "Matéria: X" e "Assunto: Y"
  const materia = text.match(LABEL_LINE);
  const assunto = text.match(TOPIC_LINE);
  if (materia || assunto) {
    candidates.push({
      disciplina: cleanLabel(materia?.[1] ?? ""),
      assunto: cleanLabel(assunto?.[1] ?? ""),
    });
  }

  // 3. Seletores do DOM (layout React/Vue e mobile)
  const matEl =
    safeQuery(
      doc,
      '[data-materia], [data-disciplina], .question-subject, .q-disciplina, [class*="materia"], [class*="disciplina"]',
    ) ?? null;
  const assEl =
    safeQuery(
      doc,
      '[data-assunto], [data-topico], .question-topic, .q-assunto, [class*="assunto"], [class*="topico"]',
    ) ?? null;
  if (matEl || assEl) {
    candidates.push({
      disciplina: cleanLabel(elementText(matEl)),
      assunto: cleanLabel(elementText(assEl)),
    });
  }

  // 4. Breadcrumb "Disciplina > Assunto"
  const crumbs = safeQueryAll(
    doc,
    '[class*="breadcrumb"] a, [class*="breadcrumb"] span, [aria-label*="breadcrumb"] a, nav a',
  )
    .map((el) => cleanLabel(elementText(el)))
    .filter((label) => label.length > 2 && !isGenericLabel(label));
  if (crumbs.length >= 2) {
    candidates.push({
      disciplina: crumbs[0],
      assunto: crumbs[crumbs.length - 1],
    });
  }

  // 5. "Disciplina: X" + "Tópico: Y"
  const disc = text.match(/(?:^|\n)\s*disciplina\s*:\s*([^\n/]+)/i);
  const topico = text.match(/(?:^|\n)\s*t[oó]pico\s*:\s*([^\n]+)/i);
  if (disc || topico) {
    candidates.push({
      disciplina: cleanLabel(disc?.[1] ?? ""),
      assunto: cleanLabel(topico?.[1] ?? ""),
    });
  }

  // Prefere um candidato com os DOIS campos; se nenhum tiver, aceita o
  // primeiro parcial (melhor que perder um assunto válido por falta do outro).
  let partial: TecHeader | null = null;
  for (const candidate of candidates) {
    const disciplina = isGenericLabel(candidate.disciplina)
      ? ""
      : candidate.disciplina;
    const topico = isGenericLabel(candidate.assunto) ? "" : candidate.assunto;
    if (disciplina && topico) return { disciplina, assunto: topico };
    if (!partial && (disciplina || topico)) {
      partial = { disciplina, assunto: topico };
    }
  }

  return partial ?? { disciplina: "", assunto: "" };
}

// ─── resultado (acertou / errou) ────────────────────────────────────────────

const CORRECT_SELECTORS = [
  '[data-result="correct"]',
  "[data-acertou]",
  ".q-status-correct",
  ".feedback-success",
  ".resultado-acerto",
  '[class*="acertou"]',
  '[class*="resultado-correto"]',
  '[class*="resposta-correta"]',
];

const WRONG_SELECTORS = [
  '[data-result="wrong"]',
  "[data-errou]",
  ".q-status-wrong",
  ".feedback-error",
  ".resultado-erro",
  '[class*="errou"]',
  '[class*="resultado-errado"]',
  '[class*="resposta-errada"]',
];

function kindFromText(text: string): AnswerKind {
  const correctAt = Math.max(
    text.search(/voc[eê]\s+acertou/i),
    text.search(/resposta\s+correta/i),
    text.search(/alternativa\s+correta/i),
    text.search(/gabarito\s*:\s*certo/i),
  );
  const wrongAt = Math.max(
    text.search(/voc[eê]\s+errou/i),
    text.search(/resposta\s+errada/i),
    text.search(/alternativa\s+incorreta/i),
    text.search(/gabarito\s*:\s*errado/i),
  );
  if (correctAt < 0 && wrongAt < 0) return null;
  if (wrongAt > correctAt) return "wrong";
  if (correctAt > wrongAt) return "correct";
  return null;
}

/**
 * Detecta o banner "Você acertou!/Você errou!" — funciona mesmo quando a
 * resposta não dispara nenhuma requisição (o bug original só olhava o fetch).
 */
export function extractAnswerResult(
  bodyText: string,
  doc?: TecDocumentLike | null,
): { kind: AnswerKind } {
  const fromText = kindFromText(normalizeNewlines(bodyText));
  if (fromText) return { kind: fromText };

  for (const selector of CORRECT_SELECTORS) {
    const el = safeQuery(doc, selector);
    if (!el) continue;
    if (kindFromText(elementText(el)) === "correct") return { kind: "correct" };
  }
  for (const selector of WRONG_SELECTORS) {
    const el = safeQuery(doc, selector);
    if (!el) continue;
    if (kindFromText(elementText(el)) === "wrong") return { kind: "wrong" };
  }
  return { kind: null };
}

// ─── enunciado ──────────────────────────────────────────────────────────────

const STATEMENT_SELECTORS = [
  '[class*="enunciado"]',
  '[id*="enunciado"]',
  '[data-testid*="enunciado"]',
  '[class*="texto-questao"]',
  '[class*="texto_questao"]',
  '[class*="corpo-questao"]',
  '[class*="corpo_questao"]',
  '[class*="statement"]',
  '[class*="question-text"]',
  '[class*="questao-texto"]',
  ".q-text",
  '[class*="texto-apoio"]',
  "article",
];

const ALTERNATIVE_CUT = /(?:^|\n)\s*(?:\(\s*[A-E]\s*\)|[A-E]\s*[).:\-–])\s+/m;
const RESULT_CUT =
  /(?:^|\n|\s)(?:voc[eê]\s+acertou|voc[eê]\s+errou|gabarito\s*:|resolu[cç][aã]o\s+do\s+professor|coment[aá]rios\s+da\s+comunidade|f[oó]rum)/i;
const META_LINE =
  /^(?:[-–—•·]\s*)?(?:mat[eé]ria|disciplina|assunto|t[oó]pico|conte[uú]do|banca|ano|[oó]rg[aã]o|prova|cargo|institui[cç][aã]o|esfera|dificuldade)\s*:/i;
const YEAR_LINE =
  /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 .&/'()-]{2,60}\s*[-–]\s*(?:19|20)\d{2}\b/;

function cleanStatement(value: string): string {
  let text = normalizeNewlines(value);
  // "Questão #12345 Banca - Ano - Órgão" ou "#12345 ..."
  text = text.replace(/^(?:quest[aã]o\s*)?#\s*\d{2,9}[^\n]*\n?/i, "");
  const lines = text.split("\n");
  while (lines.length > 0) {
    const first = lines[0].trim();
    if (!first || META_LINE.test(first) || YEAR_LINE.test(first)) {
      lines.shift();
      continue;
    }
    break;
  }
  text = lines.join("\n");
  const resultCut = text.search(RESULT_CUT);
  if (resultCut > 0) text = text.slice(0, resultCut);
  return text.replace(/\s+/g, " ").trim().slice(0, 2000);
}

function firstChunkAfter(text: string, index: number, length: number): string {
  const rest = text.slice(index + length);
  const newline = rest.indexOf("\n");
  const chunk = newline >= 0 ? rest.slice(newline + 1) : "";
  const alt = chunk.search(ALTERNATIVE_CUT);
  return alt >= 0 ? chunk.slice(0, alt) : chunk;
}

/**
 * Enunciado da questão. Selectors primeiro; depois texto entre "#id" e a
 * primeira alternativa; depois entre "Matéria:/Assunto:" e a primeira.
 */
export function extractStatement(
  doc?: TecDocumentLike | null,
  bodyText?: string,
): string {
  for (const selector of STATEMENT_SELECTORS) {
    for (const el of safeQueryAll(doc, selector)) {
      const text = cleanStatement(elementText(el));
      if (text.length >= 25 && !/^\(?\s*[A-E]\s*[).:\-]\s/.test(text))
        return text;
    }
  }

  const text = normalizeNewlines(bodyText ?? "");
  if (!text) return "";

  const idMatch = text.match(/#\s*\d{2,9}\b/);
  if (idMatch && idMatch.index !== undefined) {
    const chunk = cleanStatement(
      firstChunkAfter(text, idMatch.index, idMatch[0].length),
    );
    if (chunk.length >= 25) return chunk;
  }

  const headerMatch =
    text.match(/(?:^|\n)\s*(?:assunto|t[oó]pico)\s*:\s*[^\n]*/i) ??
    text.match(/(?:^|\n)\s*mat[eé]ria\s*:\s*[^\n]*/i);
  if (headerMatch && headerMatch.index !== undefined) {
    const chunk = cleanStatement(
      firstChunkAfter(text, headerMatch.index, headerMatch[0].length),
    );
    if (chunk.length >= 25) return chunk;
  }

  return "";
}

// ─── alternativas ───────────────────────────────────────────────────────────

const ALTERNATIVE_SELECTORS = [
  '[class*="alternativa"]',
  '[class*="opcao"]',
  '[class*="option-item"]',
  ".q-option",
  'li[class*="option"]',
  "[data-alternativa]",
];

const LETTER_PREFIX = /^\s*\(?([A-E])\s*[).:\-–]\s*([\s\S]+)$/;
const LETTER_SPACE_PREFIX = /^\s*([A-E])\s+([\s\S]+)$/;

function altTextFromElement(el: TecElementLike): string {
  const letterEl =
    el.querySelector?.(
      '[class*="letra"], [class*="letter"], [data-letter], b, strong',
    ) ?? null;
  if (letterEl) {
    const letterRaw = normalizeNewlines(elementText(letterEl))
      .trim()
      .toUpperCase();
    if (/^[A-E]$/.test(letterRaw)) {
      const full = elementText(el);
      const withoutLetter = full
        .replace(/^\s*\(?[A-E]\)?\s*[).:\-–]?\s*/, "")
        .trim();
      if (withoutLetter) return withoutLetter;
    }
  }
  return "";
}

export function extractAlternatives(
  doc?: TecDocumentLike | null,
  bodyText?: string,
): TecAlternative[] {
  const result: TecAlternative[] = [];
  const seen = new Set<string>();

  for (const selector of ALTERNATIVE_SELECTORS) {
    const elements = safeQueryAll(doc, selector);
    if (elements.length === 0) continue;
    // Só folhas: "ul.alternativas" também casa com "[class*=alternativa]".
    const leaves = elements.filter(
      (el) =>
        !elements.some(
          (other) =>
            other !== el &&
            typeof el.contains === "function" &&
            el.contains(other),
        ),
    );
    for (const el of leaves.length > 0 ? leaves : elements) {
      const text = normalizeNewlines(elementText(el)).trim();
      if (!text) continue;
      const prefixed =
        text.match(LETTER_PREFIX) ?? text.match(LETTER_SPACE_PREFIX);
      let letter = "";
      let alternativeText = "";
      if (prefixed) {
        letter = prefixed[1].toUpperCase();
        alternativeText = prefixed[2].trim();
      } else {
        const fromChild = altTextFromElement(el);
        if (fromChild) {
          const childLetter = normalizeNewlines(elementText(el))
            .trim()
            .toUpperCase()
            .charAt(0);
          letter = /^[A-E]$/.test(childLetter) ? childLetter : "";
          alternativeText = fromChild;
        }
      }
      if (!letter || !alternativeText) continue;
      if (alternativeText.length > 1200)
        alternativeText = alternativeText.slice(0, 1200);
      const key = letter + "|" + normalizeLabel(alternativeText).slice(0, 120);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ letter, text: alternativeText });
    }
    if (result.length >= 2) break;
  }

  if (result.length < 2) {
    const text = normalizeNewlines(bodyText ?? "");
    const regex = /(?:^|\n)\s*\(?([A-E])\)?\s*[).:\-–]\s+([^\n]+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const letter = match[1].toUpperCase();
      const alternativeText = match[2].trim();
      if (!alternativeText) continue;
      const key = letter + "|" + normalizeLabel(alternativeText).slice(0, 120);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ letter, text: alternativeText });
    }
  }

  if (result.length < 2) {
    const text = normalizeNewlines(bodyText ?? "");
    if (/\bCerto\b/i.test(text) && /\bErrado\b/i.test(text)) {
      return [
        { letter: "C", text: "Certo" },
        { letter: "E", text: "Errado" },
      ];
    }
  }

  result.sort((a, b) => a.letter.localeCompare(b.letter));
  return result;
}

// ─── identidade ─────────────────────────────────────────────────────────────

const ATTRIBUTE_SELECTORS = [
  "[data-questao-id]",
  "[data-question-id]",
  "[data-questao]",
  "[data-question]",
  "[data-id]",
];

function numericId(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  return /^\d{3,9}$/.test(raw) ? raw : null;
}

/**
 * Identidade da questão, na ordem: "#id" do cabeçalho → atributos do DOM →
 * URL (/questoes/<id>, ?questao=<id>, último segmento numérico).
 * A URL sozinha NUNCA é identidade (na SPA ela não muda entre questões).
 */
export function extractQuestionId(
  bodyText: string,
  doc?: TecDocumentLike | null,
  loc?: TecLocationLike | null,
): QuestionIdInfo {
  const text = normalizeNewlines(bodyText);
  const header =
    text.match(/(?:^|\n)\s*(?:quest[aã]o\s*)?#\s*(\d{3,9})\b/i) ??
    text.match(/#\s*(\d{3,9})\b/);
  if (header) return { questionId: header[1], source: "header" };

  for (const selector of ATTRIBUTE_SELECTORS) {
    const el = safeQuery(doc, selector);
    if (!el || typeof el.getAttribute !== "function") continue;
    const value = numericId(el.getAttribute("data-questao-id"));
    const questionId =
      value ??
      numericId(el.getAttribute("data-question-id")) ??
      numericId(el.getAttribute("data-questao")) ??
      numericId(el.getAttribute("data-question")) ??
      numericId(el.getAttribute("data-id"));
    if (questionId) return { questionId, source: "attribute" };
  }

  const pathname = String(loc?.pathname ?? "");
  const search = String(loc?.search ?? "");
  const fromPath = pathname.match(/\/quest(?:ao|oes|ão|ões)\/(\d{3,9})\b/i);
  if (fromPath) return { questionId: fromPath[1], source: "url" };
  const fromQuery = search.match(/[?&]quest(?:ao|ão)=(\d{3,9})\b/i);
  if (fromQuery) return { questionId: fromQuery[1], source: "url" };
  const trailing = pathname.match(/\/(\d{4,9})\/?$/);
  if (trailing) return { questionId: trailing[1], source: "url" };

  return { questionId: null, source: null };
}

export function stableHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

export function normalizeSnippet(value: unknown): string {
  return String(value ?? "")
    .replace(/voc[eê] (acertou|errou)!?/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export interface SignatureInput {
  questionId?: string | null;
  disciplina?: string;
  assunto?: string;
  snippet?: string;
  transitionCount?: number;
  pathname?: string;
}

/**
 * Assinatura estável. Nunca depende apenas da URL: quando não há id nem
 * enunciado >= 60 chars, usa o contador de transição de DOM, que avança a
 * cada nova questão (banner some / enunciado muda). Duas questões na mesma
 * URL sempre geram assinaturas diferentes.
 */
export function buildQuestionSignature(input: SignatureInput): string {
  const questionId = input.questionId ? String(input.questionId) : "";
  if (questionId) return "qid:" + questionId;

  const snippet = normalizeSnippet(input.snippet ?? "");
  if (snippet.length >= 60) {
    return (
      "stmt:" +
      stableHash(
        (input.disciplina || "") +
          "|" +
          (input.assunto || "") +
          "|" +
          snippet.slice(0, 400),
      )
    );
  }

  return (
    "ass:" +
    stableHash(
      (input.disciplina || "") +
        "|" +
        (input.assunto || "") +
        "|" +
        (input.pathname || "") +
        "|" +
        String(input.transitionCount ?? 0),
    )
  );
}

// ─── motor de captura ───────────────────────────────────────────────────────

const DEFAULT_MAX_SECONDS = 600;

/**
 * Máquina de estados da captura.
 *
 * - "sem resultado → com resultado" é a transição que conta a resposta;
 * - a mesma questão re-renderizada não conta de novo (assinatura na memória);
 * - o relógio começa quando a questão aparece e NUNCA é zerado por mudança de
 *   URL (só quando outra questão é identificada de fato).
 */
export function createCaptureEngine(options: CaptureEngineOptions = {}) {
  const maxSeconds = Number.isFinite(options.maxSeconds)
    ? Math.max(1, Number(options.maxSeconds))
    : DEFAULT_MAX_SECONDS;
  const clock = options.now ?? (() => Date.now());

  let questionStartAt: number | null = null;
  let lastIdentityKey = "";
  let lastResultKind: AnswerKind = null;
  let transitionCount = 0;
  let resultBaseline: AnswerKind = null;
  const counted = new Set<string>();

  function ingest(snapshot: CaptureSnapshot): CaptureEvent | null {
    const nowMs = typeof snapshot.now === "number" ? snapshot.now : clock();
    const bodyText = String(snapshot.bodyText ?? "");
    const doc = snapshot.doc ?? null;
    const loc = snapshot.location ?? { pathname: "", search: "", href: "" };

    const header = parseTecHeader(bodyText, doc);
    const idInfo = extractQuestionId(bodyText, doc, loc);
    const statement = extractStatement(doc, bodyText);
    const result = extractAnswerResult(bodyText, doc);
    const snippet = normalizeSnippet(statement);

    const identityKey = idInfo.questionId
      ? "qid:" + idInfo.questionId
      : snippet.length >= 20
        ? "stmt:" + snippet.slice(0, 300)
        : "";

    if (identityKey && identityKey !== lastIdentityKey) {
      if (lastIdentityKey) transitionCount += 1;
      lastIdentityKey = identityKey;
      questionStartAt = nowMs;
      // Um banner que já estava visível quando a questão trocou é da anterior.
      resultBaseline = result.kind;
    } else if (!identityKey && lastResultKind && !result.kind) {
      // Sem id e sem enunciado: banner sumiu depois de contabilizado → próxima.
      transitionCount += 1;
      questionStartAt = nowMs;
      resultBaseline = null;
    }

    if (
      questionStartAt === null &&
      (identityKey || result.kind || bodyText.trim())
    ) {
      questionStartAt = nowMs;
    }

    if (!result.kind) {
      lastResultKind = null;
      return null;
    }

    // Banner antigo ainda na tela no instante em que a questão mudou.
    if (resultBaseline && resultBaseline === result.kind) {
      lastResultKind = result.kind;
      return null;
    }

    const signature = buildQuestionSignature({
      questionId: idInfo.questionId,
      disciplina: header.disciplina,
      assunto: header.assunto,
      snippet,
      transitionCount,
      pathname: loc.pathname,
    });

    if (counted.has(signature)) {
      lastResultKind = result.kind;
      return null;
    }

    const startedAt = questionStartAt ?? nowMs;
    const rawSeconds = Math.floor((nowMs - startedAt) / 1000);
    const timeSpentSeconds = Math.min(maxSeconds, Math.max(1, rawSeconds));

    counted.add(signature);
    lastResultKind = result.kind;
    resultBaseline = result.kind;

    const alternatives = extractAlternatives(doc, bodyText);
    const meta = extractQuestionMeta(bodyText);

    return {
      kind: result.kind,
      questionId: idInfo.questionId,
      disciplina: header.disciplina,
      assunto: header.assunto,
      questionLabel: header.assunto,
      statement,
      alternatives,
      correctAnswer: meta.correctAnswer,
      userAnswer: meta.userAnswer,
      resolution: meta.resolution,
      banca: meta.banca,
      year: meta.year,
      contest: meta.contest,
      timeSpentSeconds,
      signature,
      dedupKey: idInfo.questionId || signature,
      transitionCount,
      statementPending: !statement || statement.length < 5,
    };
  }

  return {
    ingest,
    state: () => ({
      questionStartAt,
      lastIdentityKey,
      lastResultKind,
      transitionCount,
      counted: counted.size,
    }),
  };
}

// ─── metadados da questão ───────────────────────────────────────────────────

function extractQuestionMeta(bodyText: string): {
  banca: string;
  year: number;
  contest: string;
  correctAnswer: string;
  userAnswer: string;
  resolution: string;
} {
  const text = normalizeNewlines(bodyText);
  const currentYear = new Date().getFullYear();
  const header = text.match(
    /#\s*\d{2,9}\s+([^\n-]+?)\s*(?:-\s*((?:19|20)\d{2}))?\s*(?:-\s*([^\n]+))?/,
  );
  const banca = header?.[1]?.trim() ?? "";
  const year = header?.[2] ? parseInt(header[2], 10) : currentYear;
  const contest = header?.[3]?.trim() ?? "";

  let correctAnswer = "";
  const gabarito = text.match(
    /(?:gabarito|resposta\s+correta|a\s+correta\s+[eé])\s*:\s*\(?([A-E]|Certo|Errado)\b/i,
  );
  if (gabarito) {
    correctAnswer = /^certo$/i.test(gabarito[1])
      ? "C"
      : /^errado$/i.test(gabarito[1])
        ? "E"
        : gabarito[1].toUpperCase().charAt(0);
  }

  let userAnswer = "";
  const escolha = text.match(
    /(?:sua\s+resposta|voc[eê]\s+marcou|voc[eê]\s+selecionou|sua\s+escolha)\s*:\s*\(?([A-E]|Certo|Errado)\b/i,
  );
  if (escolha) {
    userAnswer = /^certo$/i.test(escolha[1])
      ? "C"
      : /^errado$/i.test(escolha[1])
        ? "E"
        : escolha[1].toUpperCase().charAt(0);
  }

  return { banca, year, contest, correctAnswer, userAnswer, resolution: "" };
}

// ─── questão errada (Caderno de Erros) ──────────────────────────────────────

/**
 * Monta o payload do Caderno de Erros. Se o enunciado não for encontrado de
 * jeito nenhum NÃO inventa "Questão #..." — envia statement vazio com
 * statementPending: true para o servidor marcar como pendente.
 */
export function scrapeWrongQuestion(
  input: WrongQuestionInput,
): WrongQuestionPayload {
  const doc = input.doc ?? null;
  const bodyText = normalizeNewlines(input.bodyText ?? "");
  const meta = extractQuestionMeta(bodyText);

  let questionId = String(input.questionId ?? "").trim();
  if (!questionId) {
    const idMatch =
      bodyText.match(/#\s*(\d{2,9})\b/) ??
      String(input.dedupKey ?? "").match(/^(\d+)$/);
    if (idMatch) questionId = idMatch[1];
  }

  let statement = extractStatement(doc, bodyText);
  if (!statement) {
    // fallback manual: entre "Matéria:/Assunto:" e "Você errou!/Gabarito:"
    const assuntoLine = bodyText.match(/(?:^|\n)\s*assunto\s*:\s*[^\n]*/i);
    if (assuntoLine && assuntoLine.index !== undefined) {
      const chunk = cleanStatement(
        firstChunkAfter(bodyText, assuntoLine.index, assuntoLine[0].length),
      );
      if (chunk.length >= 25) statement = chunk;
    }
  }

  const alternatives = extractAlternatives(doc, bodyText);

  // Alternativas clicadas: classes de "marcada"/"selecionada"
  let correctAnswer = meta.correctAnswer;
  let userAnswer = meta.userAnswer;
  if (doc) {
    const correctEl = safeQuery(
      doc,
      '[class*="correta"]:not([class*="incorreta"]), [class*="gabarito"], .opcao-certa, .is-correct, [data-correct="true"]',
    );
    if (correctEl && !correctAnswer) {
      const letter = elementText(correctEl)
        .trim()
        .match(/\(?([A-E])\b/);
      if (letter) correctAnswer = letter[1].toUpperCase();
    }
    const userEl = safeQuery(
      doc,
      '[class*="marcada"], [class*="selecionada"], [class*="user-choice"], input[type="radio"]:checked, [aria-checked="true"]',
    );
    if (userEl && !userAnswer) {
      const letter = elementText(userEl)
        .trim()
        .match(/\(?([A-E])\b/);
      if (letter) userAnswer = letter[1].toUpperCase();
    }
    const resolutionEl = safeQuery(
      doc,
      '.resolucao-professor, .resolucao, [class*="resolution"], [class*="resolucao"], .feedback-prof',
    );
    if (resolutionEl) {
      meta.resolution = normalizeNewlines(elementText(resolutionEl))
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  const payload: WrongQuestionPayload = {
    questionId: questionId || String(input.dedupKey ?? "") || "unknown",
    banca: input.banca ?? meta.banca,
    year: input.year ?? meta.year,
    contest: input.contest ?? meta.contest,
    statement,
    alternatives,
    correctAnswer,
    userAnswer,
    resolution: meta.resolution,
    disciplina: input.disciplina ?? "",
    assunto: input.assunto ?? "",
  };

  if (!statement) {
    payload.statement = "";
    payload.statementPending = true;
  }

  return payload;
}

// ─── instalação nos scripts injetados ───────────────────────────────────────

function sanitizeStorageKey(value: string): string {
  return String(value || "unknown")
    .replace(/[^a-z0-9]/gi, "_")
    .slice(0, 80);
}

function bodyTextOf(doc: any): string {
  const body = doc?.body;
  if (!body) return "";
  try {
    const text =
      typeof body.innerText === "string" && body.innerText.trim()
        ? body.innerText
        : body.textContent;
    return String(text ?? "");
  } catch (_) {
    return "";
  }
}

/**
 * Liga a captura passiva: MutationObserver + poll + clique + SOE_FORCE_SCRAPE.
 * Não dispara nenhuma requisição. Emite SOE_TEC_INCREMENT_STATS,
 * SOE_TEC_BANCA_INCREMENT e SOE_TEC_WRONG_QUESTION via `post`.
 */
export function installTecCapture(
  options: InstallTecCaptureOptions,
): CaptureHandle {
  const win = options.win;
  const doc = options.doc;
  const loc = options.loc;
  const storage = options.storage ?? null;
  const post = options.post;
  const debounceMs = Math.max(0, options.debounceMs ?? 400);
  const pollMs = Math.max(250, options.pollMs ?? 1500);
  const engine = createCaptureEngine({
    maxSeconds: options.maxSeconds ?? DEFAULT_MAX_SECONDS,
    now: options.now,
  });

  let debounceTimer: any = null;
  let stopped = false;
  let lastHref = String(loc?.href ?? "");

  const snapshot = (): CaptureSnapshot => ({
    bodyText: bodyTextOf(doc),
    doc: doc as TecDocumentLike,
    location: {
      pathname: String(loc?.pathname ?? ""),
      search: String(loc?.search ?? ""),
      href: String(loc?.href ?? ""),
    },
    now: options.now ? options.now() : Date.now(),
  });

  const fallbackAssunto = (): string => {
    const last = String(loc?.pathname ?? "")
      .split("/")
      .filter(Boolean)
      .pop();
    const cleaned = last ? last.replace(/-/g, " ") : "";
    // id numérico de caderno/tópico não é assunto — não inventa tópico "1".
    if (!cleaned || /^\d+$/.test(cleaned)) return "Questão TEC";
    return cleaned;
  };

  function scrape(): CaptureEvent | null {
    if (stopped) return null;

    // Mudança de rota da SPA: NÃO mexe no relógio da questão (era o bug dos
    // 443s); só avisa quem instalou (ex.: varrer a lista de cadernos).
    const currentHref = String(loc?.href ?? "");
    if (currentHref !== lastHref) {
      lastHref = currentHref;
      try {
        options.onUrlChange?.();
      } catch (_) {
        /* ignore */
      }
    }

    let event: CaptureEvent | null = null;
    try {
      event = engine.ingest(snapshot());
    } catch (_) {
      return null;
    }
    if (!event) return null;

    const storageKey = "soe_scored_" + sanitizeStorageKey(event.signature);
    try {
      if (storage && storage.getItem(storageKey)) return null;
      if (storage) storage.setItem(storageKey, "1");
    } catch (_) {
      /* sessionStorage bloqueado: segue contando na memória do motor */
    }

    const disciplina = event.disciplina;
    const assunto = event.assunto || fallbackAssunto();
    const isError = event.kind === "wrong";

    post({
      type: "SOE_TEC_INCREMENT_STATS",
      payload: {
        cadernoId:
          options.cadernoId ||
          String(loc?.pathname ?? "")
            .split("/")
            .filter(Boolean)
            .pop() ||
          "unknown",
        cadernoUrl: String(loc?.href ?? ""),
        disciplina,
        assunto,
        correctAdd: isError ? 0 : 1,
        errorAdd: isError ? 1 : 0,
        timeSpentSeconds: event.timeSpentSeconds,
        dedupKey: event.dedupKey,
        questionSignature: event.signature,
        questionId: event.questionId || "",
        questionStatement: (event.statement || "").slice(0, 600),
        questionLabel: event.questionLabel || event.assunto || "",
      },
      _soe_internal: true,
    });

    let activeBanca: string | null = null;
    try {
      activeBanca =
        typeof options.getBanca === "function" ? options.getBanca() : null;
    } catch (_) {
      activeBanca = null;
    }
    if (activeBanca && disciplina && assunto !== "Questão TEC") {
      post({
        type: "SOE_TEC_BANCA_INCREMENT",
        payload: {
          disciplina,
          assunto,
          banca: activeBanca,
          correctAdd: isError ? 0 : 1,
          errorAdd: isError ? 1 : 0,
          dedupKey: event.dedupKey,
        },
        _soe_internal: true,
      });
    }

    if (isError) {
      const wrongKey = storageKey + "_wq";
      let alreadySent = false;
      try {
        alreadySent = !!(storage && storage.getItem(wrongKey));
      } catch (_) {
        alreadySent = false;
      }
      if (!alreadySent) {
        try {
          if (storage) storage.setItem(wrongKey, "1");
        } catch (_) {
          /* ignore */
        }
        const wrong = scrapeWrongQuestion({
          bodyText: bodyTextOf(doc),
          doc: doc as TecDocumentLike,
          questionId: event.questionId,
          disciplina,
          assunto,
          banca: event.banca,
          year: event.year,
          contest: event.contest,
          dedupKey: event.dedupKey,
        });
        wrong.timeSpentSeconds = event.timeSpentSeconds;
        if (wrong.statement || wrong.questionId) {
          post({
            type: "SOE_TEC_WRONG_QUESTION",
            payload: wrong,
            _soe_internal: true,
          });
        }
      }
    }

    try {
      options.onEvent?.(event);
    } catch (_) {
      /* ignore */
    }
    return event;
  }

  function schedule(delay = debounceMs): void {
    if (stopped) return;
    try {
      if (debounceTimer !== null) win.clearTimeout(debounceTimer);
      debounceTimer = win.setTimeout(() => {
        debounceTimer = null;
        scrape();
      }, delay);
    } catch (_) {
      /* ignore */
    }
  }

  let observer: any = null;
  try {
    const MO = win.MutationObserver;
    if (MO && doc?.body) {
      observer = new MO(() => schedule());
      observer.observe(doc.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
  } catch (_) {
    observer = null;
  }

  let pollTimer: any = null;
  try {
    pollTimer = win.setInterval(() => scrape(), pollMs);
  } catch (_) {
    pollTimer = null;
  }

  const onClick = (): void => {
    // Somente leitura: agenda uma varredura; nunca clica nem navega.
    schedule(debounceMs);
    try {
      win.setTimeout(() => scrape(), 2500);
    } catch (_) {
      /* ignore */
    }
  };
  try {
    doc?.addEventListener?.("click", onClick, true);
  } catch (_) {
    /* ignore */
  }

  const onMessage = (event: any): void => {
    if (
      event?.data?.type === "SOE_FORCE_SCRAPE" &&
      event?.data?._soe_internal
    ) {
      schedule(0);
    }
  };
  try {
    win.addEventListener?.("message", onMessage);
  } catch (_) {
    /* ignore */
  }

  function stop(): void {
    stopped = true;
    try {
      observer?.disconnect?.();
    } catch (_) {
      /* ignore */
    }
    try {
      if (pollTimer !== null) win.clearInterval(pollTimer);
      if (debounceTimer !== null) win.clearTimeout(debounceTimer);
    } catch (_) {
      /* ignore */
    }
    try {
      doc?.removeEventListener?.("click", onClick, true);
      win.removeEventListener?.("message", onMessage);
    } catch (_) {
      /* ignore */
    }
  }

  const handle: CaptureHandle = { scrape, engine, stop };
  try {
    win.__SOE_TEC_CAPTURE__ = handle;
  } catch (_) {
    /* ignore */
  }

  return handle;
}
