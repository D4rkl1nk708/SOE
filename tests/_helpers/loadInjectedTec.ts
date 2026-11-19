import fs from "node:fs";
import path from "node:path";
import { Window } from "happy-dom";

/**
 * Harness dos scripts injetados do TEC.
 *
 * Executa o ARQUIVO REAL (JS de navegador, dentro do IIFE) em um Window do
 * happy-dom, com relógio e timers controláveis, e captura as mensagens
 * `window.postMessage`. Nenhuma requisição é feita: fetch/XHR só são lidos.
 */

export const REPO_ROOT = process.cwd();

export const INJECTED_FILES = [
  "electron/tec-content.js",
  "electron/tec-preload.cjs",
  "android/app/src/main/assets/tec-content.js",
  "chrome-extension/src/content.js",
] as const;

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

type TreeNode = {
  nodeType?: number;
  tagName?: string;
  textContent?: string | null;
  childNodes?: ArrayLike<TreeNode>;
};

/** innerText igual ao do navegador: blocos separados por linha. */
export function domText(root: TreeNode): string {
  const parts: string[] = [];
  const walk = (node: TreeNode): void => {
    if (node.nodeType === 3) {
      parts.push(node.textContent ?? "");
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = String(node.tagName ?? "").toUpperCase();
    if (tag === "BR") {
      parts.push("\n");
      return;
    }
    const block = BLOCK_TAGS.has(tag);
    if (block && parts.length > 0) parts.push("\n");
    const kids = node.childNodes;
    if (kids) for (let i = 0; i < kids.length; i += 1) walk(kids[i]);
    if (block) parts.push("\n");
  };
  walk(root);
  return parts
    .join("")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function installInnerTextWalker(win: any): void {
  Object.defineProperty(win.HTMLElement.prototype, "innerText", {
    configurable: true,
    enumerable: true,
    get(this: any) {
      try {
        return domText(this);
      } catch (_) {
        return String(this.textContent ?? "");
      }
    },
    set(this: any, value: string) {
      this.textContent = value;
    },
  });
}

export interface FakeClock {
  now: number;
}

export interface TimerRecord {
  id: number;
  fn: (...args: any[]) => void;
  args: any[];
  at: number;
  interval: number | null;
}

export interface LoadedTec {
  win: any;
  doc: any;
  location: any;
  clock: FakeClock;
  messages: any[];
  timers: TimerRecord[];
  /** avança o relógio e executa os timers que venceram */
  advance: (ms: number) => number;
  runDue: (maxRuns?: number) => number;
  settle: () => Promise<void>;
  bodyText: () => string;
  setStatement: (text: string) => void;
  addBanner: (kind: "correct" | "wrong") => void;
  removeBanner: () => void;
  click: (selector?: string) => void;
  navigate: (url: string) => void;
  close: () => void;
}

export function payloads(loaded: LoadedTec, type: string): any[] {
  return loaded.messages
    .filter((m) => m && m.type === type)
    .map((m) => m.payload);
}

export function loadInjectedTec(
  file: string,
  options: { html: string; url?: string },
): LoadedTec {
  const url = options.url ?? "https://www.tecconcursos.com.br/cadernos/1";
  const parsed = new URL(url);

  const win: any = new Window({ url });
  win.document.body.innerHTML = options.html;
  installInnerTextWalker(win);

  const messages: any[] = [];
  win.postMessage = ((message: any) => {
    messages.push(message);
  }) as any;

  const clock: FakeClock = { now: 1_000_000 };
  const timers: TimerRecord[] = [];
  let seq = 1;

  const setTimeoutStub = (fn: any, ms?: number, ...args: any[]): number => {
    const id = seq++;
    timers.push({
      id,
      fn,
      args,
      at: clock.now + Math.max(0, Number(ms) || 0),
      interval: null,
    });
    return id;
  };
  const setIntervalStub = (fn: any, ms?: number, ...args: any[]): number => {
    const id = seq++;
    const every = Math.max(1, Number(ms) || 1);
    timers.push({ id, fn, args, at: clock.now + every, interval: every });
    return id;
  };
  const clearTimer = (id: any): void => {
    const index = timers.findIndex((t) => t.id === id);
    if (index >= 0) timers.splice(index, 1);
  };

  // Em navegador, o `setTimeout` global do script É o window.setTimeout: o
  // núcleo compartilhado usa `win.setTimeout`, então o window do harness
  // precisa usar os mesmos timers controláveis (MutationObserver não usa
  // setTimeout — é microtask — logo não é afetado).
  win.setTimeout = setTimeoutStub;
  win.setInterval = setIntervalStub;
  win.clearTimeout = clearTimer;
  win.clearInterval = clearTimer;

  const runDue = (maxRuns = 400): number => {
    let runs = 0;
    while (runs < maxRuns) {
      const due = timers
        .filter((t) => t.at <= clock.now)
        .sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      const index = timers.indexOf(due);
      timers.splice(index, 1);
      if (due.interval !== null) {
        timers.push({ ...due, at: clock.now + due.interval });
      }
      try {
        due.fn(...due.args);
      } catch (_) {
        /* o script real não pode derrubar a suíte */
      }
      runs += 1;
    }
    return runs;
  };

  const advance = (ms: number): number => {
    clock.now += Math.max(0, ms);
    return runDue();
  };

  const settle = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 15));
  };

  const RealDate = Date;
  function FakeDate(this: any, ...args: any[]): any {
    if (!(this instanceof FakeDate)) return new RealDate(clock.now).toString();
    return args.length > 0
      ? new (RealDate as any)(...args)
      : new RealDate(clock.now);
  }
  (FakeDate as any).now = () => clock.now;
  (FakeDate as any).parse = RealDate.parse;
  (FakeDate as any).UTC = RealDate.UTC;
  (FakeDate as any).prototype = RealDate.prototype;

  const location: any = {
    pathname: parsed.pathname,
    search: parsed.search,
    hash: parsed.hash,
    href: url,
    origin: parsed.origin,
    host: parsed.host,
    hostname: parsed.hostname,
    protocol: parsed.protocol,
    toString() {
      return this.href;
    },
  };

  const silentConsole = {
    log() {},
    info() {},
    warn() {},
    error() {},
    debug() {},
    trace() {},
  };

  const requireStub = (name: string) =>
    name === "electron"
      ? { ipcRenderer: { send() {}, on() {}, invoke: async () => null } }
      : {};

  const source = fs.readFileSync(path.resolve(REPO_ROOT, file), "utf8");
  const factory = new Function(
    "window",
    "document",
    "location",
    "sessionStorage",
    "localStorage",
    "console",
    "setTimeout",
    "setInterval",
    "clearTimeout",
    "clearInterval",
    "XMLHttpRequest",
    "MutationObserver",
    "URL",
    "URLSearchParams",
    "navigator",
    "require",
    "Date",
    source,
  );

  factory(
    win,
    win.document,
    location,
    win.sessionStorage,
    win.localStorage,
    silentConsole,
    setTimeoutStub,
    setIntervalStub,
    clearTimer,
    clearTimer,
    win.XMLHttpRequest,
    win.MutationObserver,
    win.URL,
    win.URLSearchParams,
    win.navigator,
    requireStub,
    FakeDate,
  );

  // O script registra o init em DOMContentLoaded; o documento já tem o fixture.
  win.document.dispatchEvent(new win.Event("DOMContentLoaded"));

  const loaded: LoadedTec = {
    win,
    doc: win.document,
    location,
    clock,
    messages,
    timers,
    advance,
    runDue,
    settle,
    bodyText: () => domText(win.document.body),
    setStatement: (text: string) => {
      const el = win.document.querySelector(".enunciado");
      if (el) {
        el.textContent = text;
      } else {
        const created = win.document.createElement("div");
        created.className = "enunciado";
        created.textContent = text;
        win.document.body.appendChild(created);
      }
    },
    addBanner: (kind: "correct" | "wrong") => {
      const banner = win.document.createElement("div");
      banner.className =
        "resultado " + (kind === "correct" ? "acertou" : "errou");
      banner.textContent = kind === "correct" ? "Você acertou!" : "Você errou!";
      win.document.body.appendChild(banner);
    },
    removeBanner: () => {
      for (const el of Array.from(
        win.document.querySelectorAll(".resultado"),
      ) as any[]) {
        el.remove();
      }
    },
    click: (selector = "button.responder") => {
      const el = win.document.querySelector(selector) ?? win.document.body;
      el.dispatchEvent(
        new win.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    },
    navigate: (nextUrl: string) => {
      const next = new URL(nextUrl);
      location.href = nextUrl;
      location.pathname = next.pathname;
      location.search = next.search;
      location.hash = next.hash;
    },
    close: () => {
      try {
        win.__SOE_TEC_CAPTURE__?.stop?.();
      } catch (_) {
        /* ignore */
      }
      try {
        win.close();
      } catch (_) {
        /* ignore */
      }
    },
  };

  return loaded;
}

