import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PagedReading, {
  calibrateBudget,
  fitMaxWords,
} from "@/components/learning/PagedReading";
import { paginateBlocks } from "@shared/pagination";

/** Parágrafo de `n` palavras, único por `label`. */
function paragraph(label: string, n: number): string {
  const tail = Array.from({ length: n - 1 }, (_, i) => `${label}${i + 1}`);
  return `${label} pagina ${tail.join(" ")}.`;
}

const BLOCKS = [
  paragraph("alfa", 80),
  paragraph("beta", 80),
  paragraph("gama", 80),
];

function renderPaged(
  props: Partial<React.ComponentProps<typeof PagedReading>> = {},
) {
  return render(<PagedReading blocks={BLOCKS} maxWords={100} {...props} />);
}

afterEach(() => cleanup());

describe("leitor paginado", () => {
  it("mostra uma página por vez com 'X de Y'", () => {
    renderPaged();

    expect(screen.getByText("1 de 3")).toBeTruthy();
    expect(screen.getByText(/^alfa pagina/)).toBeTruthy();
    expect(screen.queryByText(/^beta pagina/)).toBeNull();
    expect(screen.queryByText(/^gama pagina/)).toBeNull();
  });

  it("avança e volta com os botões", () => {
    renderPaged();

    fireEvent.click(
      screen.getByRole("button", { name: /pr[óo]xima p[áa]gina/i }),
    );
    expect(screen.getByText("2 de 3")).toBeTruthy();
    expect(screen.getByText(/^beta pagina/)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /pr[óo]xima p[áa]gina/i }),
    );
    expect(screen.getByText("3 de 3")).toBeTruthy();
    // Na última página a seta desiste em vez de sair do documento.
    fireEvent.click(
      screen.getByRole("button", { name: /pr[óo]xima p[áa]gina/i }),
    );
    expect(screen.getByText("3 de 3")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /p[áa]gina anterior/i }),
    );
    expect(screen.getByText("2 de 3")).toBeTruthy();
  });

  it("avança e volta com o teclado (← →)", () => {
    renderPaged();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("2 de 3")).toBeTruthy();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("3 de 3")).toBeTruthy();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("2 de 3")).toBeTruthy();

    // Fora das setas não muda nada.
    fireEvent.keyDown(window, { key: "a" });
    expect(screen.getByText("2 de 3")).toBeTruthy();
  });

  it("o container da página não rola na vertical", () => {
    renderPaged();

    const region = screen.getByTestId("reading-page");
    const frame = screen.getByTestId("reading-page-frame");
    for (const node of [region, frame]) {
      expect(node.className).not.toMatch(/overflow-y-(auto|scroll)/);
      expect(node.style.overflowY).not.toMatch(/auto|scroll/);
      expect(node.style.overflow).not.toMatch(/auto|scroll/);
    }
    // Nenhum descendente da página pode rolar.
    const scrollables = Array.from(
      region.querySelectorAll(
        "[class*='overflow-y-auto'], [class*='overflow-y-scroll']",
      ),
    );
    expect(scrollables).toHaveLength(0);
    // E a página ocupa o quadro inteiro (é o quadro que define a altura).
    expect(region.className).toMatch(/\bh-full\b/);
  });

  it("anuncia a página para leitores de tela", () => {
    renderPaged();
    const region = screen.getByTestId("reading-page");
    expect(region.getAttribute("role")).toBe("region");
    expect(region.getAttribute("aria-label")).toBe("Página 1 de 3");

    fireEvent.click(
      screen.getByRole("button", { name: /pr[óo]xima p[áa]gina/i }),
    );
    expect(region.getAttribute("aria-label")).toBe("Página 2 de 3");
  });

  it("abre na página persistida e avisa cada mudança", () => {
    const seen: number[] = [];
    renderPaged({ initialPage: 1, onPageChange: (page) => seen.push(page) });

    expect(screen.getByText("2 de 3")).toBeTruthy();
    expect(screen.getByText(/^beta pagina/)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /pr[óo]xima p[áa]gina/i }),
    );
    expect(seen).toContain(2);

    // Fecha e reabre na última página vista (o componente recebe a posição).
    cleanup();
    renderPaged({ initialPage: seen[seen.length - 1] });
    expect(screen.getByText("3 de 3")).toBeTruthy();
  });

  it("passa de página com swipe horizontal", () => {
    renderPaged();
    const frame = screen.getByTestId("reading-page-frame");

    fireEvent.touchStart(frame, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchEnd(frame, {
      changedTouches: [{ clientX: 120, clientY: 210 }],
    });
    expect(screen.getByText("2 de 3")).toBeTruthy();

    fireEvent.touchStart(frame, { touches: [{ clientX: 120, clientY: 200 }] });
    fireEvent.touchEnd(frame, {
      changedTouches: [{ clientX: 300, clientY: 205 }],
    });
    expect(screen.getByText("1 de 3")).toBeTruthy();
  });
});

describe("fitMaxWords", () => {
  it("encolhe proporcionalmente quando o texto passa da altura", () => {
    // 120 palavras em 600px num quadro de 300px -> ~metade do orçamento.
    expect(
      fitMaxWords({
        budget: 220,
        words: 120,
        contentHeight: 600,
        capacity: 300,
        maxWords: 220,
      }),
    ).toBe(58);
  });

  it("não mexe quando a página cabe", () => {
    expect(
      fitMaxWords({
        budget: 100,
        words: 95,
        contentHeight: 400,
        capacity: 460,
        maxWords: 220,
      }),
    ).toBe(100);
  });

  it("respeita o piso mínimo", () => {
    expect(
      fitMaxWords({
        budget: 60,
        words: 300,
        contentHeight: 2000,
        capacity: 100,
        maxWords: 220,
      }),
    ).toBe(40);
  });
});

describe("calibrateBudget", () => {
  const measure = (node: HTMLElement) =>
    (node.textContent || "").split(/\s+/).filter(Boolean).length * 4;

  it("reduz o orçamento até a página mais alta caber", () => {
    const blocks = Array.from({ length: 6 }, (_, i) =>
      paragraph(`longa${i}`, 80),
    );
    const budget = calibrateBudget(blocks, {
      capacity: 400,
      width: 300,
      ceiling: 220,
      measure,
    });

    expect(budget).toBeLessThan(220);
    const pages = paginateBlocks(blocks, { maxWords: budget });
    expect(pages.length).toBeGreaterThan(3);
    for (const page of pages) {
      const words = page.blocks.join(" ").split(/\s+/).filter(Boolean).length;
      expect(words * 4).toBeLessThanOrEqual(401);
    }
  });

  it("mantém o teto quando não há layout para medir", () => {
    const blocks = [paragraph("a", 60), paragraph("b", 60)];
    expect(
      calibrateBudget(blocks, {
        capacity: 0,
        width: 300,
        ceiling: 220,
        measure,
      }),
    ).toBe(220);
  });
});
