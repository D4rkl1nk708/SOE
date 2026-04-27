/** @vitest-environment node */
import { describe, expect, it } from "vitest";

// Tour steps from GuidedTour.tsx
const GLOBAL_TOUR_STEPS = [
  { target: "#tour-dashboard-header", url: "/" },
  { target: "#tour-accuracy-card", url: "/" },
  { target: "#tour-plateau-radar", url: "/" },
  { target: "#tour-confusion-matrix", url: "/" },
  { target: "#tour-notes-sidebar", url: "/notes" },
  { target: "#tour-notes-ai", url: "/notes" },
  { target: "h1", url: "/mentor" },
  { target: "h1", url: "/statistics" },
  { target: "#tour-trigger", url: "/" },
];

describe("GuidedTour Configuration", () => {
  it("should have valid steps with targets and urls", () => {
    for (const step of GLOBAL_TOUR_STEPS) {
      expect(step.target).toBeDefined();
      expect(step.url).toBeDefined();
      expect(step.url.startsWith("/")).toBe(true);
    }
  });

  it("should follow a logical sequence of URLs", () => {
    // The tour should group page-specific steps together to minimize navigation
    const urls = GLOBAL_TOUR_STEPS.map((s) => s.url);
    let transitions = 0;
    for (let i = 1; i < urls.length; i++) {
      if (urls[i] !== urls[i - 1]) transitions++;
    }
    // We expect some transitions but not one for every step
    expect(transitions).toBeLessThan(GLOBAL_TOUR_STEPS.length / 2 + 2);
  });
});
