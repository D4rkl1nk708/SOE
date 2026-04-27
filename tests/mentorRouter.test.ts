/** @vitest-environment node */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mentorRouter, extractJSON } from "../server/mentorRouter";
import * as storage from "../server/jsonStorage";
import * as ai from "../server/aiProviders";

vi.mock("../server/jsonStorage");
vi.mock("../server/aiProviders");

describe("mentorRouter and extractJSON", () => {
  describe("extractJSON", () => {
    it("should handle valid JSON", () => {
      expect(extractJSON('{"a":1}')).toEqual({ a: 1 });
    });

    it("should handle JSON in markdown blocks", () => {
      expect(extractJSON('Here is the data: ```json\n{"a":1}\n```')).toEqual({
        a: 1,
      });
    });
  });

  describe("mentorRouter procedures", () => {
    const ctx = { user: { id: 1 } };

    beforeEach(() => {
      vi.resetAllMocks();
      vi.mocked(storage.getDisciplinesByUser).mockResolvedValue([
        {
          id: 10,
          name: "Math",
          color: "#000",
          weight: 1,
          studyTimeSeconds: 0,
          createdAt: "",
          updatedAt: "",
        },
      ]);
      vi.mocked(storage.getTopicsByUser).mockResolvedValue([
        {
          id: 1,
          name: "Algebra",
          userId: 1,
          disciplineId: 10,
          performance: { correctCount: 5, questionsResolved: 10 },
          studyDate: "2024-01-01",
          createdAt: "",
          updatedAt: "",
        } as any,
      ]);
      vi.mocked(storage.getRevisionsByUser).mockResolvedValue([
        {
          id: 1,
          topicId: 1,
          userId: 1,
          completed: true,
          recallRating: 4,
          completedAt: "2024-01-01",
        } as any,
      ]);
      vi.mocked(storage.getQuestionErrorsByUser).mockResolvedValue({
        items: [
          {
            id: 1,
            topicId: 1,
            disciplineId: 10,
            statement: "Error Q",
            errorOrigin: "theory",
          } as any,
        ],
        total: 1,
        hasMore: false,
        nextOffset: 1,
      });
      vi.mocked(storage.getDisciplineRebalanceReport).mockResolvedValue([
        { disciplineId: 10, accuracy: 50, questionsResolved: 10 } as any,
      ]);
      vi.mocked(storage.getForgettingVelocityByDiscipline).mockResolvedValue([
        { disciplineId: 10, volatility: "medium" } as any,
      ]);
      vi.mocked(storage.getTecSnapshots).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          importedAt: "2024-01-01",
          totalQuestions: 100,
          overallAccuracy: 70,
          topics: [],
        },
      ]);
      vi.mocked(storage.getWeakTopicsFromSnapshot).mockResolvedValue([
        {
          topicName: "Algebra",
          disciplineName: "Math",
          accuracy: 45,
          questionsResolved: 10,
          errorCount: 5,
        },
      ]);
      vi.mocked(storage.getTecRegressions).mockResolvedValue([
        {
          topicName: "Geo",
          disciplineName: "Math",
          previousAccuracy: 80,
          currentAccuracy: 70,
          delta: -10,
          currentErrors: 2,
        },
      ]);
      vi.mocked(storage.getMentorObservations).mockResolvedValue([
        "Student forgets formulas",
      ]);
      vi.mocked(storage.getDashboardStats).mockResolvedValue({
        disciplineStats: [
          {
            name: "Math",
            performance: {
              accuracy: 50,
              questionsResolved: 10,
              correctCount: 5,
            },
          },
        ],
      } as any);
      vi.mocked(storage.getUserSettings).mockResolvedValue({
        aiProvider: "openai",
        apiKey: "key",
      } as any);
      vi.mocked(ai.callAiProvider).mockResolvedValue(
        '{"briefing": "Focus", "dossier": [], "report": "Report content", "insight": "Insight", "recommendedTopicId": 1, "diagnosis": "Theory issue"}',
      );
    });

    it("getWeakProfile returns calculated scores", async () => {
      const caller = mentorRouter.createCaller(ctx as any);
      const profile = await caller.getWeakProfile();
      expect(profile.weakTopics[0].topicName).toBe("Algebra");
      expect(profile.weakTopics[0].vulnerabilityScore).toBeGreaterThan(0);
    });

    it("getPlateauedTopics identifies stuck topics", async () => {
      const caller = mentorRouter.createCaller(ctx as any);
      const plateaued = await caller.getPlateauedTopics();
      // Algebra has 45% accuracy and 1 revision (wait, I mocked 1 revision, plateau needs 3 or 20 questions)
      // Algebra has 10 questions resolved. Let's adjust mock to trigger plateau.
      vi.mocked(storage.getTopicsByUser).mockResolvedValue([
        {
          id: 1,
          name: "Algebra",
          userId: 1,
          disciplineId: 10,
          performance: { correctCount: 5, questionsResolved: 30 },
          studyDate: "2024-01-01",
          createdAt: "",
          updatedAt: "",
        } as any,
      ]);

      const res = await caller.getPlateauedTopics();
      expect(res.length).toBeGreaterThan(0);
      expect(res[0].topicName).toBe("Algebra");
    });

    it("generateBreakthroughDossier calls AI", async () => {
      vi.mocked(ai.callAiProvider).mockResolvedValue(
        '{"dossier": [{"type": "analogy", "title": "T", "content": "C"}]}',
      );
      const caller = mentorRouter.createCaller(ctx as any);
      const dossier = await caller.generateBreakthroughDossier({
        topicName: "Algebra",
        disciplineName: "Math",
        apiKey: "key",
      });
      expect(dossier[0].type).toBe("analogy");
    });

    it("getStatsInsight returns AI insight", async () => {
      vi.mocked(ai.callAiProvider).mockResolvedValue("Study more Math!");
      const caller = mentorRouter.createCaller(ctx as any);
      const res = await caller.getStatsInsight({ apiKey: "key" });
      expect(res.insight).toBe("Study more Math!");
    });

    it("getDailyBriefing aggregates all data", async () => {
      vi.mocked(ai.callAiProvider).mockResolvedValue("Your daily plan...");
      const caller = mentorRouter.createCaller(ctx as any);
      const res = await caller.getDailyBriefing({ apiKey: "key" });
      expect(res.briefing).toBe("Your daily plan...");
      expect(res.hasTecData).toBe(true);
    });

    it("generateDeepAnalysis returns markdown report", async () => {
      vi.mocked(ai.callAiProvider).mockResolvedValue("# Deep Analysis Report");
      const caller = mentorRouter.createCaller(ctx as any);
      const res = await caller.generateDeepAnalysis({ apiKey: "key" });
      expect(res.report).toContain("# Deep Analysis");
    });

    it("generateAdaptiveQuestion uses bank if available", async () => {
      vi.mocked(storage.getQuestionErrorsByUser).mockResolvedValue({
        items: [
          {
            id: 1,
            statement: "Q1",
            alternatives: [],
            correctAnswer: "A",
            banca: "B",
          } as any,
        ],
        total: 1,
        hasMore: false,
        nextOffset: 1,
      });
      const caller = mentorRouter.createCaller(ctx as any);
      const res = await caller.generateAdaptiveQuestion({
        disciplineId: 10,
        apiKey: "key",
      });
      expect(res.source).toBe("bank");
    });

    it("generateAdaptiveQuestion uses AI if bank empty", async () => {
      vi.mocked(storage.getQuestionErrorsByUser).mockResolvedValue({
        items: [],
        total: 0,
        hasMore: false,
        nextOffset: 0,
      });
      vi.mocked(ai.callAiProvider).mockResolvedValue(
        '{"statement": "AI Question", "alternatives": [], "correctAnswer": "B"}',
      );
      const caller = mentorRouter.createCaller(ctx as any);
      const res = await caller.generateAdaptiveQuestion({
        disciplineId: 10,
        apiKey: "key",
      });
      expect(res.source).toBe("ai");
      expect(res.statement).toBe("AI Question");
    });

    it("generateMaliciousMock calls AI", async () => {
      vi.mocked(ai.callAiProvider).mockResolvedValue(
        '{"mockTitle": "Evil", "questions": []}',
      );
      const caller = mentorRouter.createCaller(ctx as any);
      const res = await caller.generateMaliciousMock({
        conceptA: "A",
        conceptB: "B",
        explanation: "Conf",
        apiKey: "key",
      });
      expect(res.mockTitle).toBe("Evil");
    });

    it("diagnoseError analyzes specific error", async () => {
      vi.mocked(ai.callAiProvider).mockResolvedValue(
        '{"diagnosis": "Theory issue", "recommendation": "Read more"}',
      );
      const caller = mentorRouter.createCaller(ctx as any);
      const res = await caller.diagnoseError({
        statement: "What is 1+1?",
        alternatives: [
          { letter: "A", text: "2" },
          { letter: "B", text: "3" },
        ],
        userAnswer: "B",
        correctAnswer: "A",
        disciplineName: "Math",
        topicName: "Arithmetic",
        apiKey: "key",
      });
      expect(res.diagnosis).toBe("Theory issue");
    });

    it("chat handles conversational AI", async () => {
      vi.mocked(ai.callAiProvider).mockResolvedValue("Hello student");
      // Ensure all storage mocks return arrays to avoid .slice() on undefined
      vi.mocked(storage.getNotesByUser).mockResolvedValue([]);
      vi.mocked(storage.getFlashcardsByUser).mockResolvedValue([]);
      vi.mocked(storage.getEssaysByUser).mockResolvedValue([]);

      const caller = mentorRouter.createCaller(ctx as any);
      const res = await caller.chat({
        message: "Hi",
        history: [{ role: "user", content: "Hi" }],
        apiKey: "key",
      });
      expect(res.reply).toBe("Hello student");
    });

    it("executes action router", async () => {
      const caller = mentorRouter.createCaller(ctx as any);
      const res = await caller.executeAction({
        type: "create_flashcard",
        payload: { front: "Q", back: "A", disciplineId: 10 },
      });
      expect(res.success).toBe(true);
    });
  });
});
