import { describe, test, expect } from "vitest";
import {
  getScheduleParams,
  calculateRevisionDates,
  generateRandomTests,
  buildSchedule,
  formatDateForDb,
} from "../shared/scheduling";

describe("scheduling", () => {
  const baseDate = new Date("2024-01-01T12:00:00Z");

  test("getScheduleParams returns defaults when no settings provided", () => {
    const params = getScheduleParams(null);
    expect(params.testIntervalDays).toBe(3);
    expect(params.revisionIntervalDays).toBe(25);
    expect(params.revisionSecondPhaseDays).toBe(50);
    expect(params.revisionsEnabled).toBe(true);
  });

  test("getScheduleParams overrides defaults", () => {
    const params = getScheduleParams({
      testIntervalDays: 5,
      revisionIntervalDays: 10,
      revisionSecondPhaseDays: 20,
    });
    expect(params.testIntervalDays).toBe(5);
    expect(params.revisionIntervalDays).toBe(10);
    expect(params.revisionSecondPhaseDays).toBe(20);
    expect(params.revisionsEnabled).toBe(true);
  });

  test("getScheduleParams disables revisions if revisionIntervalDays is 0", () => {
    const params = getScheduleParams({ revisionIntervalDays: 0 });
    expect(params.revisionsEnabled).toBe(false);
  });

  test("calculateRevisionDates returns empty array if disabled", () => {
    const params = getScheduleParams({ revisionIntervalDays: 0 });
    const dates = calculateRevisionDates(baseDate, params);
    expect(dates).toHaveLength(0);
  });

  test("calculateRevisionDates returns 15 revision dates", () => {
    const params = getScheduleParams(null);
    const dates = calculateRevisionDates(baseDate, params);
    expect(dates).toHaveLength(15);
    expect(dates[0].type).toBe("revision");
    expect(dates[0].revisionNumber).toBe(1);
    // 25 days after 2024-01-01 is 2024-01-26
    expect(dates[0].date.getTime()).toBe(
      baseDate.getTime() + 25 * 24 * 60 * 60 * 1000,
    );
  });

  test("generateRandomTests generates tests between revisions", () => {
    const params = getScheduleParams(null);
    const revisions = calculateRevisionDates(baseDate, params);
    const tests = generateRandomTests(
      baseDate,
      revisions,
      params.testIntervalDays,
    );
    expect(tests.length).toBeGreaterThan(0);
    expect(tests[0].type).toBe("test");
    expect(tests[0].revisionNumber).toBe(1);
    expect(tests[0].date.getTime()).toBeGreaterThan(baseDate.getTime());
  });

  test("buildSchedule returns sorted combined schedule", () => {
    const params = getScheduleParams(null);
    const schedule = buildSchedule(baseDate, params);
    expect(schedule.length).toBeGreaterThan(15); // 15 revisions + tests
    // Verify sorted by date
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].date.getTime()).toBeGreaterThanOrEqual(
        schedule[i - 1].date.getTime(),
      );
    }
  });

  test("formatDateForDb formats date correctly", () => {
    const date = new Date("2024-01-01T15:30:00Z");
    expect(formatDateForDb(date)).toBe("2024-01-01");
  });
});
