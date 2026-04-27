/** @vitest-environment node */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "../server/routers";
import * as storage from "../server/db";

vi.mock("../server/db");
vi.mock("../server/analyticsService");
vi.mock("../server/aiProviders");
vi.mock("../server/tecImportService");

const ctx = {
  user: { id: 1 },
  req: { headers: { "x-forwarded-proto": "https", host: "localhost" } },
  res: { clearCookie: vi.fn() },
};

const DISC = [
  {
    id: 1,
    name: "D1",
    color: "#000",
    weight: 1,
    studyTimeSeconds: 0,
    performance: undefined,
  },
];
const TOPICS = [
  {
    id: 1,
    disciplineId: 1,
    name: "T1",
    studyDate: "2024-01-01",
    studyTimeSeconds: 0,
    notes: null,
    createdAt: "",
    updatedAt: "",
  },
];
const REVISIONS = [
  {
    id: 1,
    topicId: 1,
    scheduledDate: "2024-01-01",
    type: "revision",
    revisionNumber: 1,
    completed: false,
    ignored: false,
    completedAt: null,
    createdAt: "",
    updatedAt: "",
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(storage.getDisciplinesByUser).mockResolvedValue(DISC as any);
  vi.mocked(storage.getTopicsByUser).mockResolvedValue(TOPICS as any);
  vi.mocked(storage.getRevisionsByUser).mockResolvedValue(REVISIONS as any);
  vi.mocked(storage.getUserSettings).mockResolvedValue({
    exams: [],
    studySessionLog: [],
    onboardingCompleted: true,
  } as any);
  vi.mocked(storage.updateUserSettings).mockResolvedValue(undefined);
  vi.mocked(storage.createDiscipline).mockResolvedValue({ id: 2 } as any);
  vi.mocked(storage.updateDiscipline).mockResolvedValue(undefined);
  vi.mocked(storage.deleteDiscipline).mockResolvedValue(undefined);
  vi.mocked(storage.reorderDisciplines).mockResolvedValue(undefined);
  vi.mocked(storage.createTopic).mockResolvedValue({ id: 2 } as any);
  vi.mocked(storage.updateTopic).mockResolvedValue(undefined);
  vi.mocked(storage.deleteTopic).mockResolvedValue(undefined);
  vi.mocked(storage.createRevisions).mockResolvedValue(undefined);
  vi.mocked(storage.setTopicPerformance).mockResolvedValue(undefined);
  vi.mocked(storage.addTopicStudyTime).mockResolvedValue(undefined);
  vi.mocked(storage.reorderTopics).mockResolvedValue(undefined);
  vi.mocked(storage.resetAllTopicStats).mockResolvedValue(undefined);
  vi.mocked(storage.markRevisionCompleted).mockResolvedValue(undefined);
  vi.mocked(storage.markRevisionIgnored).mockResolvedValue(undefined);
  vi.mocked(storage.saveRevisionRecallRating).mockResolvedValue(undefined);
  vi.mocked(storage.rescheduleRevision).mockResolvedValue(undefined);
  vi.mocked(storage.getNotesByUser).mockResolvedValue([]);
  vi.mocked(storage.upsertNote).mockResolvedValue({ id: 1 } as any);
  vi.mocked(storage.deleteNote).mockResolvedValue(undefined);
  vi.mocked(storage.getFlashcardsByUser).mockResolvedValue([]);
  vi.mocked(storage.createFlashcard).mockResolvedValue({ id: 1 } as any);
  vi.mocked(storage.reviewFlashcard).mockResolvedValue({ id: 1 } as any);
  vi.mocked(storage.archiveFlashcard).mockResolvedValue(undefined);
  vi.mocked(storage.deleteFlashcard).mockResolvedValue(undefined);
  vi.mocked(storage.getQuestionErrorsByUser).mockResolvedValue({
    items: [],
    total: 0,
    hasMore: false,
    nextOffset: 0,
  });
  vi.mocked(storage.saveQuestionError).mockResolvedValue({ id: 1 } as any);
  vi.mocked(storage.deleteQuestionError).mockResolvedValue(undefined);
  vi.mocked(storage.getCalendarData).mockResolvedValue({
    revisions: [],
    topics: [],
    disciplines: [],
    studySessionLog: [],
  } as any);
  vi.mocked(storage.getTodayStudyMinutes).mockResolvedValue(45);
  vi.mocked(storage.generatePushToken).mockResolvedValue("token123");
  vi.mocked(storage.revokePushToken).mockResolvedValue(undefined);
});

describe("routers.ts — comprehensive procedure coverage", () => {
  const caller = appRouter.createCaller(ctx as any);

  it("auth procedures", async () => {
    await caller.auth.me();
    await caller.auth.logout();
    await caller.auth.updateSettings({ theme: "dark" });
  });

  it("discipline procedures", async () => {
    await caller.discipline.list();
    await caller.discipline.create({ name: "D", color: "#000000", weight: 1 });
    await caller.discipline.update({ id: 1, name: "D2" });
    await caller.discipline.delete({ id: 1 });
    await caller.discipline.reorder({ orderedIds: [1] });
  });

  it("topic procedures", async () => {
    await caller.topic.list();
    await caller.topic.create({
      name: "T",
      disciplineId: 1,
      studyDate: "2024-01-01",
    });
    await caller.topic.update({ id: 1, name: "T2" });
    await caller.topic.delete({ id: 1 });
  });

  it("revision procedures", async () => {
    await caller.revision.list();
    await caller.revision.markCompleted({ id: 1, completed: true });
    await caller.revision.markIgnored({ id: 1, ignored: true });
  });

  it("import procedures", async () => {
    await caller.import.listCadernos();
    await caller.import.generatePushToken();
    await caller.import.exportBackup();
  });

  it("dashboard procedures", async () => {
    await caller.dashboard.getStats();
    await caller.dashboard.getWeeklyStats();
    await caller.dashboard.getHeatmap({ months: 6 });
    await caller.dashboard.getTodayMinutes();
    await caller.dashboard.getPeriodComparison({ days: 7 });
    await caller.dashboard.getNeglectedDisciplines({ thresholdDays: 7 });
  });

  it("calendar procedures", async () => {
    await caller.calendar.getData({
      startDate: "2024-01-01",
      endDate: "2024-01-31",
    });
  });

  it("v10 procedures", async () => {
    await caller.v10.saveRecallRating({ revisionId: 1, rating: 5 });
    await caller.v10.logStudySession({
      hourStart: 10,
      durationMin: 60,
      accuracy: 0.8,
    });
    await caller.v10.logStudyEnd({ endHour: 22, alertIssued: false });
    await caller.v10.getPeakHours();
    await caller.v10.getDisciplineRebalance();
    await caller.v10.getForgettingVelocity();
    await caller.v10.checkMassStudy();
    await caller.v10.getPreExamStatus();
    await caller.v10.updateV10Settings({ aiProvider: "gemini" });
  });
});
