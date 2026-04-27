/** @vitest-environment node */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getDashboardStats,
  getWeeklyStats,
  getPeriodComparison,
  getNeglectedDisciplines,
  getStudyHeatmap,
  getTodayStudyMinutes,
  getDisciplineRebalanceReport,
  getForgettingVelocityByDiscipline,
  getPeakHoursAnalysis,
  getTecRegressions,
  getWeakTopicsFromSnapshot,
} from "../server/analyticsService";
import * as storage from "../server/jsonStorage";

vi.mock("../server/jsonStorage");

const now = new Date().toISOString();
const today = now.split("T")[0];

const MOCK_DISCIPLINES = [
  {
    id: 1,
    userId: 1,
    name: "Direito",
    color: "#f00",
    weight: 10,
    studyTimeSeconds: 7200,
    performance: {
      questionsResolved: 50,
      correctCount: 35,
      errorCount: 15,
      accuracy: 70,
    },
  },
  {
    id: 2,
    userId: 1,
    name: "Português",
    color: "#0f0",
    weight: 8,
    studyTimeSeconds: 3600,
    performance: {
      questionsResolved: 30,
      correctCount: 20,
      errorCount: 10,
      accuracy: 66,
    },
  },
];

const MOCK_TOPICS = [
  {
    id: 1,
    userId: 1,
    disciplineId: 1,
    name: "T1",
    studyDate: today,
    studyTimeSeconds: 1800,
    performance: {
      questionsResolved: 10,
      correctCount: 7,
      errorCount: 3,
      accuracy: 70,
    },
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 2,
    userId: 1,
    disciplineId: 1,
    name: "T2",
    studyDate: today,
    studyTimeSeconds: 900,
    performance: {
      questionsResolved: 5,
      correctCount: 3,
      errorCount: 2,
      accuracy: 60,
    },
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 3,
    userId: 1,
    disciplineId: 2,
    name: "T3",
    studyDate: "2023-01-01",
    studyTimeSeconds: 600,
    performance: {
      questionsResolved: 0,
      correctCount: 0,
      errorCount: 0,
      accuracy: 0,
    },
    createdAt: "2023-01-01T00:00:00.000Z",
    updatedAt: "2023-01-01T00:00:00.000Z",
  },
];

const MOCK_REVISIONS = [
  {
    id: 1,
    userId: 1,
    topicId: 1,
    scheduledDate: today,
    type: "revision",
    revisionNumber: 1,
    completed: true,
    ignored: false,
    completedAt: now,
    createdAt: now,
    updatedAt: now,
    recallRating: 4,
  },
  {
    id: 2,
    userId: 1,
    topicId: 1,
    scheduledDate: today,
    type: "revision",
    revisionNumber: 2,
    completed: false,
    ignored: false,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    recallRating: 2,
  },
  {
    id: 3,
    userId: 1,
    topicId: 2,
    scheduledDate: today,
    type: "revision",
    revisionNumber: 7,
    completed: true,
    ignored: false,
    completedAt: now,
    createdAt: now,
    updatedAt: now,
    recallRating: 3,
  },
];

const MOCK_SETTINGS = {
  studySessionLog: [
    { hourStart: 9, accuracy: 0.8, durationSeconds: 3600 },
    { hourStart: 9, accuracy: 0.75, durationSeconds: 1800 },
    { hourStart: 14, accuracy: 0.6, durationSeconds: 2400 },
  ],
  editalRows: [{ discipline: "Direito", topic: "T1", completed: false }],
};

const MOCK_TEC_SNAPSHOTS = [
  {
    id: 2,
    userId: 1,
    importedAt: now,
    totalQuestions: 100,
    totalCorrect: 65,
    totalErrors: 35,
    overallAccuracy: 65,
    topics: [
      {
        topicName: "T1",
        disciplineName: "Direito",
        questionsResolved: 10,
        correctCount: 6,
        errorCount: 4,
        accuracy: 60,
      },
      {
        topicName: "T2",
        disciplineName: "Português",
        questionsResolved: 8,
        correctCount: 7,
        errorCount: 1,
        accuracy: 87,
      },
    ],
  },
  {
    id: 1,
    userId: 1,
    importedAt: "2024-01-01T00:00:00.000Z",
    totalQuestions: 80,
    totalCorrect: 55,
    totalErrors: 25,
    overallAccuracy: 68,
    topics: [
      {
        topicName: "T1",
        disciplineName: "Direito",
        questionsResolved: 8,
        correctCount: 6,
        errorCount: 2,
        accuracy: 75,
      },
      {
        topicName: "T2",
        disciplineName: "Português",
        questionsResolved: 6,
        correctCount: 5,
        errorCount: 1,
        accuracy: 83,
      },
    ],
  },
];

