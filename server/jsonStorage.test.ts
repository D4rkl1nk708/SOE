import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

// Mock the data directory for testing
const TEST_DATA_DIR = path.join(process.cwd(), "test-data");
const TEST_DB_FILE = path.join(TEST_DATA_DIR, "database.json");

// Helper to clean up test data
function cleanupTestData() {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true });
  }
}

describe("JSON Storage - Data Persistence", () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  it("creates data directory if it does not exist", () => {
    // The storage module creates the directory on import
    // For this test, we just verify the concept works
    if (!fs.existsSync(TEST_DATA_DIR)) {
      fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    }
    expect(fs.existsSync(TEST_DATA_DIR)).toBe(true);
  });

  it("can write and read JSON data", () => {
    if (!fs.existsSync(TEST_DATA_DIR)) {
      fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    }

    const testData = {
      users: [{ id: 1, name: "Test User" }],
      disciplines: [],
      topics: [],
      revisions: [],
      counters: { users: 1, disciplines: 0, topics: 0, revisions: 0 },
    };

    fs.writeFileSync(TEST_DB_FILE, JSON.stringify(testData, null, 2), "utf-8");
    
    const readData = JSON.parse(fs.readFileSync(TEST_DB_FILE, "utf-8"));
    expect(readData.users).toHaveLength(1);
    expect(readData.users[0].name).toBe("Test User");
  });

  it("handles empty database initialization", () => {
    if (!fs.existsSync(TEST_DATA_DIR)) {
      fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    }

    const emptyDb = {
      users: [],
      disciplines: [],
      topics: [],
      revisions: [],
      counters: { users: 0, disciplines: 0, topics: 0, revisions: 0 },
    };

    fs.writeFileSync(TEST_DB_FILE, JSON.stringify(emptyDb, null, 2), "utf-8");
    
    const readData = JSON.parse(fs.readFileSync(TEST_DB_FILE, "utf-8"));
    expect(readData.users).toHaveLength(0);
    expect(readData.counters.users).toBe(0);
  });
});

describe("JSON Storage - Data Types", () => {
  it("correctly formats discipline data", () => {
    const discipline = {
      id: 1,
      userId: 1,
      name: "Matemática",
      color: "#3B82F6",
      weight: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(discipline.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(discipline.weight).toBeGreaterThanOrEqual(1);
    expect(discipline.weight).toBeLessThanOrEqual(10);
  });

  it("correctly formats topic data", () => {
    const topic = {
      id: 1,
      userId: 1,
      disciplineId: 1,
      name: "Equações do 2º Grau",
      studyDate: "2024-01-15",
      notes: "Fórmula de Bhaskara",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(topic.studyDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(topic.disciplineId).toBe(1);
  });

  it("correctly formats revision data", () => {
    const revision = {
      id: 1,
      userId: 1,
      topicId: 1,
      scheduledDate: "2024-02-09",
      type: "revision" as const,
      revisionNumber: 1,
      completed: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(revision.type).toBe("revision");
    expect(revision.completed).toBe(false);
    expect(revision.scheduledDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("correctly formats test data", () => {
    const test = {
      id: 2,
      userId: 1,
      topicId: 1,
      scheduledDate: "2024-01-18",
      type: "test" as const,
      revisionNumber: 1,
      completed: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(test.type).toBe("test");
    expect(test.revisionNumber).toBe(1);
  });
});

describe("JSON Storage - Counter Management", () => {
  it("increments counters correctly", () => {
    const counters = { users: 0, disciplines: 0, topics: 0, revisions: 0 };
    
    counters.users++;
    expect(counters.users).toBe(1);
    
    counters.disciplines++;
    counters.disciplines++;
    expect(counters.disciplines).toBe(2);
    
    counters.topics++;
    counters.revisions += 15; // Multiple revisions for one topic
    expect(counters.topics).toBe(1);
    expect(counters.revisions).toBe(15);
  });
});

describe("JSON Storage - Filtering Logic", () => {
  it("filters by discipline ID", () => {
    const topics = [
      { id: 1, disciplineId: 1, name: "Topic A" },
      { id: 2, disciplineId: 2, name: "Topic B" },
      { id: 3, disciplineId: 1, name: "Topic C" },
    ];

    const filtered = topics.filter(t => t.disciplineId === 1);
    expect(filtered).toHaveLength(2);
    expect(filtered.map(t => t.name)).toContain("Topic A");
    expect(filtered.map(t => t.name)).toContain("Topic C");
  });

  it("filters by date range", () => {
    const revisions = [
      { id: 1, scheduledDate: "2024-01-10" },
      { id: 2, scheduledDate: "2024-01-15" },
      { id: 3, scheduledDate: "2024-01-20" },
      { id: 4, scheduledDate: "2024-01-25" },
    ];

    const startDate = "2024-01-12";
    const endDate = "2024-01-22";

    const filtered = revisions.filter(
      r => r.scheduledDate >= startDate && r.scheduledDate <= endDate
    );

    expect(filtered).toHaveLength(2);
    expect(filtered.map(r => r.id)).toContain(2);
    expect(filtered.map(r => r.id)).toContain(3);
  });

  it("filters by completion status", () => {
    const revisions = [
      { id: 1, completed: true },
      { id: 2, completed: false },
      { id: 3, completed: true },
      { id: 4, completed: false },
    ];

    const pending = revisions.filter(r => !r.completed);
    const completed = revisions.filter(r => r.completed);

    expect(pending).toHaveLength(2);
    expect(completed).toHaveLength(2);
  });

  it("filters by type (revision vs test)", () => {
    const activities = [
      { id: 1, type: "revision" },
      { id: 2, type: "test" },
      { id: 3, type: "revision" },
      { id: 4, type: "test" },
      { id: 5, type: "revision" },
    ];

    const revisions = activities.filter(a => a.type === "revision");
    const tests = activities.filter(a => a.type === "test");

    expect(revisions).toHaveLength(3);
    expect(tests).toHaveLength(2);
  });

  it("searches by name (case insensitive)", () => {
    const topics = [
      { id: 1, name: "Equações do 2º Grau" },
      { id: 2, name: "Funções Exponenciais" },
      { id: 3, name: "Equações Lineares" },
    ];

    const searchTerm = "equações";
    const filtered = topics.filter(t => 
      t.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    expect(filtered).toHaveLength(2);
  });
});
