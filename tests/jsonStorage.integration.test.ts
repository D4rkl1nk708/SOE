/** @vitest-environment node */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as storage from "../server/jsonStorage";

const TEST_DATA_DIR = path.join(process.cwd(), "test-data-integration");
const VALID_TOKEN = "token-very-long-and-secure-123";

describe("jsonStorage Integration Tests", () => {
  beforeEach(async () => {
    storage.setDataDir(TEST_DATA_DIR);
    storage.resetCache();
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  });

  afterEach(async () => {
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  it("should create and retrieve a user", async () => {
    await storage.upsertUser({
      openId: "user-123",
      name: "Test User",
      email: "test@example.com",
    });

    const user = (await storage.getUserByOpenId("user-123"))!;
    await storage.updateUserSettings(user.id, { pushToken: VALID_TOKEN });

    const retrieved = await storage.getUserByOpenId("user-123");
    expect(retrieved?.name).toBe("Test User");
    expect(retrieved?.id).toBe(1);

    const byToken = await storage.getUserByPushToken(VALID_TOKEN);
    expect(byToken?.openId).toBe("user-123");
  });

  it("should handle disciplines and topics", async () => {
    await storage.upsertUser({ openId: "u1", name: "User1" });
    const user = (await storage.getUserByOpenId("u1"))!;

    const { id: discId } = await storage.createDiscipline({
      userId: user.id,
      name: "Mathematics",
      color: "#ff0000",
      weight: 3,
    });

    expect(discId).toBe(1);

    const { id: topicId } = await storage.createTopic({
      userId: user.id,
      disciplineId: discId,
      name: "Algebra",
      studyDate: "2024-01-01",
      notes: "Intro to algebra",
    });

    expect(topicId).toBe(1);

    const topics = await storage.getTopicsByUser(user.id);
    expect(topics).toHaveLength(1);
    expect(topics[0].id).toBe(topicId);
    expect(topics[0].name).toBe("Algebra");
  });

  it("should update performance correctly", async () => {
    await storage.upsertUser({ openId: "u1", name: "User1" });
    const user = (await storage.getUserByOpenId("u1"))!;
    const { id: discId } = await storage.createDiscipline({
      userId: user.id,
      name: "Disc1",
      color: "#000",
      weight: 1,
    });
    const { id: topicId } = await storage.createTopic({
      userId: user.id,
      disciplineId: discId,
      name: "Topic1",
      studyDate: "2024-01-01",
      notes: "",
    });

    await storage.setTopicPerformance(topicId, user.id, {
      correctCount: 10,
      errorCount: 2,
      errorByAttention: 1,
      errorByTheory: 1,
    });

    const updatedTopics = await storage.getTopicsByUser(user.id);
    const updatedTopic = updatedTopics[0];
    expect(updatedTopic.performance).toBeDefined();
    expect(updatedTopic.performance?.correctCount).toBe(10);
    expect(updatedTopic.performance?.errorCount).toBe(2);
    expect(updatedTopic.performance?.accuracy).toBe(
      Math.round((10 / 12) * 100),
    );
    expect(updatedTopic.performance?.errorByAttention).toBe(1);
  });

  it("should handle revisions", async () => {
    await storage.upsertUser({ openId: "u1", name: "User1" });
    const user = (await storage.getUserByOpenId("u1"))!;
    const { id: topicId } = await storage.createTopic({
      userId: user.id,
      disciplineId: 99,
      name: "T1",
      studyDate: "2024-01-01",
      notes: "",
    });

    await storage.createRevisions([
      {
        userId: user.id,
        topicId: topicId,
        scheduledDate: "2024-05-01",
        type: "revision",
        revisionNumber: 1,
        completed: false,
      },
    ]);

    const revisions = await storage.getRevisionsByUser(user.id);
    expect(revisions.length).toBeGreaterThan(0);
    const rid = revisions[0].id;

    await storage.markRevisionCompleted(rid, user.id, true);

    const updated = await storage.getRevisionsByUser(user.id);
    const rev = updated.find((r) => r.id === rid);
    expect(rev?.completed).toBe(true);
  });

  it("should calculate dashboard stats correctly", async () => {
    await storage.upsertUser({ openId: "u1", name: "User1" });
    const user = (await storage.getUserByOpenId("u1"))!;
    const { id: d1 } = await storage.createDiscipline({
      userId: user.id,
      name: "D1",
      color: "#f00",
      weight: 1,
    });
    const { id: t1 } = await storage.createTopic({
      userId: user.id,
      disciplineId: d1,
      name: "T1",
      studyDate: "2024-01-01",
      notes: "",
    });
    const { id: t2 } = await storage.createTopic({
      userId: user.id,
      disciplineId: d1,
      name: "T2",
      studyDate: "2024-01-02",
      notes: "",
    });

    await storage.setTopicPerformance(t1, user.id, {
      correctCount: 5,
      errorCount: 0,
    });
    await storage.setTopicPerformance(t2, user.id, {
      correctCount: 0,
      errorCount: 5,
    });

    const stats = await storage.getDashboardStats(user.id);
    expect(stats.totalTopics).toBe(2);
    expect(stats.totalDisciplines).toBe(1);

    const d1Stats = stats.disciplineStats.find((s) => s.disciplineId === d1);
    expect(d1Stats?.performance?.questionsResolved).toBe(10);
    expect(d1Stats?.performance?.accuracy).toBe(50);
  });

  it("should handle notes CRUD", async () => {
    await storage.upsertUser({ openId: "u1", name: "User1" });
    const user = (await storage.getUserByOpenId("u1"))!;

    await storage.createNote({
      userId: user.id,
      title: "My Note",
      content: "Note content",
      disciplineId: 1,
    });

    let notes = await storage.getNotesByUser(user.id);
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe("My Note");
    const noteId = notes[0].id;

    await storage.updateNote(noteId, user.id, { title: "Updated Title" });
    notes = await storage.getNotesByUser(user.id);
    expect(notes[0].title).toBe("Updated Title");

    await storage.deleteNote(noteId, user.id);
    notes = await storage.getNotesByUser(user.id);
    expect(notes).toHaveLength(0);
  });

  it("should handle question errors", async () => {
    await storage.upsertUser({ openId: "u1", name: "User1" });
    const user = (await storage.getUserByOpenId("u1"))!;

    await storage.saveQuestionError({
      userId: user.id,
      topicId: 1,
      questionId: "#123",
      banca: "FGV",
      statement: "Statement",
      userAnswer: "A",
      correctAnswer: "B",
      errorOrigin: "attention",
      alternatives: [],
    });

    const result = await storage.getQuestionErrorsByUser(user.id);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].questionId).toBe("#123");
    expect(result.items[0].errorOrigin).toBe("attention");
  });

  it("should handle database export and import", async () => {
    await storage.upsertUser({ openId: "u1", name: "Original User" });
    const user = (await storage.getUserByOpenId("u1"))!;
    await storage.createDiscipline({
      userId: user.id,
      name: "Original Disc",
      color: "#000",
      weight: 1,
    });

    const backup = await storage.exportDatabase();
    expect(backup).toContain("Original User");

    // Clear and re-import
    storage.resetCache();
    if (fs.existsSync(TEST_DATA_DIR))
      fs.rmSync(TEST_DATA_DIR, { recursive: true });
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

    await storage.importDatabase(backup);
    const restoredUser = await storage.getUserByOpenId("u1");
    expect(restoredUser?.name).toBe("Original User");
  });

  it("should track study time correctly", async () => {
    await storage.upsertUser({ openId: "u1", name: "User1" });
    const user = (await storage.getUserByOpenId("u1"))!;
    const { id: discId } = await storage.createDiscipline({
      userId: user.id,
      name: "Disc1",
      color: "#000",
      weight: 1,
    });
    const { id: topicId } = await storage.createTopic({
      userId: user.id,
      disciplineId: discId,
      name: "Topic1",
      studyDate: "2024-01-01",
      notes: "",
    });

    await storage.addTopicStudyTime(topicId, user.id, 3600); // 1 hour

    const topics = await storage.getTopicsByUser(user.id);
    expect(topics[0].studyTimeSeconds).toBe(3600);

    const stats = await storage.getDashboardStats(user.id);
    expect(stats.disciplineStats[0].studyTimeSeconds).toBe(3600);
  });
});