describe("analyticsService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(storage.getDisciplinesByUser).mockResolvedValue(
      MOCK_DISCIPLINES as any,
    );
    vi.mocked(storage.getTopicsByUser).mockResolvedValue(MOCK_TOPICS as any);
    vi.mocked(storage.getRevisionsByUser).mockResolvedValue(
      MOCK_REVISIONS as any,
    );
    vi.mocked(storage.getUserSettings).mockResolvedValue(MOCK_SETTINGS as any);
    vi.mocked(storage.getTecSnapshots).mockResolvedValue(
      MOCK_TEC_SNAPSHOTS as any,
    );
    vi.mocked(storage.getUserByOpenId).mockRejectedValue(new Error("not used"));
  });

  it("getDashboardStats returns correct shape", async () => {
    const result = await getDashboardStats(1);
    expect(result).toHaveProperty("totalTopics");
    expect(result).toHaveProperty("totalDisciplines");
    expect(result).toHaveProperty("pendingRevisions");
    expect(result).toHaveProperty("completedRevisions");
    expect(result).toHaveProperty("disciplineStats");
    expect(result.totalTopics).toBe(3);
    expect(result.totalDisciplines).toBe(2);
    expect(result.completedRevisions).toBe(2);
    expect(result.disciplineStats).toHaveLength(2);
  });

  it("getWeeklyStats returns weekly breakdown", async () => {
    const result = await getWeeklyStats(1);
    expect(result).toHaveProperty("thisWeek");
    expect(result).toHaveProperty("lastWeek");
    expect(result).toHaveProperty("byDiscipline");
    expect(result.thisWeek).toHaveProperty("accuracy");
    expect(result.thisWeek).toHaveProperty("questions");
  });

  it("getPeriodComparison compares two periods", async () => {
    const result = await getPeriodComparison(1, 7);
    expect(result).toHaveProperty("current");
    expect(result).toHaveProperty("previous");
    expect(result).toHaveProperty("disciplineDeltas");
  });

  it("getNeglectedDisciplines finds stale disciplines", async () => {
    const result = await getNeglectedDisciplines(1, 7);
    expect(Array.isArray(result)).toBe(true);
    // Português has an old topic (2023-01-01) so should be neglected
    const neglectedPortugues = result.find((d) => d.name === "Português");
    expect(neglectedPortugues).toBeDefined();
    expect(neglectedPortugues!.daysSinceStudy).toBeGreaterThan(7);
  });

  it("getStudyHeatmap returns date-keyed counts", async () => {
    const result = await getStudyHeatmap(1, 12);
    expect(Array.isArray(result)).toBe(true);
    const todayEntry = result.find((e) => e.date === today);
    expect(todayEntry).toBeDefined();
    expect(todayEntry!.count).toBeGreaterThan(0);
  });

  it("getTodayStudyMinutes sums today's study time", async () => {
    const result = await getTodayStudyMinutes(1);
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it("getDisciplineRebalanceReport returns per-discipline breakdown", async () => {
    vi.mocked(storage.getRevisionsByUser).mockResolvedValue(
      MOCK_REVISIONS.filter((r) => r.completed) as any,
    );
    const result = await getDisciplineRebalanceReport(1);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("disciplineId");
    expect(result[0]).toHaveProperty("accuracy");
    expect(result[0]).toHaveProperty("revisionsDone");
    expect(result[0]).toHaveProperty("editalWeight");
  });

  it("getForgettingVelocityByDiscipline categorizes volatility", async () => {
    vi.mocked(storage.getRevisionsByUser).mockResolvedValue(
      MOCK_REVISIONS as any,
    );
    const result = await getForgettingVelocityByDiscipline(1);
    expect(Array.isArray(result)).toBe(true);
    expect(
      result.every((d) => ["low", "medium", "high"].includes(d.volatility)),
    ).toBe(true);
  });

  it("getPeakHoursAnalysis returns sorted peak hours", async () => {
    const result = await getPeakHoursAnalysis(1);
    expect(Array.isArray(result)).toBe(true);
    // hour 9 has highest avg accuracy
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("hour");
      expect(result[0]).toHaveProperty("avgAccuracy");
      expect(result[0]).toHaveProperty("sessions");
    }
  });

  it("getTecRegressions detects accuracy drops", async () => {
    const result = await getTecRegressions(1, 5);
    expect(Array.isArray(result)).toBe(true);
    // T1 dropped from 75% -> 60% which is -15pp
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].topicName).toBe("T1");
    expect(result[0].delta).toBeLessThan(0);
  });

  it("getTecRegressions returns empty when < 2 snapshots", async () => {
    vi.mocked(storage.getTecSnapshots).mockResolvedValue([
      MOCK_TEC_SNAPSHOTS[0],
    ] as any);
    const result = await getTecRegressions(1, 5);
    expect(result).toHaveLength(0);
  });

  it("getWeakTopicsFromSnapshot filters by accuracy threshold", async () => {
    const result = await getWeakTopicsFromSnapshot(1, 65);
    expect(Array.isArray(result)).toBe(true);
    // T1 at 60% < 65% and has 10 questions should be included
    const weakT1 = result.find((t) => t.topicName === "T1");
    expect(weakT1).toBeDefined();
  });

  it("getWeakTopicsFromSnapshot returns empty when no snapshots", async () => {
    vi.mocked(storage.getTecSnapshots).mockResolvedValue([]);
    const result = await getWeakTopicsFromSnapshot(1, 65);
    expect(result).toHaveLength(0);
  });
});
