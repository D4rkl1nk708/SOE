import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

/**
 * Garante que o bloco SOE_TEC_CORE embutido nos 4 scripts injetados é
 * exatamente o bundle de shared/tecCaptureCore.ts.
 *
 * Se este teste falhar, rode: node scripts/sync-tec-core.mjs
 */

const BLOCK_START =
  "// >>> SOE_TEC_CORE (gerado de shared/tecCaptureCore.ts — não editar à mão)";
const BLOCK_END = "// <<< SOE_TEC_CORE";

const TARGETS = [
  "electron/tec-content.js",
  "electron/tec-preload.cjs",
  "android/app/src/main/assets/tec-content.js",
  "chrome-extension/src/content.js",
];

function extractBlock(source: string): string {
  const start = source.indexOf(BLOCK_START);
  const end = source.indexOf(BLOCK_END);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("marcadores // >>> SOE_TEC_CORE ausentes");
  }
  if (source.indexOf(BLOCK_START, start + 1) >= 0) {
    throw new Error("marcador de início duplicado");
  }
  return source.slice(start + BLOCK_START.length, end).trim();
}

async function canonicalBlock(): Promise<string> {
  const result = await build({
    absWorkingDir: process.cwd(),
    entryPoints: ["shared/tecCaptureCore.ts"],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "SOE_TEC_CORE",
    platform: "browser",
    target: "es2018",
    legalComments: "none",
    logLevel: "silent",
  });
  return (result.outputFiles?.[0]?.text ?? "").trim();
}

describe("sincronia do núcleo de captura do TEC", () => {
  it("os 4 arquivos embutem o bloco canônico byte a byte", async () => {
    const canonical = await canonicalBlock();
    expect(canonical).toContain("installTecCapture");

    for (const target of TARGETS) {
      const source = fs.readFileSync(
        path.resolve(process.cwd(), target),
        "utf8",
      );
      const block = extractBlock(source);
      expect(
        block,
        `bloco divergente em ${target} (rode node scripts/sync-tec-core.mjs)`,
      ).toBe(canonical);
      expect(source).toContain("SOE_TEC_CORE.installTecCapture(");
      expect(source.match(/\/\/ >>> SOE_TEC_CORE/g)).toHaveLength(1);
      expect(source.match(/\/\/ <<< SOE_TEC_CORE/g)).toHaveLength(1);
    }
  });
});
