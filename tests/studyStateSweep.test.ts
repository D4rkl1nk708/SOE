/** @vitest-environment node */
/**
 * Item 2.1 (v6.9.8) — a varredura que impede o bug de voltar.
 *
 * Toda mutation que muda revisão, tentativa ou sessão precisa invalidar o
 * conjunto COMPLETO de caches via `invalidateStudyState`. Antes, cinco de seis
 * telas deixavam `study.overview` (o plano) desatualizado e o aluno via o mesmo
 * tópico como "próximo no plano" depois de concluir.
 *
 * Este teste lê os `.tsx`/`.ts` do cliente e falha se alguém voltar a montar a
 * lista de invalidação à mão.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const CLIENT_DIR = path.join(process.cwd(), "client", "src");
const MUTATION =
  /trpc\.([A-Za-z0-9_.]+)\.(markCompleted|recordAttempt|recordSession|completeTopicBacklog)\s*\.useMutation\s*\(/g;

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

/** Texto entre parênteses a partir da posição do "(" (balanceado). */
function balancedCall(source: string, openIndex: number): string {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, index + 1);
    }
  }
  return source.slice(openIndex);
}

describe("invalidação de cache — varredura dos fluxos de estudo", () => {
  const files = listFiles(CLIENT_DIR);

  it("toda mutation de revisão/tentativa/sessão passa por invalidateStudyState", () => {
    const offenders: string[] = [];
    const covered: string[] = [];

    for (const file of files) {
      const source = fs.readFileSync(file, "utf-8");
      const importsHelper = source.includes("lib/studyState");
      MUTATION.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = MUTATION.exec(source)) !== null) {
        const [, procedure, method] = match;
        const openIndex = match.index + match[0].length - 1;
        const args = balancedCall(source, openIndex);
        const label = `${path.relative(process.cwd(), file)} → ${procedure}.${method}`;
        if (!importsHelper || !args.includes("invalidateStudyState")) {
          offenders.push(label);
          continue;
        }
        covered.push(label);
      }
    }

    if (offenders.length > 0) {
      console.error(
        "Sem invalidateStudyState:\n" +
          offenders.map((item) => ` - ${item}`).join("\n"),
      );
    }
    const coveredList = covered.map((item) => item).join(" / ");
    console.log("Varredura: " + covered.length + " mutations — " + coveredList);
    expect(offenders).toEqual([]);
    // As seis telas + o contexto de simulado (que também responde questão).
    expect(covered.length).toBeGreaterThanOrEqual(7);
    for (const screen of [
      "Revisions.tsx",
      "QuestionSession.tsx",
      "GuidedSession.tsx",
      "History.tsx",
      "Calendar.tsx",
      "TecSessionLivePanel.tsx",
    ]) {
      expect(
        covered.some((item) => item.includes(screen)),
        `${screen} não passa por invalidateStudyState`,
      ).toBe(true);
    }
  });

  it("o helper cobre exatamente o conjunto completo de caches", () => {
    const source = fs.readFileSync(
      path.join(CLIENT_DIR, "lib", "studyState.ts"),
      "utf-8",
    );
    for (const query of [
      "study.overview",
      "dashboard.getStats",
      "revision.list",
      "calendar.getActivities",
      "calendar.getData",
      "history.get",
      "tec.liveActivity",
    ]) {
      expect(source, `helper sem ${query}`).toContain(
        `utils.${query}.invalidate()`,
      );
    }
  });
});
