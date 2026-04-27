/** @vitest-environment node */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as storage from "../server/jsonStorage";

const TEST_DATA_DIR = path.join(process.cwd(), "test-data-exhaustive-v2");

describe("jsonStorage Exhaustive Coverage V2", () => {
  let userId: number;

  beforeEach(async () => {
    storage.setDataDir(TEST_DATA_DIR);
    storage.resetCache();
    if (fs.existsSync(TEST_DATA_DIR))
      fs.rmSync(TEST_DATA_DIR, { recursive: true });
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

    await storage.upsertUser({ openId: "u1", name: "User1" });
    const user = (await storage.getUserByOpenId("u1"))!;
    userId = user.id;
  });

  afterEach(async () => {
    if (fs.existsSync(TEST_DATA_DIR))
      fs.rmSync(TEST_DATA_DIR, { recursive: true });
  });

  it("should handle Mock Exams CRUD", async () => {
    const exam = await storage.createMockExam({
      userId,
      name: "Mock 1",
      date: "2024-05-01",
      score: 80,
      totalQuestions: 100,
      disciplineStats: {},
    });
    expect(exam.id).toBeDefined();

    const exams = await storage.getMockExamsByUser(userId);
    expect(exams).toHaveLength(1);

    await storage.updateMockExam(exam.id, userId, { score: 85 });
    const updated = await storage.getMockExamsByUser(userId);
    expect(updated[0].score).toBe(85);

    await storage.deleteMockExam(exam.id, userId);
    expect(await storage.getMockExamsByUser(userId)).toHaveLength(0);
  });

  it("should handle Notes CRUD", async () => {
    await storage.createNote({
      userId,
      title: "Note 1",
      content: "Content 1",
    });
    let notes = await storage.getNotesByUser(userId);
    expect(notes).toHaveLength(1);

    const noteId = notes[0].id;
    await storage.updateNote(noteId, userId, { content: "Content 1 Modified" });
    notes = await storage.getNotesByUser(userId);
    expect(notes[0].content).toBe("Content 1 Modified");

    await storage.upsertNote({
      id: noteId,
      userId,
      disciplineId: 1,
      title: "Note 1 Upserted",
      content: "Content Upserted",
    });
    notes = await storage.getNotesByUser(userId);
    expect(notes[0].title).toBe("Note 1 Upserted");

    await storage.deleteNote(noteId, userId);
    expect(await storage.getNotesByUser(userId)).toHaveLength(0);
  });

  it("should handle Revisions detailed ops", async () => {
    const { id: discId } = await storage.createDiscipline({
      userId,
      name: "D1",
      color: "#000",
      weight: 1,
    });
    const { id: topicId } = await storage.createTopic({
      userId,
      disciplineId: discId,
      name: "T1",
      studyDate: "2024-01-01",
      notes: "",
    });

    await storage.createRevisions([
      {
        userId,
        topicId,
        scheduledDate: "2024-01-02",
        type: "revision",
        revisionNumber: 1,
      },
      {
        userId,
        topicId,
        scheduledDate: "2024-01-08",
        type: "revision",
        revisionNumber: 2,
      },
      {
        userId,
        topicId,
        scheduledDate: "2024-02-01",
        type: "revision",
        revisionNumber: 3,
      },
    ]);

    let revisions = await storage.getRevisionsByUser(userId);
    expect(revisions).toHaveLength(3);

    const revId = revisions[0].id;
    await storage.markRevisionCompleted(revId, userId, true);
    revisions = await storage.getRevisionsByUser(userId);
    expect(revisions.find((r) => r.id === revId)?.completed).toBe(true);

    await storage.rescheduleRevision(revisions[1].id, userId, "2024-02-01");
    revisions = await storage.getRevisionsByUser(userId);
    expect(revisions.find((r) => r.id === revisions[1].id)?.scheduledDate).toBe(
      "2024-02-01",
    );

    await storage.markRevisionIgnored(revisions[2].id, userId, true);
    revisions = await storage.getRevisionsByUser(userId);
    expect(revisions.find((r) => r.id === revisions[2].id)?.ignored).toBe(true);

    await storage.updateRevisionLink(revId, userId, "http://test.com");
    revisions = await storage.getRevisionsByUser(userId);
    expect(revisions.find((r) => r.id === revId)?.link).toBe("http://test.com");
  });

  it("should handle Database Export/Import", async () => {
    await storage.createDiscipline({
      userId,
      name: "ExportMe",
      color: "#000",
      weight: 1,
    });
    const json = await storage.exportDatabase();
    expect(json).toContain("ExportMe");

    storage.resetCache();
    await storage.importDatabase(json);
    const disciplines = await storage.getDisciplinesByUser(userId);
    expect(disciplines.some((d) => d.name === "ExportMe")).toBe(true);
  });

  it("should handle Topic Performance and History", async () => {
    const { id: discId } = await storage.createDiscipline({
      userId,
      name: "D1",
      color: "#000",
      weight: 1,
    });
    const { id: topicId } = await storage.createTopic({
      userId,
      disciplineId: discId,
      name: "T1",
      studyDate: "2024-01-01",
      notes: "",
    });

    await storage.updateTopicPerformance(topicId, userId, {
      correctCount: 10,
      errorCount: 2,
    });
    let topic = await storage.getTopicById(topicId, userId);
    expect(topic?.performance?.accuracy).toBe(83);

    await storage.setTopicPerformance(topicId, userId, {
      correctCount: 20,
      errorCount: 5,
      errorByTheory: 3,
      errorByAttention: 2,
    });
    topic = await storage.getTopicById(topicId, userId);
    expect(topic?.performance?.accuracy).toBe(80);
    expect(topic?.performance?.errorByTheory).toBe(3);

    await storage.addTopicStudyTime(topicId, userId, 3600);
    topic = await storage.getTopicById(topicId, userId);
    expect(topic?.studyTimeSeconds).toBe(3600);

    await storage.resetAllTopicStats(userId);
    topic = await storage.getTopicById(topicId, userId);
    expect(topic?.performance?.questionsResolved).toBe(0);
    expect(topic?.studyTimeSeconds).toBe(0);
  });

  it("should handle Reordering", async () => {
    const { id: d1 } = await storage.createDiscipline({
      userId,
      name: "D1",
      color: "#000",
      weight: 1,
    });
    const { id: d2 } = await storage.createDiscipline({
      userId,
      name: "D2",
      color: "#000",
      weight: 1,
    });

    await storage.reorderDisciplines(userId, [d2, d1]);
    const disciplines = await storage.getDisciplinesByUser(userId);
    expect(disciplines.find((d) => d.id === d2)?.order).toBe(1);
    expect(disciplines.find((d) => d.id === d1)?.order).toBe(2);

    const { id: t1 } = await storage.createTopic({
      userId,
      disciplineId: d1,
      name: "T1",
      studyDate: "2024-01-01",
      notes: "",
    });
    const { id: t2 } = await storage.createTopic({
      userId,
      disciplineId: d1,
      name: "T2",
      studyDate: "2024-01-01",
      notes: "",
    });

    await storage.reorderTopics(userId, d1, [t2, t1]);
    const topics = await storage.getTopicsByUser(userId, { disciplineId: d1 });
    // Note: getTopicsByUser sorts by order
    expect(topics[0].id).toBe(t2);
    expect(topics[1].id).toBe(t1);
  });

  it("should handle Analytics and Heatmap", async () => {
    const today = new Date().toISOString().split("T")[0];
    const { id: discId } = await storage.createDiscipline({
      userId,
      name: "D1",
      color: "#000",
      weight: 1,
    });
    const { id: topicId } = await storage.createTopic({
      userId,
      disciplineId: discId,
      name: "T1",
      studyDate: today,
      notes: "",
      studyTimeSeconds: 3600,
    });

    await storage.updateTopicPerformance(topicId, userId, {
      correctCount: 10,
      errorCount: 0,
    });

    const stats = await storage.getDashboardStats(userId);
    expect(stats.totalTopics).toBe(1);
    expect(stats.disciplineStats[0].studyTimeSeconds).toBe(3600);

    const weekly = await storage.getWeeklyStats(userId);
    expect(weekly.thisWeek.questions).toBe(10);

    const heatmap = await storage.getStudyHeatmap(userId, 1);
    expect(heatmap.some((h) => h.date === today)).toBe(true);

    const neglected = await storage.getNeglectedDisciplines(userId, -1);
    expect(neglected.some((d) => d.name === "D1")).toBe(true);

    const comparison = await storage.getPeriodComparison(userId, 7);
    expect(comparison.current.questions).toBe(10);
  });

  it("should handle TEC Snapshots and Regressions", async () => {
    const topicA = {
      topicName: "T1",
      disciplineName: "D1",
      correctCount: 10,
      errorCount: 0,
      accuracy: 100,
      questionsResolved: 10,
    };
    const topicB = {
      topicName: "T1",
      disciplineName: "D1",
      correctCount: 5,
      errorCount: 5,
      accuracy: 50,
      questionsResolved: 10,
    };

    await storage.saveTecSnapshot(userId, [topicA]);
    await new Promise((r) => setTimeout(r, 100));
    await storage.saveTecSnapshot(userId, [topicB]);

    const snapshots = await storage.getTecSnapshots(userId);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].totalQuestions).toBe(10);

    const prev = await storage.getPreviousTecSnapshot(userId);
    expect(prev?.overallAccuracy).toBe(100);

    const regressions = await storage.getTecRegressions(userId, 5);
    expect(regressions).toHaveLength(1);
    expect(regressions[0].delta).toBe(-50);

    const weak = await storage.getWeakTopicsFromSnapshot(userId, 60);
    expect(weak).toHaveLength(1);
    expect(weak[0].accuracy).toBe(50);
  });

  it("should handle Forgetting Velocity and Recall Ratings", async () => {
    const { id: discId } = await storage.createDiscipline({
      userId,
      name: "D1",
      color: "#000",
      weight: 1,
    });
    const { id: topicId } = await storage.createTopic({
      userId,
      disciplineId: discId,
      name: "T1",
      studyDate: "2024-01-01",
      notes: "",
    });

    await storage.createRevisions([
      {
        userId,
        topicId,
        scheduledDate: "2024-01-02",
        type: "revision",
        revisionNumber: 1,
      },
      {
        userId,
        topicId,
        scheduledDate: "2024-01-08",
        type: "revision",
        revisionNumber: 6,
      },
    ]);

    let revisions = await storage.getRevisionsByUser(userId);
    await storage.markRevisionCompleted(revisions[0].id, userId, true);
    await storage.markRevisionCompleted(revisions[1].id, userId, true);

    await storage.saveRevisionRecallRating(
      revisions[0].id,
      userId,
      5,
      "Lembrei bem",
    );
    await storage.saveRevisionRecallRating(
      revisions[1].id,
      userId,
      2,
      "Esqueci",
    );

    const velocity = await storage.getForgettingVelocityByDiscipline(userId);
    expect(velocity[0].avgRecallAt25).toBe(5);
    expect(velocity[0].avgRecallAt50).toBe(2);
    expect(velocity[0].volatility).toBe("high");

    const lastRevDate = await storage.getLastRevisionDate(topicId, userId);
    expect(lastRevDate).toBeDefined();
  });

  it("should handle Cadernos and Error Analysis", async () => {
    await storage.saveCadernoTec(userId, {
      cadernoId: "c1",
      name: "Caderno 1",
      totalQuestions: 100,
      solvedCount: 10,
      accuracy: 90,
      lastUpdate: "2024-01-01",
    });
    // Cadernos are stored in db.cadernosTec[userId]
    const dbStr = await storage.exportDatabase();
    expect(dbStr).toContain("Caderno 1");

    const error = await storage.saveQuestionError({
      userId,
      topicId: 1,
      questionId: "q1",
      banca: "B",
      statement: "S",
      userAnswer: "A",
      correctAnswer: "C",
      errorOrigin: "theory",
      alternatives: [],
    });
    await storage.saveQuestionErrorAnalysis(
      error.id,
      userId,
      "AI Analysis Text",
    );
    const errors = await storage.getQuestionErrorsByUser(userId);
    expect(errors.items[0].aiAnalysis).toBe("AI Analysis Text");
  });

  it("should handle Session and Peak Hours", async () => {
    await storage.logStudySession(userId, 14, 60, 85, 1);
    const peak = await storage.getPeakHoursAnalysis(userId);
    expect(peak[0].hour).toBe(14);
    expect(peak[0].avgAccuracy).toBe(85);

    await storage.logStudyEndTime(userId, 23, true);
    const user = (await storage.getUserByOpenId("u1"))!;
    expect(user.settings.sleepLog?.[0].endStudyHour).toBe(23);
  });

  it("should handle Push Tokens", async () => {
    const token = await storage.generatePushToken(userId);
    expect(token).toHaveLength(64);

    const user = await storage.getUserByPushToken(token);
    expect(user?.id).toBe(userId);

    await storage.revokePushToken(userId);
    expect(await storage.getUserByPushToken(token)).toBeUndefined();
  });

  it("should handle Mentor Observations and Concept Confusions", async () => {
    await storage.addMentorObservation(userId, "Test Observation");
    const obs = await storage.getMentorObservations(userId);
    expect(obs[0]).toContain("Test Observation");

    await storage.addConceptConfusion(userId, {
      conceptA: "A",
      conceptB: "B",
      explanation: "Confusion",
    });
    const confusions = await storage.getConceptConfusions(userId);
    expect(confusions[0].conceptA).toBe("A");

    await storage.addConceptConfusion(userId, {
      conceptA: "A",
      conceptB: "B",
      explanation: "Confusion Updated",
    });
    const updated = await storage.getConceptConfusions(userId);
    expect(updated[0].occurrences).toBe(2);
  });

  it("should handle Exam Integration and Bulk Deletion", async () => {
    await storage.saveQuestionError({
      userId,
      topicId: 1,
      questionId: "q1",
      banca: "B",
      statement: "S",
      userAnswer: "A",
      correctAnswer: "C",
      errorOrigin: "theory",
      alternatives: [],
      contest: "PF2024",
    });

    expect(await storage.checkExamIntegrated("PF2024", userId)).toBe(true);
    await storage.deleteQuestionsByContest("PF2024", userId);
    expect(await storage.checkExamIntegrated("PF2024", userId)).toBe(false);
  });
});
