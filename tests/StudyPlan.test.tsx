import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import StudyPlan from "@/pages/StudyPlan";

const navigate = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/plan", navigate],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    discipline: {
      list: { useQuery: () => ({ data: [] }) },
    },
    study: {
      overview: {
        useQuery: () => ({
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
          data: {
            coverage: {
              totalRows: 2,
              mappedRows: 1,
              studiedRows: 1,
              masteredRows: 0,
              coveragePct: 50,
              weightedCoveragePct: 66,
              readiness: 42,
              weakTopics: 1,
              strongTopics: 0,
              disciplines: [
                {
                  name: "Direito Constitucional",
                  color: "#3b82f6",
                  rows: 2,
                  studied: 1,
                  weightedCoverage: 66,
                },
              ],
              priorities: [
                {
                  id: "r1",
                  topic: "Controle de Constitucionalidade",
                  discipline: "Direito Constitucional",
                  status: "estudado",
                  weight: 0.8,
                  readiness: 42,
                },
              ],
              unmapped: [],
            },
            mastery: {
              topics: 1,
              avgReadiness: 42,
              distribution: {},
              topWeak: [
                {
                  topicId: 10,
                  topicName: "Controle de Constitucionalidade",
                  disciplineName: "Direito Constitucional",
                  readiness: 42,
                },
              ],
            },
            plan: {
              date: "2026-01-01",
              dailyMinutes: 120,
              plannedMinutes: 45,
              overdueRevisions: 0,
              blocks: [
                {
                  id: "weak-10",
                  kind: "questoes",
                  title: "Controle de Constitucionalidade",
                  subtitle: "Direito Constitucional",
                  reason: "Acurácia de 50% em 12 questões",
                  minutes: 25,
                  topicId: 10,
                  topicName: "Controle de Constitucionalidade",
                  disciplineId: 1,
                  disciplineName: "Direito Constitucional",
                  color: "#3b82f6",
                  score: 50,
                  route: "/question-session",
                },
              ],
            },
          },
        }),
      },
      errorPatterns: {
        useQuery: () => ({
          data: { total: 0, byOrigin: [], topTopics: [] },
        }),
      },
      weeklyReview: {
        useQuery: () => ({ data: null }),
      },
    },
  },
}));

describe("StudyPlan", () => {
  test("renderiza cobertura, plano e prioridades", () => {
    render(<StudyPlan />);
    expect(screen.getByText("Plano de aprovação")).toBeTruthy();
    expect(screen.getByText("Cobertura do edital")).toBeTruthy();
    expect(
      screen.getAllByText("Controle de Constitucionalidade").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Começar")).toBeTruthy();
  });

  test("inicia um bloco de questões", () => {
    render(<StudyPlan />);
    fireEvent.click(screen.getByText("Começar"));
    expect(navigate).toHaveBeenCalledWith("/question-session");
  });
});
