import { render, screen, fireEvent } from "@testing-library/react";
import { describe, test, expect, vi } from "vitest";
import { useState } from "react";
import StudyHub from "@/pages/StudyHub";
import { SegmentedControl } from "@/components/apple";

vi.mock("wouter", () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/openTecBrowser", () => ({
  openTecBrowser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      dashboard: { getStats: { invalidate: () => {} } },
      study: { overview: { invalidate: () => {} } },
    }),
    study: {
      importCaderno: {
        useMutation: () => ({ mutate: () => {}, isPending: false }),
      },
    },
    dashboard: {
      getStats: {
        useQuery: () => ({ data: { disciplineStats: [] }, isLoading: false }),
      },
    },
    revision: { list: { useQuery: () => ({ data: [], isLoading: false }) } },
    questionError: {
      list: {
        useQuery: () => ({ data: { items: [], total: 0 }, isLoading: false }),
      },
    },
    mockExam: { list: { useQuery: () => ({ data: [], isLoading: false }) } },
    import: {
      getICalUrl: {
        useQuery: () => ({ data: { token: "" }, isLoading: false }),
      },
    },
  },
}));

describe("StudyHub focado", () => {
  test("TEC é a ferramenta principal e as demais ficam no hub", () => {
    render(<StudyHub />);
    // O TEC aparece no hero (ferramenta principal) e também como atalho.
    expect(screen.getAllByText("Treino TEC").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("6 ferramentas")).toBeTruthy();
    expect(screen.getByText("3 áreas")).toBeTruthy();
    expect(screen.getByText("Revisões")).toBeTruthy();
    expect(screen.getByText("Questões erradas")).toBeTruthy();
    expect(screen.getByText("Flashcards")).toBeTruthy();
    expect(screen.getByText("Simulados")).toBeTruthy();
    expect(screen.getByText("Disciplinas")).toBeTruthy();
    expect(screen.getByText("Editais")).toBeTruthy();
    expect(screen.getByText("Anotações")).toBeTruthy();
  });
});

describe("SegmentedControl das telas focadas", () => {
  function Harness() {
    const [value, setValue] = useState<"browser" | "session" | "errors">(
      "browser",
    );
    return (
      <SegmentedControl
        value={value}
        onChange={setValue}
        options={[
          { value: "browser", label: "Questões" },
          { value: "session", label: "Sessões" },
          { value: "errors", label: "Erros" },
        ]}
      />
    );
  }

  test("troca a visão ativa ao clicar", () => {
    render(<Harness />);
    const questoes = screen.getByRole("tab", { name: "Questões" });
    const sessoes = screen.getByRole("tab", { name: "Sessões" });
    expect(questoes.getAttribute("aria-selected")).toBe("true");
    expect(sessoes.getAttribute("aria-selected")).toBe("false");

    fireEvent.click(sessoes);

    expect(sessoes.getAttribute("aria-selected")).toBe("true");
    expect(questoes.getAttribute("aria-selected")).toBe("false");
  });

  test("expõe as três visões do print de Treinos", () => {
    render(<Harness />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Questões",
      "Sessões",
      "Erros",
    ]);
  });
});
