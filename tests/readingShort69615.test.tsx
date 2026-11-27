import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PagedReading from "@/components/learning/PagedReading";
import { sectionLabel } from "@/components/learning/readingModel";

/** Parágrafo de `n` palavras, único por `label`. */
function paragraph(label: string, n: number): string {
  const tail = Array.from(
    { length: Math.max(0, n - 1) },
    (_, i) => `${label}${i + 1}`,
  );
  return `${label} pagina ${tail.join(" ")}.`;
}

afterEach(() => cleanup());

describe("C3 — página curta não boia num quadro alto (v6.9.15)", () => {
  // 96 + 96 + 11 palavras com orçamento de 100: três páginas, a última curta.
  const BLOCKS = [
    paragraph("alfa", 95),
    paragraph("beta", 95),
    paragraph("gama", 10),
  ];

  it("encolhe o quadro só na página com menos de 60% do orçamento", () => {
    render(<PagedReading blocks={BLOCKS} maxWords={100} />);
    const frame = screen.getByTestId("reading-page-frame");

    // Página cheia: quadro no tamanho reservado.
    expect(frame.getAttribute("data-short-page")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /pr[óo]xima p[áa]gina/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /pr[óo]xima p[áa]gina/i }),
    );
    expect(screen.getByText("3 de 3")).toBeTruthy();
    expect(frame.getAttribute("data-short-page")).toBe("true");
    expect(frame.style.minHeight).toBe("176px");
  });

  it("o paginador não muda: a contagem de páginas continua a mesma", () => {
    render(<PagedReading blocks={BLOCKS} maxWords={100} />);
    expect(screen.getByText("1 de 3")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /pr[óo]xima p[áa]gina/i }),
    );
    expect(screen.getByText("2 de 3")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /pr[óo]xima p[áa]gina/i }),
    );
    expect(screen.getByText("3 de 3")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /p[áa]gina anterior/i }),
    );
    expect(screen.getByText("2 de 3")).toBeTruthy();
  });
});

describe("C2 — rótulo da seção no seletor do leitor (v6.9.15)", () => {
  it("tira a numeração do PDF para não repetir o título do documento", () => {
    expect(sectionLabel("1. 1 Introducao")).toBe("Introducao");
    expect(sectionLabel("2 Desenvolvimento")).toBe("Desenvolvimento");
    expect(sectionLabel("3.2.1 Dos atos")).toBe("Dos atos");
    expect(sectionLabel("Introducao")).toBe("Introducao");
    expect(sectionLabel(undefined)).toBe("");
  });
});
