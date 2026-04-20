import { describe, expect, it } from "vitest";
import {
  calculateRevisionDates,
  generateRandomTests,
  buildSchedule,
  getScheduleParams,
  formatDateForDb,
} from "../shared/scheduling";

const DEFAULT_PARAMS = getScheduleParams(null);

describe("Revision Scheduling - 25/50 Days Method", () => {
  it("creates 5 revisions at 25-day intervals for the first phase", () => {
    const studyDate = new Date("2024-01-01");
    const revisions = calculateRevisionDates(studyDate, DEFAULT_PARAMS);
    const first5 = revisions.slice(0, 5);
    expect(first5.length).toBe(5);
    expect(first5[0].date.toISOString().split("T")[0]).toBe("2024-01-26");
    expect(first5[1].date.toISOString().split("T")[0]).toBe("2024-02-20");
    expect(first5[2].date.toISOString().split("T")[0]).toBe("2024-03-16");
    expect(first5[3].date.toISOString().split("T")[0]).toBe("2024-04-10");
    expect(first5[4].date.toISOString().split("T")[0]).toBe("2024-05-05");
  });

  it("creates revisions at 50-day intervals after the first 5", () => {
    const studyDate = new Date("2024-01-01");
    const revisions = calculateRevisionDates(studyDate, DEFAULT_PARAMS);
    const after5 = revisions.slice(5);
    expect(after5.length).toBe(10);
    for (let i = 1; i < after5.length; i++) {
      const daysDiff = Math.round(
        (after5[i].date.getTime() - after5[i - 1].date.getTime()) / (24 * 60 * 60 * 1000)
      );
      expect(daysDiff).toBe(50);
    }
  });

  it("assigns correct revision numbers and type", () => {
    const revisions = calculateRevisionDates(new Date("2024-01-01"), DEFAULT_PARAMS);
    revisions.forEach((rev, index) => {
      expect(rev.revisionNumber).toBe(index + 1);
      expect(rev.type).toBe("revision");
    });
  });

  it("creates 15 total revisions", () => {
    const revisions = calculateRevisionDates(new Date("2024-01-01"), DEFAULT_PARAMS);
    expect(revisions.length).toBe(15);
  });

  it("returns empty array when revisionsEnabled is false", () => {
    const params = getScheduleParams({ revisionIntervalDays: 0 });
    expect(calculateRevisionDates(new Date("2024-01-01"), params)).toHaveLength(0);
  });
});

describe("Random Tests Generation", () => {
  it("generates tests of type 'test'", () => {
    const studyDate = new Date("2024-01-01");
    const revisions = calculateRevisionDates(studyDate, DEFAULT_PARAMS);
    const tests = generateRandomTests(studyDate, revisions, DEFAULT_PARAMS.testIntervalDays);
    expect(tests.length).toBeGreaterThan(0);
    tests.forEach((t) => expect(t.type).toBe("test"));
  });

  it("does not generate tests on revision days", () => {
    const studyDate = new Date("2024-01-01");
    const revisions = calculateRevisionDates(studyDate, DEFAULT_PARAMS);
    const tests = generateRandomTests(studyDate, revisions, DEFAULT_PARAMS.testIntervalDays);
    const revisionDates = new Set(revisions.map((r) => formatDateForDb(r.date)));
    tests.forEach((t) => expect(revisionDates.has(formatDateForDb(t.date))).toBe(false));
  });
});

describe("buildSchedule", () => {
  it("produces sorted activities with both revisions and tests", () => {
    const activities = buildSchedule(new Date("2024-01-01"), DEFAULT_PARAMS);
    expect(activities.filter((a) => a.type === "revision").length).toBe(15);
    expect(activities.filter((a) => a.type === "test").length).toBeGreaterThan(0);
    for (let i = 1; i < activities.length; i++) {
      expect(activities[i].date.getTime()).toBeGreaterThanOrEqual(activities[i - 1].date.getTime());
    }
  });

  it("respects custom params", () => {
    const params = getScheduleParams({ revisionIntervalDays: 14, revisionSecondPhaseDays: 30 });
    const revisions = calculateRevisionDates(new Date("2024-01-01"), params);
    expect(revisions[0].date.toISOString().split("T")[0]).toBe("2024-01-15");
    const gap = Math.round(
      (revisions[6].date.getTime() - revisions[5].date.getTime()) / 86400000
    );
    expect(gap).toBe(30);
  });
});

describe("getScheduleParams", () => {
  it("uses defaults when settings are null", () => {
    const p = getScheduleParams(null);
    expect(p.testIntervalDays).toBe(3);
    expect(p.revisionIntervalDays).toBe(25);
    expect(p.revisionSecondPhaseDays).toBe(50);
    expect(p.revisionsEnabled).toBe(true);
  });

  it("disables revisions when revisionIntervalDays is 0", () => {
    expect(getScheduleParams({ revisionIntervalDays: 0 }).revisionsEnabled).toBe(false);
  });
});

describe("formatDateForDb", () => {
  it("formats date as YYYY-MM-DD", () => {
    expect(formatDateForDb(new Date("2024-03-15T12:00:00Z"))).toBe("2024-03-15");
  });
});
