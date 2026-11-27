/** @vitest-environment node */
/**
 * B — Varredura de datas UTC (v6.9.12; ampliada na v6.9.15).
 *
 * A regra ESLint só pega `toISOString().split(...)` encadeado. O caso que
 * causou o bug das 21h em Brasília foi o ISO indo para uma VARIÁVEL e sendo
 * fatiado depois (`const iso = ...; const dia = iso.slice(0, 10)`), que nenhuma
 * regra de sintaxe distingue de `lista.slice(0, 10)`.
 *
 * Enquanto o seletor de tipo não for viável, esta varredura faz o papel: todo
 * `.slice(0, 10)`, `.substring(0, 10)` ou `.split("T")[0]`/`.split("T").shift()`
 * em código de produção precisa de uma decisão explícita na linha (ou na
 * anterior):
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
const MARKER = /sweep-ok\s*:/;

/**
 * Padrões que transformam um carimbo de tempo em dia. Cobre o encadeado,
 * o fatiado numa variável (inclusive em linha seguinte após `=`) e as formas
 * alternativas de "pegar os 10 primeiros caracteres" / "cortar no T".
 */
const UTC_DAY_PATTERNS: RegExp[] = [
  /\.\s*slice\(\s*0\s*,\s*10\s*\)/,
  /\.\s*substring\(\s*0\s*,\s*10\s*\)/,
  /\.\s*split\(\s*["'`]T["'`]\s*\)\s*\[\s*0\s*\]/,
  /\.\s*split\(\s*["'`]T["'`]\s*\)\s*\.\s*shift\s*\(\s*\)/,
];

/** Linha de código de produção que fatia um carimbo de tempo em dia. */
export function isUtcDayLine(line: string): boolean {
  return UTC_DAY_PATTERNS.some((pattern) => pattern.test(line));
}

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

/** Varre um mapa `arquivo -> linhas`; o teste usa com amostras sintéticas. */
export function scanSources(sources: Record<string, string>): {
  hits: Hit[];
  marked: number;
} {
  const hits: Hit[] = [];
  let marked = 0;
  for (const [file, source] of Object.entries(sources)) {
    const lines = source.split("\n");
    lines.forEach((line, index) => {
      if (!isUtcDayLine(line)) return;
      const previous = index > 0 ? lines[index - 1] : "";
      if (MARKER.test(line) || MARKER.test(previous)) {
        marked += 1;
        return;
      }
      hits.push({ file, line: index + 1, text: line.trim() });
    });
  }
  return { hits, marked };
}

function scan(): { hits: Hit[]; marked: number } {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) walk(path.join(ROOT, dir), files);

  const sources: Record<string, string> = {};
  for (const file of files) {
    const relative = path.relative(ROOT, file).split(path.sep).join("/");
    if (relative === "shared/localDay.ts") continue; // fonte da verdade
    sources[relative] = fs.readFileSync(file, "utf8");
  }
  return scanSources(sources);
}

describe("varredura de dia UTC (bloco B)", () => {
  it("a varredura realmente enxerga o padrão (guarda contra regex quebrada)", () => {
    expect(isUtcDayLine("const d = now().slice(0, 10);")).toBe(true);
    expect(isUtcDayLine("const d = now().slice(0,10);")).toBe(true);
    expect(isUtcDayLine('const d = iso.split("T")[0];')).toBe(true);
    expect(isUtcDayLine("const d = iso.split('T')[0];")).toBe(true);
    expect(isUtcDayLine("const d = iso.substring(0, 10);")).toBe(true);
    expect(isUtcDayLine('const d = iso.split("T").shift();')).toBe(true);
    expect(isUtcDayLine("const topo = lista.slice(0, 10);")).toBe(true);
    // Não é dia: nenhum falso negativo por mudar o espaçamento.
    expect(isUtcDayLine('const d = iso . split( "T" ) [ 0 ];')).toBe(true);
  });

  it("pega o padrão em VARIÁVEL, mesmo com o ISO montado em outra linha", () => {
    const { hits } = scanSources({
      "server/hoje-utc.ts": [
        "const iso = new Date().toISOString();",
        "const dia = iso.slice(0, 10);",
        "const outro =",
        "  iso",
        "    .slice(0, 10);",
        'const terceiro = iso.split("T")[0];',
        "const quarto = iso.substring(0, 10);",
        'const quinto = iso.split("T").shift();',
        "const decimo = lista.slice(0, 10);",
      ].join("\n"),
    });
    expect(hits.map((hit) => hit.line)).toEqual([2, 5, 6, 7, 8, 9]);
  });

  it("o marcador na própria linha ou na anterior libera a linha", () => {
    const { hits, marked } = scanSources({
      "server/gravado.ts": [
        "// sweep-ok: lista, não é data.",
        "const top10 = resultados.slice(0, 10);",
        'const dia = String(card.nextReviewDate || "").slice(0, 10); // sweep-ok: data gravada.',
      ].join("\n"),
    });
    expect(hits).toEqual([]);
    expect(marked).toBe(2);
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
