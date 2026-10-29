import { render, screen } from "@testing-library/react";
import { describe, test, expect, vi } from "vitest";
import StudyHub from "@/pages/StudyHub";

vi.mock("wouter", () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/openTecBrowser", () => ({
  openTecBrowser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
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
    expect(screen.getByText("Treino TEC")).toBeTruthy();
    expect(screen.getByText("Ferramenta principal")).toBeTruthy();
    expect(screen.getByText("Revisões")).toBeTruthy();
    expect(screen.getByText("Questões erradas")).toBeTruthy();
    expect(screen.getByText("Flashcards")).toBeTruthy();
    expect(screen.getByText("Simulados")).toBeTruthy();
    expect(screen.getByText("Disciplinas")).toBeTruthy();
    expect(screen.getByText("Editais")).toBeTruthy();
    expect(screen.getByText("Anotações")).toBeTruthy();
  });
});
