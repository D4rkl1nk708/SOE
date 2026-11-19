/**
 * SOE Content Script v2 — roda no contexto da página TEC Concursos (MAIN world).
 *
 * Novidades v2:
 * - Captura incidência, total de questões e banca dominante por assunto
 * - Varre automaticamente a lista de cadernos do usuário na página /cadernos
 * - Envia stats de banca por questão via SOE_TEC_BANCA_INCREMENT
 * - Captura filtros ativos (banca, ano, concurso) para enriquecer contexto
 */

(function () {
  'use strict';

  if (window.__SOE_INJECTED_V2__) return;
  
  // No modo proxy, o script é injetado em tudo que é HTML.
  // Só queremos rodar no frame principal do TEC. 
  // No mobile ou Electron, relaxamos a trava se for o frame principal ou se houver indícios do SOE.
  const isMainFrame = window.self === window.top;
  const isSoeProxy = window.__SOE_PROXY__ || window.__SOE_MOBILE__ || window.__SOE_ELECTRON__ || !!window.SoeAndroidBridge || (document.documentElement && document.documentElement.innerHTML.includes('soe-hud'));
  if (!isMainFrame && window.name !== 'TEC_MAIN_FRAME' && !isSoeProxy) {
    return;
  }
  
  window.__SOE_INJECTED_V2__ = true;

  // ─── Núcleo canônico de captura (gerado de shared/tecCaptureCore.ts) ─────
  // >>> SOE_TEC_CORE (gerado de shared/tecCaptureCore.ts — não editar à mão)
"use strict";
var SOE_TEC_CORE = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // shared/tecCaptureCore.ts
  var tecCaptureCore_exports = {};
  __export(tecCaptureCore_exports, {
    buildQuestionSignature: () => buildQuestionSignature,
    cleanLabel: () => cleanLabel,
    createCaptureEngine: () => createCaptureEngine,
    elementText: () => elementText,
    extractAlternatives: () => extractAlternatives,
    extractAnswerResult: () => extractAnswerResult,
    extractQuestionId: () => extractQuestionId,
    extractStatement: () => extractStatement,
    installTecCapture: () => installTecCapture,
    isGenericLabel: () => isGenericLabel,
    normalizeLabel: () => normalizeLabel,
    normalizeSnippet: () => normalizeSnippet,
    parseTecHeader: () => parseTecHeader,
    scrapeWrongQuestion: () => scrapeWrongQuestion,
    stableHash: () => stableHash
  });

  // shared/tecLabels.ts
  var GENERIC_TEC_LABELS = [
    // navegação / site
    "blog",
    "desenvolvimento",
    "geral",
    "general",
    "outros",
    "outras",
    "home",
    "inicio",
    "principal",
    "painel",
    "dashboard",
    "tec concursos",
    "tecconcursos",
    "concursos",
    "questoes",
    "questao",
    "quest\xE3o",
    "simulados",
    "simulado",
    "aulas",
    "videoaulas",
    "materiais",
    "ferramentas",
    "cadernos",
    "caderno",
    "estatisticas",
    "estat\xEDsticas",
    "desempenho",
    "ranking",
    "noticias",
    "not\xEDcias",
    "novidades",
    "guias",
    "guia",
    "artigos",
    "artigo",
    "comunidade",
    "forum",
    "f\xF3rum",
    "suporte",
    "contato",
    "planos",
    "assine",
    // os próprios rótulos, quando capturados por engano
    "materia",
    "mat\xE9ria",
    "disciplina",
    "assunto",
    "topico",
    "t\xF3pico",
    "conteudo",
    "conte\xFAdo",
    "questao tec",
    "quest\xE3o tec",
    "nao informado",
    "n\xE3o informado",
    "sem assunto",
    "sem disciplina"
  ];
  var GENERIC_SET = new Set(GENERIC_TEC_LABELS.map(normalizeLabel));
  function normalizeLabel(value) {
    return String(value != null ? value : "").replace(/\u00a0/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/^tec(?:\s+concursos)?\s*[-–—:]\s*/, "").replace(/[×✕✖⨯]/g, " ").replace(/[.,;:!?]+$/g, "").replace(/\s+/g, " ").trim();
  }
  function cleanLabel(value) {
    let text = String(value != null ? value : "").replace(/\u00a0/g, " ").replace(/[×✕✖⨯]/g, " ").replace(/\s+/g, " ").trim();
    text = text.replace(/^tec(?:\s+concursos)?\s*[-–—:]\s+/i, "");
    text = text.replace(
      /^(?:mat[eé]ria|disciplina|assunto|t[oó]pico|conte[uú]do)\s*:\s*/i,
      ""
    );
    text = text.replace(
      /\s*\/\s*(?:mat[eé]ria|disciplina|assunto|t[oó]pico|conte[uú]do)\s*:.*$/i,
      ""
    );
    text = text.replace(
      /\s+(?:mat[eé]ria|disciplina|assunto|t[oó]pico|conte[uú]do)\s*:.*$/i,
      ""
    );
    text = text.replace(/^[-–—•·\s]+/, "").replace(/[-–—•·\s/]+$/, "");
    text = text.replace(/\s+/g, " ").trim();
    return text.slice(0, 120);
  }
  function isGenericLabel(value) {
    const normalized = normalizeLabel(value);
    if (!normalized) return true;
    if (normalized.length < 3) return true;
    if (/^\d+$/.test(normalized)) return true;
    if (GENERIC_SET.has(normalized)) return true;
    return false;
  }

  // shared/tecCaptureCore.ts
  var BLOCK_TAGS = /* @__PURE__ */ new Set([
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
    "UL"
  ]);
  function normalizeNewlines(value) {
    return String(value != null ? value : "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function elementText(el) {
    var _a;
    if (!el) return "";
    const node = el;
    if (!node.childNodes || typeof node.childNodes.length !== "number") {
      try {
        const inner = el.innerText;
        if (typeof inner === "string" && inner.trim())
          return normalizeNewlines(inner);
      } catch (_) {
      }
      return normalizeNewlines((_a = el.textContent) != null ? _a : "");
    }
    const parts = [];
    const walk = (current) => {
      var _a2, _b;
      if (current.nodeType === 3) {
        parts.push((_a2 = current.textContent) != null ? _a2 : "");
        return;
      }
      if (current.nodeType !== 1) return;
      const tag = String((_b = current.tagName) != null ? _b : "").toUpperCase();
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
  function safeQuery(doc, selector) {
    if (!doc || typeof doc.querySelector !== "function") return null;
    try {
      return doc.querySelector(selector);
    } catch (_) {
      return null;
    }
  }
  function safeQueryAll(doc, selector) {
    if (!doc || typeof doc.querySelectorAll !== "function") return [];
    try {
      return Array.from(
        doc.querySelectorAll(selector)
      );
    } catch (_) {
      return [];
    }
  }
  var LABEL_LINE = /(?:^|\n)\s*(?:mat[eé]ria|disciplina)\s*:\s*([^\n]+)/i;
  var TOPIC_LINE = /(?:^|\n)\s*(?:assunto|t[oó]pico|conte[uú]do)\s*:\s*([^\n]+)/i;
  function parseTecHeader(bodyText, doc) {
    var _a, _b, _c, _d, _e, _f, _g;
    const text = normalizeNewlines(bodyText);
    const candidates = [];
    const inline = (_a = text.match(/mat[eé]ria\s*:\s*([^\n/]+?)\s*\/\s*assunto\s*:\s*([^\n]+)/i)) != null ? _a : text.match(/mat[eé]ria\s*:\s*([^\n]+?)\s+assunto\s*:\s*([^\n]+)/i);
    if (inline) {
      candidates.push({
        disciplina: cleanLabel(inline[1]),
        assunto: cleanLabel(inline[2])
      });
    }
    const materia = text.match(LABEL_LINE);
    const assunto = text.match(TOPIC_LINE);
    if (materia || assunto) {
      candidates.push({
        disciplina: cleanLabel((_b = materia == null ? void 0 : materia[1]) != null ? _b : ""),
        assunto: cleanLabel((_c = assunto == null ? void 0 : assunto[1]) != null ? _c : "")
      });
    }
    const matEl = (_d = safeQuery(
      doc,
      '[data-materia], [data-disciplina], .question-subject, .q-disciplina, [class*="materia"], [class*="disciplina"]'
    )) != null ? _d : null;
    const assEl = (_e = safeQuery(
      doc,
      '[data-assunto], [data-topico], .question-topic, .q-assunto, [class*="assunto"], [class*="topico"]'
    )) != null ? _e : null;
    if (matEl || assEl) {
      candidates.push({
        disciplina: cleanLabel(elementText(matEl)),
        assunto: cleanLabel(elementText(assEl))
      });
    }
    const crumbs = safeQueryAll(
      doc,
      '[class*="breadcrumb"] a, [class*="breadcrumb"] span, [aria-label*="breadcrumb"] a, nav a'
    ).map((el) => cleanLabel(elementText(el))).filter((label) => label.length > 2 && !isGenericLabel(label));
    if (crumbs.length >= 2) {
      candidates.push({
        disciplina: crumbs[0],
        assunto: crumbs[crumbs.length - 1]
      });
    }
    const disc = text.match(/(?:^|\n)\s*disciplina\s*:\s*([^\n/]+)/i);
    const topico = text.match(/(?:^|\n)\s*t[oó]pico\s*:\s*([^\n]+)/i);
    if (disc || topico) {
      candidates.push({
        disciplina: cleanLabel((_f = disc == null ? void 0 : disc[1]) != null ? _f : ""),
        assunto: cleanLabel((_g = topico == null ? void 0 : topico[1]) != null ? _g : "")
      });
    }
    let partial = null;
    for (const candidate of candidates) {
      const disciplina = isGenericLabel(candidate.disciplina) ? "" : candidate.disciplina;
      const topico2 = isGenericLabel(candidate.assunto) ? "" : candidate.assunto;
      if (disciplina && topico2) return { disciplina, assunto: topico2 };
      if (!partial && (disciplina || topico2)) {
        partial = { disciplina, assunto: topico2 };
      }
    }
    return partial != null ? partial : { disciplina: "", assunto: "" };
  }
  var CORRECT_SELECTORS = [
    '[data-result="correct"]',
    "[data-acertou]",
    ".q-status-correct",
    ".feedback-success",
    ".resultado-acerto",
    '[class*="acertou"]',
    '[class*="resultado-correto"]',
    '[class*="resposta-correta"]'
  ];
  var WRONG_SELECTORS = [
    '[data-result="wrong"]',
    "[data-errou]",
    ".q-status-wrong",
    ".feedback-error",
    ".resultado-erro",
    '[class*="errou"]',
    '[class*="resultado-errado"]',
    '[class*="resposta-errada"]'
  ];
  function kindFromText(text) {
    const correctAt = Math.max(
      text.search(/voc[eê]\s+acertou/i),
      text.search(/resposta\s+correta/i),
      text.search(/alternativa\s+correta/i),
      text.search(/gabarito\s*:\s*certo/i)
    );
    const wrongAt = Math.max(
      text.search(/voc[eê]\s+errou/i),
      text.search(/resposta\s+errada/i),
      text.search(/alternativa\s+incorreta/i),
      text.search(/gabarito\s*:\s*errado/i)
    );
    if (correctAt < 0 && wrongAt < 0) return null;
    if (wrongAt > correctAt) return "wrong";
    if (correctAt > wrongAt) return "correct";
    return null;
  }
  function extractAnswerResult(bodyText, doc) {
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
  var STATEMENT_SELECTORS = [
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
    "article"
  ];
  var ALTERNATIVE_CUT = /(?:^|\n)\s*(?:\(\s*[A-E]\s*\)|[A-E]\s*[).:\-–])\s+/m;
  var RESULT_CUT = /(?:^|\n|\s)(?:voc[eê]\s+acertou|voc[eê]\s+errou|gabarito\s*:|resolu[cç][aã]o\s+do\s+professor|coment[aá]rios\s+da\s+comunidade|f[oó]rum)/i;
  var META_LINE = /^(?:[-–—•·]\s*)?(?:mat[eé]ria|disciplina|assunto|t[oó]pico|conte[uú]do|banca|ano|[oó]rg[aã]o|prova|cargo|institui[cç][aã]o|esfera|dificuldade)\s*:/i;
  var YEAR_LINE = /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 .&/'()-]{2,60}\s*[-–]\s*(?:19|20)\d{2}\b/;
  function cleanStatement(value) {
    let text = normalizeNewlines(value);
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
    return text.replace(/\s+/g, " ").trim().slice(0, 2e3);
  }
  function firstChunkAfter(text, index, length) {
    const rest = text.slice(index + length);
    const newline = rest.indexOf("\n");
    const chunk = newline >= 0 ? rest.slice(newline + 1) : "";
    const alt = chunk.search(ALTERNATIVE_CUT);
    return alt >= 0 ? chunk.slice(0, alt) : chunk;
  }
  function extractStatement(doc, bodyText) {
    var _a;
    for (const selector of STATEMENT_SELECTORS) {
      for (const el of safeQueryAll(doc, selector)) {
        const text2 = cleanStatement(elementText(el));
        if (text2.length >= 25 && !/^\(?\s*[A-E]\s*[).:\-]\s/.test(text2))
          return text2;
      }
    }
    const text = normalizeNewlines(bodyText != null ? bodyText : "");
    if (!text) return "";
    const idMatch = text.match(/#\s*\d{2,9}\b/);
    if (idMatch && idMatch.index !== void 0) {
      const chunk = cleanStatement(
        firstChunkAfter(text, idMatch.index, idMatch[0].length)
      );
      if (chunk.length >= 25) return chunk;
    }
    const headerMatch = (_a = text.match(/(?:^|\n)\s*(?:assunto|t[oó]pico)\s*:\s*[^\n]*/i)) != null ? _a : text.match(/(?:^|\n)\s*mat[eé]ria\s*:\s*[^\n]*/i);
    if (headerMatch && headerMatch.index !== void 0) {
      const chunk = cleanStatement(
        firstChunkAfter(text, headerMatch.index, headerMatch[0].length)
      );
      if (chunk.length >= 25) return chunk;
    }
    return "";
  }
  var ALTERNATIVE_SELECTORS = [
    '[class*="alternativa"]',
    '[class*="opcao"]',
    '[class*="option-item"]',
    ".q-option",
    'li[class*="option"]',
    "[data-alternativa]"
  ];
  var LETTER_PREFIX = /^\s*\(?([A-E])\s*[).:\-–]\s*([\s\S]+)$/;
  var LETTER_SPACE_PREFIX = /^\s*([A-E])\s+([\s\S]+)$/;
  function altTextFromElement(el) {
    var _a, _b;
    const letterEl = (_b = (_a = el.querySelector) == null ? void 0 : _a.call(
      el,
      '[class*="letra"], [class*="letter"], [data-letter], b, strong'
    )) != null ? _b : null;
    if (letterEl) {
      const letterRaw = normalizeNewlines(elementText(letterEl)).trim().toUpperCase();
      if (/^[A-E]$/.test(letterRaw)) {
        const full = elementText(el);
        const withoutLetter = full.replace(/^\s*\(?[A-E]\)?\s*[).:\-–]?\s*/, "").trim();
        if (withoutLetter) return withoutLetter;
      }
    }
    return "";
  }
  function extractAlternatives(doc, bodyText) {
    var _a;
    const result = [];
    const seen = /* @__PURE__ */ new Set();
    for (const selector of ALTERNATIVE_SELECTORS) {
      const elements = safeQueryAll(doc, selector);
      if (elements.length === 0) continue;
      const leaves = elements.filter(
        (el) => !elements.some(
          (other) => other !== el && typeof el.contains === "function" && el.contains(other)
        )
      );
      for (const el of leaves.length > 0 ? leaves : elements) {
        const text = normalizeNewlines(elementText(el)).trim();
        if (!text) continue;
        const prefixed = (_a = text.match(LETTER_PREFIX)) != null ? _a : text.match(LETTER_SPACE_PREFIX);
        let letter = "";
        let alternativeText = "";
        if (prefixed) {
          letter = prefixed[1].toUpperCase();
          alternativeText = prefixed[2].trim();
        } else {
          const fromChild = altTextFromElement(el);
          if (fromChild) {
            const childLetter = normalizeNewlines(elementText(el)).trim().toUpperCase().charAt(0);
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
      const text = normalizeNewlines(bodyText != null ? bodyText : "");
      const regex = /(?:^|\n)\s*\(?([A-E])\)?\s*[).:\-–]\s+([^\n]+)/g;
      let match;
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
      const text = normalizeNewlines(bodyText != null ? bodyText : "");
      if (/\bCerto\b/i.test(text) && /\bErrado\b/i.test(text)) {
        return [
          { letter: "C", text: "Certo" },
          { letter: "E", text: "Errado" }
        ];
      }
    }
    result.sort((a, b) => a.letter.localeCompare(b.letter));
    return result;
  }
  var ATTRIBUTE_SELECTORS = [
    "[data-questao-id]",
    "[data-question-id]",
    "[data-questao]",
    "[data-question]",
    "[data-id]"
  ];
  function numericId(value) {
    const raw = String(value != null ? value : "").trim();
    return /^\d{3,9}$/.test(raw) ? raw : null;
  }
  function extractQuestionId(bodyText, doc, loc) {
    var _a, _b, _c, _d, _e, _f;
    const text = normalizeNewlines(bodyText);
    const header = (_a = text.match(/(?:^|\n)\s*(?:quest[aã]o\s*)?#\s*(\d{3,9})\b/i)) != null ? _a : text.match(/#\s*(\d{3,9})\b/);
    if (header) return { questionId: header[1], source: "header" };
    for (const selector of ATTRIBUTE_SELECTORS) {
      const el = safeQuery(doc, selector);
      if (!el || typeof el.getAttribute !== "function") continue;
      const value = numericId(el.getAttribute("data-questao-id"));
      const questionId = (_d = (_c = (_b = value != null ? value : numericId(el.getAttribute("data-question-id"))) != null ? _b : numericId(el.getAttribute("data-questao"))) != null ? _c : numericId(el.getAttribute("data-question"))) != null ? _d : numericId(el.getAttribute("data-id"));
      if (questionId) return { questionId, source: "attribute" };
    }
    const pathname = String((_e = loc == null ? void 0 : loc.pathname) != null ? _e : "");
    const search = String((_f = loc == null ? void 0 : loc.search) != null ? _f : "");
    const fromPath = pathname.match(/\/quest(?:ao|oes|ão|ões)\/(\d{3,9})\b/i);
    if (fromPath) return { questionId: fromPath[1], source: "url" };
    const fromQuery = search.match(/[?&]quest(?:ao|ão)=(\d{3,9})\b/i);
    if (fromQuery) return { questionId: fromQuery[1], source: "url" };
    const trailing = pathname.match(/\/(\d{4,9})\/?$/);
    if (trailing) return { questionId: trailing[1], source: "url" };
    return { questionId: null, source: null };
  }
  function stableHash(input) {
    let hash = 5381;
    for (let i = 0; i < input.length; i += 1) {
      hash = (hash << 5) + hash + input.charCodeAt(i) >>> 0;
    }
    return hash.toString(36);
  }
  function normalizeSnippet(value) {
    return String(value != null ? value : "").replace(/voc[eê] (acertou|errou)!?/gi, " ").replace(/\s+/g, " ").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  function buildQuestionSignature(input) {
    var _a, _b;
    const questionId = input.questionId ? String(input.questionId) : "";
    if (questionId) return "qid:" + questionId;
    const snippet = normalizeSnippet((_a = input.snippet) != null ? _a : "");
    if (snippet.length >= 60) {
      return "stmt:" + stableHash(
        (input.disciplina || "") + "|" + (input.assunto || "") + "|" + snippet.slice(0, 400)
      );
    }
    return "ass:" + stableHash(
      (input.disciplina || "") + "|" + (input.assunto || "") + "|" + (input.pathname || "") + "|" + String((_b = input.transitionCount) != null ? _b : 0)
    );
  }
  var DEFAULT_MAX_SECONDS = 600;
  function createCaptureEngine(options = {}) {
    var _a;
    const maxSeconds = Number.isFinite(options.maxSeconds) ? Math.max(1, Number(options.maxSeconds)) : DEFAULT_MAX_SECONDS;
    const clock = (_a = options.now) != null ? _a : (() => Date.now());
    let questionStartAt = null;
    let lastIdentityKey = "";
    let lastResultKind = null;
    let transitionCount = 0;
    let resultBaseline = null;
    const counted = /* @__PURE__ */ new Set();
    function ingest(snapshot) {
      var _a2, _b, _c;
      const nowMs = typeof snapshot.now === "number" ? snapshot.now : clock();
      const bodyText = String((_a2 = snapshot.bodyText) != null ? _a2 : "");
      const doc = (_b = snapshot.doc) != null ? _b : null;
      const loc = (_c = snapshot.location) != null ? _c : { pathname: "", search: "", href: "" };
      const header = parseTecHeader(bodyText, doc);
      const idInfo = extractQuestionId(bodyText, doc, loc);
      const statement = extractStatement(doc, bodyText);
      const result = extractAnswerResult(bodyText, doc);
      const snippet = normalizeSnippet(statement);
      const identityKey = idInfo.questionId ? "qid:" + idInfo.questionId : snippet.length >= 20 ? "stmt:" + snippet.slice(0, 300) : "";
      if (identityKey && identityKey !== lastIdentityKey) {
        if (lastIdentityKey) transitionCount += 1;
        lastIdentityKey = identityKey;
        questionStartAt = nowMs;
        resultBaseline = result.kind;
      } else if (!identityKey && lastResultKind && !result.kind) {
        transitionCount += 1;
        questionStartAt = nowMs;
        resultBaseline = null;
      }
      if (questionStartAt === null && (identityKey || result.kind || bodyText.trim())) {
        questionStartAt = nowMs;
      }
      if (!result.kind) {
        lastResultKind = null;
        return null;
      }
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
        pathname: loc.pathname
      });
      if (counted.has(signature)) {
        lastResultKind = result.kind;
        return null;
      }
      const startedAt = questionStartAt != null ? questionStartAt : nowMs;
      const rawSeconds = Math.floor((nowMs - startedAt) / 1e3);
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
        statementPending: !statement || statement.length < 5
      };
    }
    return {
      ingest,
      state: () => ({
        questionStartAt,
        lastIdentityKey,
        lastResultKind,
        transitionCount,
        counted: counted.size
      })
    };
  }
  function extractQuestionMeta(bodyText) {
    var _a, _b, _c, _d;
    const text = normalizeNewlines(bodyText);
    const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    const header = text.match(
      /#\s*\d{2,9}\s+([^\n-]+?)\s*(?:-\s*((?:19|20)\d{2}))?\s*(?:-\s*([^\n]+))?/
    );
    const banca = (_b = (_a = header == null ? void 0 : header[1]) == null ? void 0 : _a.trim()) != null ? _b : "";
    const year = (header == null ? void 0 : header[2]) ? parseInt(header[2], 10) : currentYear;
    const contest = (_d = (_c = header == null ? void 0 : header[3]) == null ? void 0 : _c.trim()) != null ? _d : "";
    let correctAnswer = "";
    const gabarito = text.match(
      /(?:gabarito|resposta\s+correta|a\s+correta\s+[eé])\s*:\s*\(?([A-E]|Certo|Errado)\b/i
    );
    if (gabarito) {
      correctAnswer = /^certo$/i.test(gabarito[1]) ? "C" : /^errado$/i.test(gabarito[1]) ? "E" : gabarito[1].toUpperCase().charAt(0);
    }
    let userAnswer = "";
    const escolha = text.match(
      /(?:sua\s+resposta|voc[eê]\s+marcou|voc[eê]\s+selecionou|sua\s+escolha)\s*:\s*\(?([A-E]|Certo|Errado)\b/i
    );
    if (escolha) {
      userAnswer = /^certo$/i.test(escolha[1]) ? "C" : /^errado$/i.test(escolha[1]) ? "E" : escolha[1].toUpperCase().charAt(0);
    }
    return { banca, year, contest, correctAnswer, userAnswer, resolution: "" };
  }
  function scrapeWrongQuestion(input) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
    const doc = (_a = input.doc) != null ? _a : null;
    const bodyText = normalizeNewlines((_b = input.bodyText) != null ? _b : "");
    const meta = extractQuestionMeta(bodyText);
    let questionId = String((_c = input.questionId) != null ? _c : "").trim();
    if (!questionId) {
      const idMatch = (_e = bodyText.match(/#\s*(\d{2,9})\b/)) != null ? _e : String((_d = input.dedupKey) != null ? _d : "").match(/^(\d+)$/);
      if (idMatch) questionId = idMatch[1];
    }
    let statement = extractStatement(doc, bodyText);
    if (!statement) {
      const assuntoLine = bodyText.match(/(?:^|\n)\s*assunto\s*:\s*[^\n]*/i);
      if (assuntoLine && assuntoLine.index !== void 0) {
        const chunk = cleanStatement(
          firstChunkAfter(bodyText, assuntoLine.index, assuntoLine[0].length)
        );
        if (chunk.length >= 25) statement = chunk;
      }
    }
    const alternatives = extractAlternatives(doc, bodyText);
    let correctAnswer = meta.correctAnswer;
    let userAnswer = meta.userAnswer;
    if (doc) {
      const correctEl = safeQuery(
        doc,
        '[class*="correta"]:not([class*="incorreta"]), [class*="gabarito"], .opcao-certa, .is-correct, [data-correct="true"]'
      );
      if (correctEl && !correctAnswer) {
        const letter = elementText(correctEl).trim().match(/\(?([A-E])\b/);
        if (letter) correctAnswer = letter[1].toUpperCase();
      }
      const userEl = safeQuery(
        doc,
        '[class*="marcada"], [class*="selecionada"], [class*="user-choice"], input[type="radio"]:checked, [aria-checked="true"]'
      );
      if (userEl && !userAnswer) {
        const letter = elementText(userEl).trim().match(/\(?([A-E])\b/);
        if (letter) userAnswer = letter[1].toUpperCase();
      }
      const resolutionEl = safeQuery(
        doc,
        '.resolucao-professor, .resolucao, [class*="resolution"], [class*="resolucao"], .feedback-prof'
      );
      if (resolutionEl) {
        meta.resolution = normalizeNewlines(elementText(resolutionEl)).replace(/\s+/g, " ").trim();
      }
    }
    const payload = {
      questionId: questionId || String((_f = input.dedupKey) != null ? _f : "") || "unknown",
      banca: (_g = input.banca) != null ? _g : meta.banca,
      year: (_h = input.year) != null ? _h : meta.year,
      contest: (_i = input.contest) != null ? _i : meta.contest,
      statement,
      alternatives,
      correctAnswer,
      userAnswer,
      resolution: meta.resolution,
      disciplina: (_j = input.disciplina) != null ? _j : "",
      assunto: (_k = input.assunto) != null ? _k : ""
    };
    if (!statement) {
      payload.statement = "";
      payload.statementPending = true;
    }
    return payload;
  }
  function sanitizeStorageKey(value) {
    return String(value || "unknown").replace(/[^a-z0-9]/gi, "_").slice(0, 80);
  }
  function bodyTextOf(doc) {
    const body = doc == null ? void 0 : doc.body;
    if (!body) return "";
    try {
      const text = typeof body.innerText === "string" && body.innerText.trim() ? body.innerText : body.textContent;
      return String(text != null ? text : "");
    } catch (_) {
      return "";
    }
  }
  function installTecCapture(options) {
    var _a, _b, _c, _d, _e, _f, _g;
    const win = options.win;
    const doc = options.doc;
    const loc = options.loc;
    const storage = (_a = options.storage) != null ? _a : null;
    const post = options.post;
    const debounceMs = Math.max(0, (_b = options.debounceMs) != null ? _b : 400);
    const pollMs = Math.max(250, (_c = options.pollMs) != null ? _c : 1500);
    const engine = createCaptureEngine({
      maxSeconds: (_d = options.maxSeconds) != null ? _d : DEFAULT_MAX_SECONDS,
      now: options.now
    });
    let debounceTimer = null;
    let stopped = false;
    let lastHref = String((_e = loc == null ? void 0 : loc.href) != null ? _e : "");
    const snapshot = () => {
      var _a2, _b2, _c2;
      return {
        bodyText: bodyTextOf(doc),
        doc,
        location: {
          pathname: String((_a2 = loc == null ? void 0 : loc.pathname) != null ? _a2 : ""),
          search: String((_b2 = loc == null ? void 0 : loc.search) != null ? _b2 : ""),
          href: String((_c2 = loc == null ? void 0 : loc.href) != null ? _c2 : "")
        },
        now: options.now ? options.now() : Date.now()
      };
    };
    const fallbackAssunto = () => {
      var _a2;
      const last = String((_a2 = loc == null ? void 0 : loc.pathname) != null ? _a2 : "").split("/").filter(Boolean).pop();
      const cleaned = last ? last.replace(/-/g, " ") : "";
      if (!cleaned || /^\d+$/.test(cleaned)) return "Quest\xE3o TEC";
      return cleaned;
    };
    function scrape() {
      var _a2, _b2, _c2, _d2, _e2;
      if (stopped) return null;
      const currentHref = String((_a2 = loc == null ? void 0 : loc.href) != null ? _a2 : "");
      if (currentHref !== lastHref) {
        lastHref = currentHref;
        try {
          (_b2 = options.onUrlChange) == null ? void 0 : _b2.call(options);
        } catch (_) {
        }
      }
      let event = null;
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
      }
      const disciplina = event.disciplina;
      const assunto = event.assunto || fallbackAssunto();
      const isError = event.kind === "wrong";
      post({
        type: "SOE_TEC_INCREMENT_STATS",
        payload: {
          cadernoId: options.cadernoId || String((_c2 = loc == null ? void 0 : loc.pathname) != null ? _c2 : "").split("/").filter(Boolean).pop() || "unknown",
          cadernoUrl: String((_d2 = loc == null ? void 0 : loc.href) != null ? _d2 : ""),
          disciplina,
          assunto,
          correctAdd: isError ? 0 : 1,
          errorAdd: isError ? 1 : 0,
          timeSpentSeconds: event.timeSpentSeconds,
          dedupKey: event.dedupKey,
          questionSignature: event.signature,
          questionId: event.questionId || "",
          questionStatement: (event.statement || "").slice(0, 600),
          questionLabel: event.questionLabel || event.assunto || ""
        },
        _soe_internal: true
      });
      let activeBanca = null;
      try {
        activeBanca = typeof options.getBanca === "function" ? options.getBanca() : null;
      } catch (_) {
        activeBanca = null;
      }
      if (activeBanca && disciplina && assunto !== "Quest\xE3o TEC") {
        post({
          type: "SOE_TEC_BANCA_INCREMENT",
          payload: {
            disciplina,
            assunto,
            banca: activeBanca,
            correctAdd: isError ? 0 : 1,
            errorAdd: isError ? 1 : 0,
            dedupKey: event.dedupKey
          },
          _soe_internal: true
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
          }
          const wrong = scrapeWrongQuestion({
            bodyText: bodyTextOf(doc),
            doc,
            questionId: event.questionId,
            disciplina,
            assunto,
            banca: event.banca,
            year: event.year,
            contest: event.contest,
            dedupKey: event.dedupKey
          });
          wrong.timeSpentSeconds = event.timeSpentSeconds;
          if (wrong.statement || wrong.questionId) {
            post({
              type: "SOE_TEC_WRONG_QUESTION",
              payload: wrong,
              _soe_internal: true
            });
          }
        }
      }
      try {
        (_e2 = options.onEvent) == null ? void 0 : _e2.call(options, event);
      } catch (_) {
      }
      return event;
    }
    function schedule(delay = debounceMs) {
      if (stopped) return;
      try {
        if (debounceTimer !== null) win.clearTimeout(debounceTimer);
        debounceTimer = win.setTimeout(() => {
          debounceTimer = null;
          scrape();
        }, delay);
      } catch (_) {
      }
    }
    let observer = null;
    try {
      const MO = win.MutationObserver;
      if (MO && (doc == null ? void 0 : doc.body)) {
        observer = new MO(() => schedule());
        observer.observe(doc.body, {
          childList: true,
          subtree: true,
          characterData: true
        });
      }
    } catch (_) {
      observer = null;
    }
    let pollTimer = null;
    try {
      pollTimer = win.setInterval(() => scrape(), pollMs);
    } catch (_) {
      pollTimer = null;
    }
    const onClick = () => {
      schedule(debounceMs);
      try {
        win.setTimeout(() => scrape(), 2500);
      } catch (_) {
      }
    };
    try {
      (_f = doc == null ? void 0 : doc.addEventListener) == null ? void 0 : _f.call(doc, "click", onClick, true);
    } catch (_) {
    }
    const onMessage = (event) => {
      var _a2, _b2;
      if (((_a2 = event == null ? void 0 : event.data) == null ? void 0 : _a2.type) === "SOE_FORCE_SCRAPE" && ((_b2 = event == null ? void 0 : event.data) == null ? void 0 : _b2._soe_internal)) {
        schedule(0);
      }
    };
    try {
      (_g = win.addEventListener) == null ? void 0 : _g.call(win, "message", onMessage);
    } catch (_) {
    }
    function stop() {
      var _a2, _b2, _c2;
      stopped = true;
      try {
        (_a2 = observer == null ? void 0 : observer.disconnect) == null ? void 0 : _a2.call(observer);
      } catch (_) {
      }
      try {
        if (pollTimer !== null) win.clearInterval(pollTimer);
        if (debounceTimer !== null) win.clearTimeout(debounceTimer);
      } catch (_) {
      }
      try {
        (_b2 = doc == null ? void 0 : doc.removeEventListener) == null ? void 0 : _b2.call(doc, "click", onClick, true);
        (_c2 = win.removeEventListener) == null ? void 0 : _c2.call(win, "message", onMessage);
      } catch (_) {
      }
    }
    const handle = { scrape, engine, stop };
    try {
      win.__SOE_TEC_CAPTURE__ = handle;
    } catch (_) {
    }
    return handle;
  }
  return __toCommonJS(tecCaptureCore_exports);
})();
// <<< SOE_TEC_CORE

  const CADERNO_ID = location.pathname.match(/\/cadernos\/(\d+)/)?.[1] || null;

  function debugLog(msg) {
    // console.log('[SOE DEBUG]', msg);
    /* 
    window.postMessage({
      type: 'SOE_DEBUG_LOG',
      payload: { msg: `[${new Date().toISOString()}] ${msg}` },
      _soe_internal: true,
    }, '*');
    */
  }

  debugLog('Script SOE v2.1 carregado. URL: ' + location.href + ' CadernoID: ' + CADERNO_ID);

  // ─── Captura de incidência e metadados enriquecidos ───────────────────────

  function parseTecResponse(data) {
    const rows = [];
    let disciplinaAtual = '';

    const candidates = [
      data?.assuntos, data?.estatisticas, data?.items, data?.data,
      data?.questoes_por_assunto, data?.desempenho,
      data?.caderno?.assuntos, data?.caderno?.estatisticas,
      data?.result, data?.results,
      Array.isArray(data) ? data : null,
    ];

    const list = candidates.find(c => Array.isArray(c) && c.length > 0);
    if (!list) return rows;

    const nomePayload =
      data?.caderno?.nome || data?.nome || data?.title ||
      data?.caderno?.disciplina || data?.disciplina || '';

    for (const item of list) {
      if (item.isDisciplina || item.type === 'disciplina' || item.tipo === 'disciplina') {
        disciplinaAtual = item.nome || item.name || item.disciplina || '';
        continue;
      }
      const disc    = item.disciplina || item.materia || item.discipline || item.categoria || disciplinaAtual || nomePayload || 'TEC Concursos';
      const acertos = item.acertos ?? item.corretas ?? item.correct ?? item.hits ?? item.certas ?? 0;
      const erros   = item.erros   ?? item.incorretas ?? item.wrong  ?? item.errors ?? item.erradas ?? 0;
      const nome    = item.assunto || item.nome || item.name || item.topico || item.titulo || '';

      if (!nome || (acertos + erros) === 0) continue;

      // ── Campos enriquecidos (novidade v2) ──
      const totalQuestoesBanca =
        item.total || item.total_questoes || item.qtd_questoes ||
        item.quantidade || item.count || item.questoes_disponiveis || undefined;

      // Incidência: aceita valor absoluto (%) ou decimal (0-1)
      const incidenciaRaw =
        item.incidencia ?? item.percentual ?? item.peso ??
        item.frequencia ?? item.relevancia ?? undefined;
      const incidencia = incidenciaRaw !== undefined
        ? (incidenciaRaw > 1 ? incidenciaRaw / 100 : incidenciaRaw)
        : undefined;

      const bancaDominante =
        item.banca || item.bancas?.[0] || item.organizadora || undefined;

      const dificuldade =
        item.dificuldade !== undefined ? (item.dificuldade > 1 ? item.dificuldade / 100 : item.dificuldade)
        : undefined;

      rows.push({
        disciplina: disc,
        assunto: nome,
        acertos: Number(acertos),
        erros: Number(erros),
        ...(incidencia !== undefined ? { incidencia } : {}),
        ...(totalQuestoesBanca !== undefined ? { totalQuestoesBanca: Number(totalQuestoesBanca) } : {}),
        ...(bancaDominante ? { bancaDominante } : {}),
        ...(dificuldade !== undefined ? { dificuldade } : {}),
      });
    }
    return rows;
  }

  // ─── Detecção de lista de cadernos ───────────────────────────────────────

  function parseCadernosList(data) {
    const candidates = [
      data?.cadernos, data?.items, data?.data, data?.results,
      Array.isArray(data) ? data : null,
    ];
    const list = candidates.find(c => Array.isArray(c) && c.length > 0);
    if (!list) return [];

    return list
      .filter(c => c.id || c.caderno_id || c.cadernoId)
      .map(c => ({
        id: String(c.id || c.caderno_id || c.cadernoId),
        nome: c.nome || c.name || c.titulo || c.title || 'Caderno',
        disciplina: c.disciplina || c.materia || c.subject || '',
        url: c.url || `https://www.tecconcursos.com.br/cadernos/${c.id || c.caderno_id}`,
        totalQuestoes: c.total_questoes || c.questoes || c.count || 0,
        assuntos: c.assuntos_count || c.num_assuntos || 0,
      }));
  }

  function scrapeCadernosFromDOM() {
    const cadernos = [];
    // TEC renders cadernos in cards/list items
    const cards = document.querySelectorAll(
      '[class*="caderno-item"], [class*="CadernoItem"], [class*="caderno_card"], ' +
      '[data-caderno-id], a[href*="/cadernos/"]'
    );
    for (const card of cards) {
      const href = card.getAttribute('href') || card.querySelector('a')?.getAttribute('href') || '';
      const idMatch = href.match(/\/cadernos\/(\d+)/);
      if (!idMatch) continue;
      const id = idMatch[1];
      const nome = (card.querySelector('[class*="nome"], [class*="title"], h2, h3, strong') || card)
        .textContent?.trim()?.split('\n')[0] || `Caderno ${id}`;
      cadernos.push({ id, nome, url: `https://www.tecconcursos.com.br${href}`, disciplina: '', totalQuestoes: 0, assuntos: 0 });
    }
    if (cadernos.length > 0) {
      console.log('[SOE v2] Cadernos detectados via DOM:', cadernos.length);
      window.postMessage({ type: 'SOE_TEC_CADERNOS_LIST', payload: { cadernos }, _soe_internal: true }, '*');
    }
  }

  // ─── Captura de banca nos filtros ativos ─────────────────────────────────

  function getActiveBanca() {
    const text = document.body?.innerText || '';
    // TEC shows active filters as chips: "CEBRASPE (CESPE)" etc.
    const filterArea = document.querySelector('[class*="filtro"], [class*="filter"], [class*="tag-banca"]');
    if (filterArea) {
      const bancaChip = filterArea.querySelector('[class*="banca"], [class*="organizadora"]');
      if (bancaChip) return bancaChip.textContent?.trim() || null;
    }
    // Fallback: extract from URL
    const urlParams = new URLSearchParams(location.search);
    return urlParams.get('banca') || urlParams.get('organizadora') || null;
  }

  // ─── URL relevance ────────────────────────────────────────────────────────

  function isRelevantUrl(url) {
    if (!url) return false;
    const u = url.toString();
    return (
      u.includes('estatisticas') || u.includes('desempenho') ||
      u.includes('assunto')      || u.includes('caderno') ||
      u.includes('desempenho-por') ||
      (CADERNO_ID && u.includes(CADERNO_ID))
    );
  }

  function isCadernosListUrl(url) {
    return url.toString().match(/\/cadernos($|\?|\/\?|\/list|\/all)/i) !== null;
  }

  // ─── DOM scraping ─────────────────────────────────────────────────────────

  function scrapeQuestionHeader() {
    const text = document.body?.innerText || '';
    if (!text) return [];

    // Suporta formatos: "10 Resolvidas, 8 Acertos e 2 Erros" ou "319 R, 242 A e 77 E"
    const statsMatch = text.match(/(?:(\d+)\s*(?:Resolvidas?|R),\s*)?(\d+)\s*(?:Acertos?|A)\s+e\s+(\d+)\s*(?:Erros?|E)/i);
    const cleanBtns = s => s.replace(/[\u2715\u2716\u2297\u2A2F\u00D7]/g, '').trim();

    debugLog(`Scraping header. StatsMatch: ${statsMatch ? 'Yes (' + statsMatch[0] + ')' : 'No'}. Text length: ${text.length}`);

    // Strategy 1: Text labels "Matéria:" / "Assunto:" (classic/mobile TEC layout)
    const materiaMatch = text.match(/Mat[eé]ria:\s*([^\n\r]+)/i);
    const assuntoMatch = text.match(/Assunto:\s*([^\n\r]+)/i);
    if (materiaMatch && assuntoMatch) {
      const disciplina = cleanBtns(materiaMatch[1]);
      const assunto = cleanBtns(assuntoMatch[1]);
      if (disciplina && assunto) {
        const acertos = statsMatch ? parseInt(statsMatch[2], 10) || 0 : 0;
        const erros   = statsMatch ? parseInt(statsMatch[3], 10) || 0 : 0;
        return [{ disciplina, assunto, acertos, erros }];
      }
    }

    // Strategy 2: CSS selectors (TEC React/Vue components)
    try {
      const selMateria = document.querySelector(
        '[class*="materia"], [class*="disciplina"], [class*="subject"], ' +
        '[data-materia], [data-disciplina], .question-subject, ' +
        '.materia-area, .disciplina-info' // Mobile selectors
      );
      const selAssunto = document.querySelector(
        '[class*="assunto"], [class*="topico"], [class*="topic"], ' +
        '[data-assunto], [data-topico], .question-topic, ' +
        '.assunto-area, .topico-info' // Mobile selectors
      );
      if (selMateria && selAssunto) {
        const disciplina = cleanBtns(selMateria.textContent || '');
        const assunto    = cleanBtns(selAssunto.textContent  || '');
        if (disciplina && assunto) {
          const acertos = statsMatch ? parseInt(statsMatch[2], 10) || 0 : 0;
          const erros   = statsMatch ? parseInt(statsMatch[3], 10) || 0 : 0;
          return [{ disciplina, assunto, acertos, erros }];
        }
      }
    } catch (_) {}

    // Strategy 3: Breadcrumb / navigation trail (TEC often shows "Disc > Topic")
    try {
      const breadcrumbs = document.querySelectorAll(
        '[class*="breadcrumb"] a, [class*="breadcrumb"] span, nav a, [aria-label*="breadcrumb"] a'
      );
      const crumbs = Array.from(breadcrumbs)
        .map(el => cleanBtns(el.textContent || ''))
        .filter(t => t.length > 2 && t !== 'Início' && t !== 'Home' && t !== 'TEC');
      if (crumbs.length >= 2) {
        const acertos = statsMatch ? parseInt(statsMatch[2], 10) || 0 : 0;
        const erros   = statsMatch ? parseInt(statsMatch[3], 10) || 0 : 0;
        return [{ disciplina: crumbs[0], assunto: crumbs[crumbs.length - 1], acertos, erros }];
      }
    } catch (_) {}

    // Strategy 4: Question metadata block — look for "Disciplina: X / Assunto: Y" patterns
    const discMatch   = text.match(/Disciplina:\s*([^\n\/]+)/i);
    const topicoMatch = text.match(/T[oó]pico:\s*([^\n]+)/i) || text.match(/Conte[uú]do:\s*([^\n]+)/i);
    if (discMatch && topicoMatch) {
      const disciplina = cleanBtns(discMatch[1]);
      const assunto    = cleanBtns(topicoMatch[1]);
      if (disciplina && assunto) {
        const acertos = statsMatch ? parseInt(statsMatch[2], 10) || 0 : 0;
        const erros   = statsMatch ? parseInt(statsMatch[3], 10) || 0 : 0;
        return [{ disciplina, assunto, acertos, erros }];
      }
    }

    return [];
  }

  // ─── Núcleo canônico de captura (shared/tecCaptureCore.ts) ───────────────
  // Identidade, detecção do banner e tempo vivem no núcleo compartilhado
  // (bloco SOE_TEC_CORE acima, gerado por scripts/sync-tec-core.mjs).
  // 100% passivo: lê o DOM; nunca faz requisição, clique, scroll ou navegação.
  const capture = SOE_TEC_CORE.installTecCapture({
    win: window,
    doc: document,
    loc: location,
    storage: sessionStorage,
    post: (message) => window.postMessage(message, '*'),
    cadernoId: CADERNO_ID,
    getBanca: getActiveBanca,
    onUrlChange: () => {
      // Mudança de rota da SPA: se caiu na lista de cadernos, varre (como antes).
      if (location.pathname.match(/\/cadernos($|\?)/)) setTimeout(scrapeCadernosFromDOM, 2000);
    },
    pollMs: 1500,
    debounceMs: 400,
    maxSeconds: 600,
  });
  // Os intercepts (fetch/XHR), o DOMContentLoaded, o clique e o SOE_FORCE_SCRAPE
  // continuam chamando tryScrapeDOM, que agora é o scrape do núcleo.
  const tryScrapeDOM = capture.scrape;

  function dispatch(rows, sourceUrl) {
    if (!rows || rows.length === 0) return;
    window.postMessage({
      type: 'SOE_TEC_DATA',
      payload: {
        cadernoId:  CADERNO_ID || location.pathname.split('/').filter(Boolean).pop() || 'unknown',
        cadernoUrl: location.href,
        disciplina: rows[0]?.disciplina || '',
        rows,
        sourceUrl,
      },
      _soe_internal: true,
    }, '*');
  }

  // ─── Intercept fetch (Passivo — NUNCA modifica URLs nem dados da requisição) ──
  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await _fetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

      if (url.includes('api') || url.includes('questoes')) {
        setTimeout(tryScrapeDOM, 1000);
        setTimeout(tryScrapeDOM, 2500);
      }

      if (isRelevantUrl(url)) {
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('json')) {
          response.clone().json().then(data => {
            const rows = parseTecResponse(data);
            if (rows.length > 0) {
              dispatch(rows, url);
            }
            if (isCadernosListUrl(url)) {
              const cadernos = parseCadernosList(data);
              if (cadernos.length > 0) {
                window.postMessage({ type: 'SOE_TEC_CADERNOS_LIST', payload: { cadernos }, _soe_internal: true }, '*');
              }
            }
          }).catch(() => {});
        }
      }
    } catch (_) {}
    return response;
  };

  // ─── Intercept XHR (Passivo — NUNCA modifica URLs) ───────────────────────────
  const _XHROpen = XMLHttpRequest.prototype.open;
  const _XHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._soe_url = url;
    return _XHROpen.apply(this, [method, url, ...rest]);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      try {
        const url = this._soe_url || '';
        if (url.includes('api') || url.includes('questoes')) {
          setTimeout(tryScrapeDOM, 1000);
          setTimeout(tryScrapeDOM, 2500);
        }
        if (!isRelevantUrl(url)) return;
        const ct = this.getResponseHeader('content-type') || '';
        if (!ct.includes('json')) return;
        const data = JSON.parse(this.responseText);
        const rows = parseTecResponse(data);
        if (rows.length > 0) {
          dispatch(rows, url);
        }
        if (isCadernosListUrl(url)) {
          const cadernos = parseCadernosList(data);
          if (cadernos.length > 0) {
            window.postMessage({ type: 'SOE_TEC_CADERNOS_LIST', payload: { cadernos }, _soe_internal: true }, '*');
          }
        }
      } catch (_) {}
    });
    return _XHRSend.apply(this, args);
  };

  // ─── HTML table fallback + DOM init ──────────────────────────────────────

  function scrapeHtmlTable() {
    const rows = [];
    let disciplinaAtual = '';
    const trs = document.querySelectorAll('table tr, [class*="table"] [class*="row"]');
    for (const tr of trs) {
      const tds = Array.from(tr.querySelectorAll('td, [class*="cell"]'));
      if (tds.length === 0) continue;
      const textos = tds.map(td => td.innerText.trim());
      const numeros = textos.filter(t => /^\d+$/.test(t)).map(Number);
      if (numeros.length < 2 && textos[0] && textos[0].length > 3) {
        const hasBold = tr.querySelector('strong, b, [style*="bold"], [class*="bold"], [class*="header"], [class*="disciplina"]');
        const hasColspan = tds.some(td => parseInt(td.getAttribute('colspan') || '1') > 2);
        if (hasBold || hasColspan || tds.length === 1) {
          disciplinaAtual = textos[0].replace(/\s*\([^)]*\)\s*$/, '').trim();
          continue;
        }
      }
      if (numeros.length >= 2 && textos[0] && disciplinaAtual) {
        rows.push({ disciplina: disciplinaAtual, assunto: textos[0], acertos: numeros[0], erros: numeros[1] });
      }
    }
    if (rows.length > 0) {
      console.log('[SOE v2] capturados', rows.length, 'assuntos via HTML scraping');
      dispatch(rows, location.href);
    }
    return rows.length;
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      tryScrapeDOM();
      if (scrapeHtmlTable() === 0) setTimeout(scrapeHtmlTable, 3000);

      // Auto-scan lista de cadernos se estiver na página certa
      if (location.pathname.match(/\/cadernos($|\?)/)) {
        setTimeout(scrapeCadernosFromDOM, 2000);
        setTimeout(scrapeCadernosFromDOM, 5000);
      }
    }, 2000);

    document.body.addEventListener('click', (e) => {
      if (e.target.closest('button, a, input[type="radio"], label')) {
        setTimeout(tryScrapeDOM, 1000);
        setTimeout(tryScrapeDOM, 2500);
      }
    });
  });

  // ─── Force Scrape Listener (para Mobile Browser) ─────────────────────────
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'SOE_FORCE_SCRAPE' && e.data._soe_internal) {
      console.log('[SOE v2] Forçando varredura manual...');
      tryScrapeDOM();
      scrapeHtmlTable();
      if (location.pathname.match(/\/cadernos($|\?)/)) scrapeCadernosFromDOM();
    }
  });

  console.log('[SOE v2] content script ativo — captura enriquecida (incidência + bancas + cadernos)');
})();
