/** @vitest-environment node */
/**
 * B — Varredura de datas UTC que sobraram (v6.9.12).
 *
 * A regra ESLint só pega `toISOString().split(...)` encadeado. Sobraram casos
 * em que o ISO vai para uma variável e é fatiado depois — um deles gravava
 * "tópico estudado hoje" com o dia UTC (bug das 21h em Brasília).
 *
 * Enquanto o seletor `Identifier.slice(0, 10)` não for viável no ESLint (ele
 * marca também `lista.slice(0, 10)`), esta varredura faz o papel: todo
 * `.slice(0, 10)` / `.split("T")[0]` em código de produção precisa de uma
 * decisão explícita na linha (ou na anterior):
 *
 *   - dia do aluno  → usar `localDayISO()` / `localDayFrom()` (some a ocorrência);
 *   - data gravada ou lista → `// sweep-ok: <motivo>`.
 *
 * Sem o marcador o teste falha e lista arquivo:linha.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SCAN_DIRS = ["server", "shared", "client/src", "electron"];
const DATE_SLICE = /\.slice\(\s*0\s*,\s*10\s*\)/;
const T_SPLIT = /\.split\(\s*["'`]T["'`]\s*\)\s*\[\s*0\s*\]/;
const MARKER = /sweep-ok\s*:/;

interface Hit {
  file: string;
  line: number;
  text: string;
}

function walk(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) continue;
    out.push(full);
  }
}

function scan(): { hits: Hit[]; marked: number } {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) walk(path.join(ROOT, dir), files);

  const hits: Hit[] = [];
  let marked = 0;
  for (const file of files) {
    const relative = path.relative(ROOT, file).split(path.sep).join("/");
    if (relative === "shared/localDay.ts") continue; // fonte da verdade
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (!DATE_SLICE.test(line) && !T_SPLIT.test(line)) return;
      const previous = index > 0 ? lines[index - 1] : "";
      if (MARKER.test(line) || MARKER.test(previous)) {
        marked += 1;
        return;
      }
      hits.push({ file: relative, line: index + 1, text: line.trim() });
    });
  }
  return { hits, marked };
}

describe("varredura de dia UTC (bloco B)", () => {
  it("a varredura realmente enxerga o padrão (guarda contra regex quebrada)", () => {
    expect(DATE_SLICE.test("const d = now().slice(0, 10);")).toBe(true);
    expect(DATE_SLICE.test("const d = now().slice(0,10);")).toBe(true);
    expect(T_SPLIT.test('const d = iso.split("T")[0];')).toBe(true);
    expect(T_SPLIT.test("const d = iso.split('T')[0];")).toBe(true);
    expect(DATE_SLICE.test("const topo = lista.slice(0, 10);")).toBe(true);
  });

  it('todo .slice(0, 10)/.split("T")[0] em produção tem decisão explícita', () => {
    const { hits, marked } = scan();
    expect(
      hits,
      `Sem decisão explícita (use localDayISO/localDayFrom ou // sweep-ok: motivo):\n${JSON.stringify(
        hits,
        null,
        2,
      )}`,
    ).toEqual([]);
    // Se a varredura parasse de encontrar os marcadores, o teste acima passaria
    // por acidente.
    expect(marked).toBeGreaterThan(10);
  });
});
