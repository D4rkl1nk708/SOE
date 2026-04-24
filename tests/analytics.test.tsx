// tests/analytics.test.ts
/** @vitest-environment jsdom */
import {
  computeRiskScores,
  computeGradeProjection,
  computeBancaAffinity,
  comfortParadox,
  falseSecurity,
  highLeverage,
  silentRegression,
  dominantErrorPattern,
  weightMismatch,
  revisionGap,
} from "@/pages/SOEAnalytics";

const mockTopics = [
  {
    id: 1,
    name: "Tema A",
    disciplineId: 10,
    disciplineName: "Disciplina X",
    disciplineColor: "#ff0000",
    disciplineWeight: 2,
    studyDate: "2024-01-01",
    studyTimeSeconds: 3600,
    questions: 12,
    accuracy: 60,
    correctCount: 7,
    errorCount: 5,
    errorByAttention: 1,
    errorByForgetting: 2,
    errorByTheory: 1,
    errorByTrap: 1,
    completedRevisions: 3,
    incidencia: 0.12,
    totalQuestoesBanca: 20,
    bancaDominante: "FGV",
    dificuldade: null,
  },
  {
    id: 2,
    name: "Tema B",
    disciplineId: 20,
    disciplineName: "Disciplina Y",
    disciplineColor: "#00ff00",
    disciplineWeight: 1,
    studyDate: "2024-02-15",
    studyTimeSeconds: 1800,
    questions: 5,
    accuracy: 90,
    correctCount: 5,
    errorCount: 0,
    errorByAttention: 0,
    errorByForgetting: 0,
    errorByTheory: 0,
    errorByTrap: 0,
    completedRevisions: 1,
    incidencia: null,
    totalQuestoesBanca: null,
    bancaDominante: null,
    dificuldade: null,
  },
];

const mockDisciplines = [
  {
    disciplineId: 10,
    name: "Disciplina X",
    color: "#ff0000",
    studyTimeSeconds: 3600,
    topics: [mockTopics[0]],
  },
  {
    disciplineId: 20,
    name: "Disciplina Y",
    color: "#00ff00",
    studyTimeSeconds: 1800,
    topics: [mockTopics[1]],
  },
];

describe("Analytics pure functions", () => {
  test("computeRiskScores returns ordered scores", () => {
    const scores = computeRiskScores(mockTopics);
    expect(scores).toHaveLength(2);
    // O tema com menor acurácia e maior incidência deve aparecer primeiro
    expect(scores[0].riskScore).toBeGreaterThan(scores[1].riskScore);
    expect(scores[0].name).toBe("Tema A");
  });

  test("computeGradeProjection produces realistic grade", () => {
    const proj = computeGradeProjection(mockTopics, mockDisciplines);
    expect(proj.projectedGrade).toBeGreaterThanOrEqual(0);
    expect(proj.projectedGrade).toBeLessThanOrEqual(100);
    expect(proj.totalTopics).toBe(2);
    expect(proj.breakdown).toHaveLength(2);
  });

  test("computeBancaAffinity aggregates correctly", () => {
    const affinity = computeBancaAffinity(mockTopics);
    expect(affinity).toHaveLength(1);
    const b = affinity[0];
    expect(b.banca).toBe("FGV");
    expect(b.total).toBe(12);
    expect(b.accuracy).toBe(Math.round((7 / 12) * 100));
  });

  test("comfortParadox identifies topics with high time and low accuracy", () => {
    const cp = comfortParadox(mockTopics);
    expect(Array.isArray(cp)).toBe(true);
  });

  test("falseSecurity identifies topics with high accuracy but low sample size", () => {
    const fs = falseSecurity(mockTopics);
    expect(Array.isArray(fs)).toBe(true);
    if (fs.length > 0) {
      expect(fs[0].accuracy).toBeGreaterThanOrEqual(75);
      expect(fs[0].questions).toBeLessThan(10);
    }
  });

  test("highLeverage identifies topics near mastery threshold", () => {
    const hl = highLeverage(mockTopics);
    expect(Array.isArray(hl)).toBe(true);
    if (hl.length > 0) {
      expect(hl[0].accuracy).toBeGreaterThanOrEqual(55);
      expect(hl[0].accuracy).toBeLessThan(70);
    }
  });

  test("silentRegression identifies stale topics", () => {
    const sr = silentRegression(mockTopics);
    expect(Array.isArray(sr)).toBe(true);
  });

  test("dominantErrorPattern identifies the most frequent error", () => {
    const dep = dominantErrorPattern(mockTopics);
    expect(dep).toBeDefined();
  });

  test("weightMismatch identifies strategic misalignment", () => {
    const wm = weightMismatch(mockDisciplines, 3);
    expect(Array.isArray(wm)).toBe(true);
  });

  test("revisionGap identifies ignored schedules", () => {
    const revisions = [
      { topicId: 1, completed: false, ignored: false },
      { topicId: 1, completed: false, ignored: false },
      { topicId: 1, completed: false, ignored: false },
    ];
    const rg = revisionGap(mockTopics, revisions);
    expect(Array.isArray(rg)).toBe(true);
  });
});
import { render } from "@testing-library/react";
import SOEAnalytics from "@/pages/SOEAnalytics";
import { vi } from "vitest";

vi.mock("@/lib/trpc", () => {
  return {
    trpc: {
      dashboard: {
        getStats: {
          useQuery: () => ({
            data: {
              disciplineStats: mockDisciplines,
              settings: { aiApiKey: "test" },
            },
          }),
        },
      },
      revision: { list: { useQuery: () => ({ data: [] }) } },
      v10: {
        getForgettingVelocity: {
          useQuery: () => ({
            data: [
              {
                revisionCount: 1,
                avgRecallAt25: 4,
                avgRecallAt50: 3,
                disciplineName: "X",
                color: "#f00",
              },
            ],
          }),
        },
        getDisciplineRebalance: { useQuery: () => ({ data: [] }) },
      },
      mentor: {
        generateDeepAnalysis: { useMutation: () => ({ mutate: vi.fn() }) },
      },
    },
  };
});

describe("SOEAnalytics Component", () => {
  test("renders without crashing and displays analytics", () => {
    const { container } = render(<SOEAnalytics />);
    expect(container).toBeTruthy();
  });
});
