/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  __resetJobsForTests,
  beginModelCall,
  startGenerationJob,
  viewJob,
} from "../server/learningJobs";

describe("progresso estimado de geração", () => {
  it("avança sozinho depois do envio e mostra o tempo honesto", async () => {
    __resetJobsForTests();
    const job = startGenerationJob(1, "lesson", () => new Promise(() => {}));
    beginModelCall(job);
    expect(job.percent).toBe(18);

    await new Promise((resolve) => setTimeout(resolve, 1300));
    const after = viewJob(job);
    expect(after.percent).toBeGreaterThan(18);
    expect(after.message).toMatch(/estimativa — gerando \(\d+s\)/);
    __resetJobsForTests();
  });
});
