#!/usr/bin/env node
/**
 * Gera o bloco canônico SOE_TEC_CORE a partir de shared/tecCaptureCore.ts
 * (esbuild, IIFE, globalName SOE_TEC_CORE) e injeta nos 4 scripts injetados.
 *
 * Uso: node scripts/sync-tec-core.mjs
 *
 * Os arquivos alvo devem conter os marcadores exatos:
 *   // >>> SOE_TEC_CORE (gerado de shared/tecCaptureCore.ts — não editar à mão)
 *   // <<< SOE_TEC_CORE
 * Tudo entre eles é substituído. O teste tests/tecCoreSync.test.ts compara o
 * bloco embutido com este bundle e falha se alguém editar à mão.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

export const BLOCK_START =
  "// >>> SOE_TEC_CORE (gerado de shared/tecCaptureCore.ts — não editar à mão)";
export const BLOCK_END = "// <<< SOE_TEC_CORE";

export const TARGETS = [
  "electron/tec-content.js",
  "electron/tec-preload.cjs",
  "android/app/src/main/assets/tec-content.js",
  "chrome-extension/src/content.js",
];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function buildCoreBlock() {
  const result = buildSync({
    absWorkingDir: ROOT,
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
  const output = result.outputFiles?.[0]?.text;
  if (!output) throw new Error("esbuild não produziu o bundle do núcleo");
  return output.trim();
}

export function injectBlock(source, block, file = "<inline>") {
  const start = source.indexOf(BLOCK_START);
  const end = source.indexOf(BLOCK_END);
  if (start < 0 || end < 0 || end < start) {
    throw new Error(
      `marcadores // >>> SOE_TEC_CORE ausentes em ${file}. ` +
        "Insira os dois marcadores antes de rodar o sync.",
    );
  }
  return (
    source.slice(0, start + BLOCK_START.length) +
    "\n" +
    block +
    "\n" +
    BLOCK_END +
    source.slice(end + BLOCK_END.length)
  );
}

function main() {
  const block = buildCoreBlock();
  for (const target of TARGETS) {
    const fullPath = path.join(ROOT, target);
    const source = fs.readFileSync(fullPath, "utf8");
    const next = injectBlock(source, block, target);
    fs.writeFileSync(fullPath, next);
    const lines = block.split("\n").length;
    console.log(`[sync-tec-core] ${target}: bloco de ${lines} linhas injetado`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
