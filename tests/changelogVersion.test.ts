import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { CHANGELOG_DATA } from "../client/src/constants/changelog";

describe("changelog acompanha a versão", () => {
  it("a entrada mais recente é a versão do package.json", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
    expect(CHANGELOG_DATA[0].version).toBe(pkg.version);
  });

  it("a entrada mais recente tem conteúdo", () => {
    const latest = CHANGELOG_DATA[0];
    expect(latest.title.length).toBeGreaterThan(10);
    expect(latest.categories.flatMap((c) => c.items).length).toBeGreaterThan(0);
  });
});
