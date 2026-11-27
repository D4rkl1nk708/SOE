import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  DEFAULT_MAX_WORDS,
  MIN_MAX_WORDS,
  paginateBlocks,
} from "@shared/pagination";

/**
 * O leitor paginado (v6.9.13).
 *
 * Uma página por vez, sem rolagem vertical. O texto é paginado por palavras e
 * depois *calibrado* pela altura real: um quadro oculto mede todas as páginas
 * da seção e o orçamento desce até a mais alta caber. Por isso a contagem
 * ("3 de 12") não muda no meio da leitura — a calibração acontece por seção e
 * ao girar/redimensionar, nunca a cada virada de página.
 *
 * Teclado (← →) e swipe horizontal avançam; as setas são visíveis. A posição é
 * de quem usa: o componente avisa cada página via `onPageChange` e abre em
 * `initialPage` (a tela persiste por documento + seção).
 */

export type PagedReadingProps = {
  /** Parágrafos já reflowados (um por bloco de leitura). */
  blocks: string[];
  /** Número da página do PDF para cada parágrafo (metadado opcional). */
  blockPages?: Array<number | undefined>;
  maxWords?: number;
  initialPage?: number;
  onPageChange?: (page: number, total: number) => void;
  /** Chamado ao tentar avançar depois da última página (ex.: próxima seção). */
  onAfterLast?: () => void;
  footerNote?: React.ReactNode;
  className?: string;
};

/**
 * Orçamento de palavras que faria a página mais alta caber na altura
 * disponível. Correção proporcional: um parágrafo longo não pode virar
 * uma página vazia de 15 em 15 por cento.
 */
export function fitMaxWords(input: {
  budget: number;
  words: number;
  contentHeight: number;
  capacity: number;
  maxWords: number;
  floor?: number;
}): number {
  const floor = Math.max(1, Math.floor(input.floor ?? MIN_MAX_WORDS));
  const ceiling = Math.max(floor, Math.floor(input.maxWords));
  const clamp = (value: number) =>
    Math.max(floor, Math.min(ceiling, Math.round(value)));
  const { budget, words, contentHeight, capacity } = input;
  if (words <= 0 || contentHeight <= 0 || capacity <= 0) return budget;
  if (contentHeight <= capacity + 1) return budget;
  return clamp(words * (capacity / contentHeight) * 0.96);
}

/**
 * Pagina e mede até a página mais alta caber em `capacity`.
 *
 * Mede todas as páginas de uma vez, num quadro oculto com os mesmos estilos —
 * uma repaginação por seção em vez de uma por página. Sem layout (SSR, teste
 * sem DOM) devolve o teto.
 */
export function calibrateBudget(
  blocks: string[],
  options: {
    capacity: number;
    width: number;
    ceiling: number;
    mount?: HTMLElement | null;
    measure?: (node: HTMLElement) => number;
  },
): number {
  const { capacity, width, ceiling } = options;
  const measure =
    options.measure ??
    ((node: HTMLElement) => node.getBoundingClientRect().height);
  if (capacity <= 0 || width <= 40) return ceiling;
  if (typeof document === "undefined") return ceiling;
  const mount = options.mount ?? document.body;

  const probe = document.createElement("div");
  probe.className = "reading-prose";
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;" +
    `width:${Math.round(width)}px;`;

  let budget = Math.max(MIN_MAX_WORDS, Math.floor(ceiling));
  try {
    mount.appendChild(probe);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const pages = paginateBlocks(blocks, { maxWords: budget });
      if (pages.length === 0) return budget;

      probe.textContent = "";
      let tallest = 0;
      for (const page of pages) {
        const pageNode = document.createElement("div");
        for (const block of page.blocks) {
          const row = document.createElement("div");
          row.className = "reading-block";
          const margin = document.createElement("span");
          margin.className = "reading-page";
          const paragraph = document.createElement("p");
          paragraph.textContent = block;
          row.append(margin, paragraph);
          pageNode.appendChild(row);
        }
        probe.appendChild(pageNode);
        tallest = Math.max(tallest, measure(pageNode));
      }

      if (tallest <= capacity + 1) return budget;
      const next = fitMaxWords({
        budget,
        words: budget,
        contentHeight: tallest,
        capacity,
        maxWords: ceiling,
      });
      if (next >= budget) return budget;
      budget = next;
    }
    return budget;
  } finally {
    probe.remove();
  }
}

function clampIndex(value: number, total: number): number {
  if (total <= 0) return 0;
  const safe = Number.isFinite(value) ? Math.floor(value) : 0;
  return Math.max(0, Math.min(total - 1, safe));
}