// ─── fixtures ───────────────────────────────────────────────────────────────

export const LONG_STATEMENT =
  "O servidor público estável somente perderá o cargo em virtude de sentença judicial transitada em julgado ou mediante processo administrativo em que lhe seja assegurada ampla defesa, conforme a jurisprudência consolidada.";

export interface FixtureOptions {
  id?: string | null;
  statement?: string;
  materia?: string;
  assunto?: string;
  header?: boolean;
  alternatives?: string[];
  withButton?: boolean;
}

const DEFAULT_ALTERNATIVES = [
  "Texto da alternativa A sobre a regra constitucional aplicável ao caso concreto.",
  "Texto da alternativa B sobre a estabilidade do servidor público concursado.",
  "Texto da alternativa C sobre o processo administrativo disciplinar.",
  "Texto da alternativa D sobre a sentença judicial transitada em julgado.",
  "Texto da alternativa E sobre a ampla defesa e o contraditório.",
];

export function questionHtml(options: FixtureOptions = {}): string {
  const {
    id = "12345",
    statement = LONG_STATEMENT,
    materia = "Direito Administrativo",
    assunto = "Servidores Públicos",
    header = true,
    alternatives = DEFAULT_ALTERNATIVES,
    withButton = true,
  } = options;

  const alternativesHtml = alternatives
    .map(
      (text, index) =>
        `<li class="alternativa"><span class="letra">${String.fromCharCode(65 + index)}</span>${text}</li>`,
    )
    .join("");

  return `
    <div id="app">
      <div class="question-metadata">
        <span class="materia">Matéria: ${materia}</span>
        <span class="assunto">Assunto: ${assunto}</span>
      </div>
      ${header && id ? `<div class="question-header">#${id} CEBRASPE - 2024 - PC-DF</div>` : ""}
      ${header && !id ? `<div class="question-header">CEBRASPE - 2024 - PC-DF</div>` : ""}
      <div class="enunciado">${statement}</div>
      <ul class="alternativas">${alternativesHtml}</ul>
      ${withButton ? '<button class="responder">Responder</button>' : ""}
      <div class="resolucao-professor">Resolução do professor: o gabarito é a letra A.</div>
    </div>
  `;
}

export const STATEMENT_VARIANTS = [
  "Questão 1: sobre licitações públicas, modalidades, limites de valor e hipóteses de dispensa previstas na legislação federal aplicável aos entes.",
  "Questão 2: sobre improbidade administrativa, elementos subjetivos, sanções e o rito processual previsto na lei especial correspondente.",
  "Questão 3: sobre controle externo, competências do tribunal de contas e apreciação das contas anuais dos administradores públicos.",
  "Questão 4: sobre organização administrativa, administração direta e indireta, autarquias, fundações e empresas estatais prestadoras.",
  "Questão 5: sobre poderes administrativos, hierárquico, disciplinar, regulamentar e de polícia, com seus limites e abusos possíveis.",
  "Questão 6: sobre atos administrativos, atributos, presunção de legitimidade, autoexecutoriedade e a teoria dos motivos determinantes.",
  "Questão 7: sobre responsabilidade civil do Estado, teorias adotadas, excludentes e a reparação integral dos danos causados a terceiros.",
  "Questão 8: sobre servidores públicos, regime disciplinar, penalidades, prescrição e o devido processo legal administrativo.",
  "Questão 9: sobre bens públicos, classificação, regime jurídico, uso por particulares e as formas de alienação permitidas em lei.",
  "Questão 10: sobre intervenção do Estado na propriedade, desapropriação, servidão administrativa e limitações administrativas gerais.",
];