function normalize(text: string): string {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function pixels(value: string): number {
  const parsed = Number.parseFloat(value || "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function PagedReading({
  blocks,
  blockPages,
  maxWords = DEFAULT_MAX_WORDS,
  initialPage = 0,
  onPageChange,
  onAfterLast,
  footerNote,
  className,
}: PagedReadingProps) {
  const ceiling = Math.max(MIN_MAX_WORDS, Math.floor(maxWords));
  const [budget, setBudget] = useState(() => ceiling);
  const pages = useMemo(
    () => paginateBlocks(blocks, { maxWords: budget }),
    [blocks, budget],
  );
  const total = pages.length;

  const [index, setIndex] = useState(() => clampIndex(initialPage, total));
  const [measureTick, setMeasureTick] = useState(0);
  // Altura do quadro: o que sobra da tela acima das barras fixas do app. Sem
  // isso o "1 de 12" e as setas caíam atrás da barra de ações no celular.
  const [frameHeight, setFrameHeight] = useState<number | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<string | null>(null);
  const emittedRef = useRef<number>(clampIndex(initialPage, total));
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  // A posição sobrevive a uma recalibração: guarda a âncora da página atual.
  useLayoutEffect(() => {
    if (total === 0) return;
    const anchor = anchorRef.current;
    if (anchor) {
      const found = pages.findIndex((page) => page.startsAt === anchor);
      anchorRef.current = null;
      setIndex(found >= 0 ? found : clampIndex(index, total));
      return;
    }
    if (index > total - 1) setIndex(total - 1);
  }, [pages, total, index]);

  // Altura disponível e recalibração por seção / rotação de tela.
  useEffect(() => {
    const computeHeight = () => {
      const frame = frameRef.current;
      if (!frame || typeof window === "undefined") return;
      const rect = frame.getBoundingClientRect();
      const narrow = window.innerWidth < 768;
      // Pager + barra de ações fixa + barra de navegação do app.
      const reserve = narrow ? 168 : 104;
      const available = window.innerHeight - rect.top - reserve;
      setFrameHeight(Math.max(220, Math.min(640, Math.round(available))));
    };
    computeHeight();
    const onResize = () => {
      computeHeight();
      setMeasureTick((tick) => tick + 1);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    window.addEventListener("scroll", computeHeight, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.removeEventListener("scroll", computeHeight);
    };
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    const body = bodyRef.current;
    if (!frame || !body) return;
    const style = getComputedStyle(body);
    const capacity =
      body.clientHeight -
      pixels(style.paddingTop) -
      pixels(style.paddingBottom);
    const width =
      body.clientWidth - pixels(style.paddingLeft) - pixels(style.paddingRight);
    const next = calibrateBudget(blocks, {
      capacity,
      width,
      ceiling,
      mount: frame.parentElement ?? document.body,
    });
    if (next === budget) return;
    anchorRef.current = pages[index]?.startsAt ?? null;
    setBudget(next);
    // Recalibra por seção / tela / fonte carregada — nunca a cada virada de
    // página, senão a contagem "X de Y" muda no meio da leitura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, ceiling, frameHeight, measureTick]);

  // Fontes carregadas mudam a altura do texto: recalibra uma vez.
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;
    let alive = true;
    document.fonts.ready
      .then(() => {
        if (alive) setMeasureTick((tick) => tick + 1);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (emittedRef.current === index) return;
    emittedRef.current = index;
    onPageChange?.(index, total);
  }, [index, total, onPageChange]);

  const advance = useCallback(() => {
    if (index >= total - 1) {
      onAfterLast?.();
      return;
    }
    setIndex(index + 1);
  }, [index, total, onAfterLast]);

  const retreat = useCallback(() => {
    setIndex(Math.max(0, index - 1));
  }, [index]);

  // Teclado: ← → (e PageUp/PageDown para quem vem de leitores de PDF).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (target?.isContentEditable) return;
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        advance();
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        retreat();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [advance, retreat]);

  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches?.[0];
    touchRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const onTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = touchRef.current;
    touchRef.current = null;
    const touch = event.changedTouches?.[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy)) return;
    if (dx < 0) advance();
    else retreat();
  };

  const page = pages[index] ?? null;

  // Página do PDF (metadado do importador) do primeiro bloco desta página.
  const pdfPage = useMemo(() => {
    if (!page || !blockPages || blockPages.length === 0) return undefined;
    const anchor = page.startsAt;
    const found = blocks.findIndex(
      (block, position) =>
        blockPages[position] != null &&
        normalize(block).slice(0, anchor.length) === anchor,
    );
    return found >= 0 ? blockPages[found] : undefined;
  }, [page, blockPages, blocks]);

  if (total === 0) return null;

  return (
    <section className={className}>
      <div
        ref={frameRef}
        data-testid="reading-page-frame"
        className="reading-page-frame relative overflow-hidden px-1 pt-3"
        style={{
          height: frameHeight
            ? frameHeight + "px"
            : "clamp(300px, 56vh, 640px)",
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          ref={bodyRef}
          role="region"
          aria-label={`Página ${index + 1} de ${total}`}
          aria-live="polite"
          tabIndex={0}
          data-testid="reading-page"
          className="reading-page-body reading-prose h-full overflow-hidden rounded-md px-3 pb-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-shadow)] sm:px-4"
        >
          {(page?.blocks ?? []).map((block, position) => (
            <div key={`pagina-${index}-${position}`} className="reading-block">
              <span className="reading-page" aria-hidden="true">
                {position === 0 && pdfPage ? `p. ${pdfPage}` : ""}
              </span>
              <p>{block}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-2 py-1.5">
        <button
          type="button"
          aria-label="Página anterior"
          disabled={index === 0}
          onClick={retreat}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-secondary disabled:opacity-35"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Anterior
        </button>
        <span
          data-testid="page-indicator"
          className="text-[11px] tabular-nums text-muted-foreground"
        >
          {index + 1} de {total}
        </span>
        <button
          type="button"
          aria-label="Próxima página"
          disabled={index >= total - 1 && !onAfterLast}
          onClick={advance}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-secondary disabled:opacity-35"
        >
          Próxima
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {footerNote}
    </section>
  );
}

export default PagedReading;
