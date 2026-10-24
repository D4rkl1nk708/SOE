/**
 * Motor de cobertura do edital, domínio por tópico e plano adaptativo.
 *
 * Não altera dados: apenas lê o banco e calcula prioridades. A ideia é
 * responder "o que estudar agora para passar?" com base em:
 *  - aderência ao edital (peso/incidência e cobertura);
 *  - desempenho real (acurácia suavizada + volume);
 *  - retenção (recência do estudo/revisão);
 *  - pendências de revisão.
 */
import type {
  Discipline,
  Revision,
  Topic,
  UserSettings,
} from "../shared/types";
import { normalizeString, isFuzzyMatch } from "../shared/utils";
import * as storage from "./jsonStorage";

const DAY_MS = 86_400_000;
const PRIOR_WEIGHT = 20;
const PRIOR_ACCURACY = 0.55;
const MIN_SAMPLE = 10;

type MasteryStatus = "novo" | "fragil" | "em_evolucao" | "forte" | "dominado";
type CoverageStatus =
  | "mapear"
  | "pendente"
  | "estudado"
  | "revisar"
  | "dominado";
type EditalRow = NonNullable<UserSettings["editalRows"]>[number];
export type PlanKind =
  | "revisao"
  | "questoes"
  | "estudo"
  | "mapear"
  | "revisao_rapida";

export interface TopicMastery {
  topicId: number;
  topicName: string;
  disciplineId: number;
  disciplineName: string;
  color: string;
  resolved: number;
  correct: number;
  errors: number;
  accuracy: number;
  smoothedAccuracy: number;
  confidence: number;
  retention: number;
  revisionCompletion: number;
  recallAvg: number | null;
  mastery: number;
  readiness: number;
  status: MasteryStatus;
  lastStudyAt: string | null;
  daysSinceStudy: number;
  topicsEditalWeight: number;
}

export interface EditalCoverageRow {
  id: string;
  discipline: string;
  topic: string;
  disciplineId: number | null;
  topicId: number | null;
  weight: number;
  status: CoverageStatus;
  studied: boolean;
  mastered: boolean;
  readiness: number;
  mastery: number | null;
  questionCount?: number;
  notes?: string;
}

export interface DisciplineCoverage {
  name: string;
  color: string;
  disciplineId: number | null;
  rows: number;
  mapped: number;
  studied: number;
  mastered: number;
  weight: number;
  coverage: number;
  weightedCoverage: number;
  avgReadiness: number;
  priority: number;
}

export interface PlanBlock {
  id: string;
  kind: PlanKind;
  title: string;
  subtitle: string;
  reason: string;
  minutes: number;
  topicId: number | null;
  topicName: string;
  disciplineId: number | null;
  disciplineName: string;
  color: string;
  score: number;
  route: string;
}

export interface StudyOverview {
  generatedAt: string;
  coverage: {
    totalRows: number;
    mappedRows: number;
    studiedRows: number;
    masteredRows: number;
    coveragePct: number;
    weightedCoveragePct: number;
    readiness: number;
    weakTopics: number;
    strongTopics: number;
    disciplines: DisciplineCoverage[];
    priorities: EditalCoverageRow[];
    unmapped: EditalCoverageRow[];
  };
  plan: {
    date: string;
    dailyMinutes: number;
    plannedMinutes: number;
    overdueRevisions: number;
    blocks: PlanBlock[];
  };
  mastery: {
    topics: number;
    avgReadiness: number;
    distribution: Record<MasteryStatus, number>;
    topWeak: TopicMastery[];
  };
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number): number {
  return Math.round(value);
}

function daysSince(date: string | null | undefined): number {
  if (!date) return 999;
  const time = Date.parse(date);
  if (!Number.isFinite(time)) return 999;
  return Math.max(0, Math.floor((Date.now() - time) / DAY_MS));
}

function latestDate(values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestTime = -1;
  for (const value of values) {
    if (!value) continue;
    const time = Date.parse(value);
    if (Number.isFinite(time) && time > bestTime) {
      bestTime = time;
      best = value;
    }
  }
  return best;
}

function editalWeight(row: EditalRow): number {
  const incidencia = asNumber(row.incidencia);
  if (incidencia > 0)
    return clamp(incidencia > 1 ? incidencia / 100 : incidencia, 0.05, 1);
  const quantidade = asNumber(row.quantidade);
  if (quantidade > 0) return clamp(quantidade / 200, 0.05, 1);
  return 1;
}

function findDiscipline(
  disciplines: Discipline[],
  name: string,
): Discipline | null {
  const normalized = normalizeString(name);
  if (!normalized) return null;
  const exact = disciplines.find((d) => normalizeString(d.name) === normalized);
  if (exact) return exact;
  const contains = disciplines.find((d) => {
    const candidate = normalizeString(d.name);
    return (
      candidate.length >= 5 &&
      (candidate.includes(normalized) || normalized.includes(candidate))
    );
  });
  if (contains) return contains;
  return disciplines.find((d) => isFuzzyMatch(d.name, name)) || null;
}

function findTopic(
  topics: Topic[],
  disciplineId: number,
  name: string,
): Topic | null {
  const normalized = normalizeString(name);
  if (!normalized) return null;
  const candidates = topics.filter((t) => t.disciplineId === disciplineId);
  const exact = candidates.find((t) => normalizeString(t.name) === normalized);
  if (exact) return exact;
  return (
    candidates.find((t) => {
      const candidate = normalizeString(t.name);
      return (
        candidate.length >= 6 &&
        (candidate.includes(normalized) || normalized.includes(candidate))
      );
    }) || null
  );
}

function buildMastery(
  disciplines: Discipline[],
  topics: Topic[],
  revisions: Revision[],
): TopicMastery[] {
  const disciplineById = new Map(disciplines.map((d) => [d.id, d]));
  const revisionsByTopic = new Map<number, Revision[]>();
  for (const revision of revisions) {
    const list = revisionsByTopic.get(revision.topicId);
    if (list) list.push(revision);
    else revisionsByTopic.set(revision.topicId, [revision]);
  }

  return topics.map((topic) => {
    const discipline = disciplineById.get(topic.disciplineId);
    const topicRevisions = revisionsByTopic.get(topic.id) || [];
    const completed = topicRevisions.filter((r) => r.completed);
    const recallValues = completed
      .map((r) => r.recallRating)
      .filter((r): r is 1 | 2 | 3 | 4 | 5 => typeof r === "number");
    const recallAvg =
      recallValues.length > 0
        ? recallValues.reduce((sum, value) => sum + value, 0) /
          recallValues.length /
          5
        : null;

    const resolved = Math.max(
      asNumber(topic.performance?.questionsResolved),
      asNumber(topic.performance?.correctCount) +
        asNumber(topic.performance?.errorCount),
    );
    const correct = Math.min(
      resolved,
      asNumber(topic.performance?.correctCount),
    );
    const errors = Math.max(0, resolved - correct);
    const accuracy = resolved > 0 ? correct / resolved : 0;

    // Acurácia suavizada (Bayes) evita 1/1 = 100%.
    const smoothed =
      (correct + PRIOR_ACCURACY * PRIOR_WEIGHT) / (resolved + PRIOR_WEIGHT);
    const confidence = resolved / (resolved + PRIOR_WEIGHT);
    const lastStudyAt = latestDate([
      topic.performance?.lastImportedAt,
      topic.updatedAt,
      topic.createdAt,
      ...completed.map((r) => r.completedAt),
    ]);
    const days = daysSince(lastStudyAt);
    const retention = 0.6 + 0.4 * Math.exp(-days / 30);
    const revisionCompletion =
      topicRevisions.length > 0 ? completed.length / topicRevisions.length : 0;

    let mastery =
      smoothed *
      100 *
      (0.8 + 0.2 * confidence) *
      (0.85 + 0.15 * retention) *
      (topicRevisions.length > 0 ? 0.9 + 0.1 * revisionCompletion : 1) *
      (recallAvg !== null ? 0.9 + 0.1 * recallAvg : 1);
    mastery = clamp(mastery);
    const readiness = clamp(smoothed * 100 * retention);

    const status: MasteryStatus =
      resolved < 5
        ? "novo"
        : readiness >= 80
          ? "dominado"
          : readiness >= 65
            ? "forte"
            : readiness >= 45
              ? "em_evolucao"
              : "fragil";

    return {
      topicId: topic.id,
      topicName: topic.name,
      disciplineId: topic.disciplineId,
      disciplineName: discipline?.name || "Disciplina",
      color: discipline?.color || "var(--primary)",
      resolved,
      correct,
      errors,
      accuracy: round(accuracy * 100),
      smoothedAccuracy: round(smoothed * 100),
      confidence: Math.round(confidence * 100) / 100,
      retention: Math.round(retention * 100) / 100,
      revisionCompletion: Math.round(revisionCompletion * 100) / 100,
      recallAvg: recallAvg === null ? null : Math.round(recallAvg * 100) / 100,
      mastery: round(mastery),
      readiness: round(readiness),
      status,
      lastStudyAt,
      daysSinceStudy: days,
      topicsEditalWeight: 1,
    };
  });
}

function computeCoverage(
  disciplines: Discipline[],
  topics: Topic[],
  settings: UserSettings | undefined,
  mastery: TopicMastery[],
): StudyOverview["coverage"] {
  const rows = (settings?.editalRows || []).filter(
    (row) => !row.isHeader && row.topic?.trim(),
  );
  const masteryByTopic = new Map(mastery.map((m) => [m.topicId, m]));
  const coverageRows: EditalCoverageRow[] = rows.map((row, index) => {
    const discipline = findDiscipline(disciplines, row.discipline);
    const topic = discipline
      ? findTopic(topics, discipline.id, row.topic)
      : null;
    const topicMastery = topic ? masteryByTopic.get(topic.id) : null;
    const weight = editalWeight(row);
    const studied =
      Boolean(row.completed) ||
      Boolean(topic && (topic.performance?.questionsResolved || 0) > 0) ||
      Boolean(topic && topicMastery && topicMastery.resolved > 0);
    const mastered = Boolean(topicMastery && topicMastery.mastery >= 75);
    const status: CoverageStatus =
      !discipline || !topic
        ? "mapear"
        : row.revisar
          ? "revisar"
          : mastered
            ? "dominado"
            : studied
              ? "estudado"
              : "pendente";
    return {
      id: row.id || `row-${index}`,
      discipline: row.discipline,
      topic: row.topic,
      disciplineId: discipline?.id ?? null,
      topicId: topic?.id ?? null,
      weight,
      status,
      studied,
      mastered,
      readiness:
        topicMastery?.readiness ?? (row.acerto ? round(row.acerto * 100) : 0),
      mastery: topicMastery?.mastery ?? null,
      questionCount: row.quantidade,
      notes: row.notes,
    };
  });

  const totalRows = coverageRows.length;
  const mappedRows = coverageRows.filter((r) => r.status !== "mapear");
  const studiedRows = coverageRows.filter((r) => r.studied);
  const masteredRows = coverageRows.filter((r) => r.mastered);
  const weightSum = coverageRows.reduce((sum, r) => sum + r.weight, 0);
  const coveredWeight = studiedRows.reduce((sum, r) => sum + r.weight, 0);
  const weightedCoveragePct =
    weightSum > 0 ? round((coveredWeight / weightSum) * 100) : 0;
  const coveragePct =
    totalRows > 0 ? round((studiedRows.length / totalRows) * 100) : 0;

  const byDiscipline = new Map<string, DisciplineCoverage>();
  const coveredWeightByDiscipline = new Map<string, number>();
  for (const row of coverageRows) {
    const key = row.discipline || "Sem disciplina";
    const entry = byDiscipline.get(key) || {
      name: key,
      color: "#64748b",
      disciplineId: row.disciplineId,
      rows: 0,
      mapped: 0,
      studied: 0,
      mastered: 0,
      weight: 0,
      coverage: 0,
      weightedCoverage: 0,
      avgReadiness: 0,
      priority: 0,
    };
    entry.rows++;
    entry.weight += row.weight;
    if (row.status !== "mapear") entry.mapped++;
    if (row.studied) {
      entry.studied++;
      coveredWeightByDiscipline.set(
        key,
        (coveredWeightByDiscipline.get(key) || 0) + row.weight,
      );
    }
    if (row.mastered) entry.mastered++;
    if (row.readiness > 0) entry.avgReadiness += row.readiness;
    byDiscipline.set(key, entry);
  }

  const disciplineCoverage = [...byDiscipline.values()]
    .map((entry) => {
      const discipline = entry.disciplineId
        ? disciplines.find((d) => d.id === entry.disciplineId)
        : findDiscipline(disciplines, entry.name);
      const readiness =
        entry.mapped > 0 ? round(entry.avgReadiness / entry.mapped) : 0;
      return {
        ...entry,
        color: discipline?.color || entry.color,
        coverage:
          entry.rows > 0 ? round((entry.studied / entry.rows) * 100) : 0,
        weightedCoverage:
          entry.weight > 0
            ? round(
                ((coveredWeightByDiscipline.get(entry.name) || 0) /
                  entry.weight) *
                  100,
              )
            : 0,
        avgReadiness: readiness,
        priority: round((100 - readiness) * entry.weight),
      };
    })
    .sort((a, b) => b.priority - a.priority);

  const mappedMastery = coverageRows
    .filter((r) => r.mastery !== null)
    .map((r) => r.mastery as number);
  const readiness =
    mappedMastery.length > 0
      ? round(
          mappedMastery.reduce((sum, value) => sum + value, 0) /
            mappedMastery.length,
        )
      : mastery.length > 0
        ? round(mastery.reduce((sum, m) => sum + m.mastery, 0) / mastery.length)
        : 0;

  const priorities = [...coverageRows]
    .filter((r) => !r.mastered)
    .sort(
      (a, b) => b.weight * (100 - b.readiness) - a.weight * (100 - a.readiness),
    )
    .slice(0, 24);

  const unmapped = coverageRows
    .filter((r) => r.status === "mapear")
    .slice(0, 16);

  return {
    totalRows,
    mappedRows: mappedRows.length,
    studiedRows: studiedRows.length,
    masteredRows: masteredRows.length,
    coveragePct,
    weightedCoveragePct,
    readiness,
    weakTopics: mastery.filter((m) => m.readiness < 50).length,
    strongTopics: mastery.filter((m) => m.readiness >= 75).length,
    disciplines: disciplineCoverage,
    priorities,
    unmapped,
  };
}

function computePlan(
  coverage: StudyOverview["coverage"],
  mastery: TopicMastery[],
  revisions: Revision[],
  dailyMinutes: number,
): StudyOverview["plan"] {
  const today = new Date().toISOString().slice(0, 10);
  const dueRevisions = revisions.filter(
    (r) => !r.completed && !r.ignored && r.scheduledDate <= today,
  );
  const overdueByTopic = new Map<number, Revision>();
  for (const revision of dueRevisions) {
    const existing = overdueByTopic.get(revision.topicId);
    if (!existing || revision.scheduledDate < existing.scheduledDate) {
      overdueByTopic.set(revision.topicId, revision);
    }
  }
  const masteryByTopic = new Map(mastery.map((m) => [m.topicId, m]));
  const coverageByTopic = new Map(
    coverage.priorities
      .filter((row) => row.topicId !== null)
      .map((row) => [row.topicId as number, row]),
  );

  const blocks: PlanBlock[] = [];
  const usedTopics = new Set<number>();

  for (const [topicId, revision] of overdueByTopic) {
    const m = masteryByTopic.get(topicId);
    const overdueDays = Math.max(0, daysSince(revision.scheduledDate));
    blocks.push({
      id: `rev-${revision.id}`,
      kind: "revisao",
      title: m?.topicName || "Revisão pendente",
      subtitle: m?.disciplineName || "Revisão",
      reason:
        overdueDays > 0
          ? `Revisão vencida há ${overdueDays} dia(s)`
          : "Revisão programada para hoje",
      minutes: 15,
      topicId,
      topicName: m?.topicName || "Revisão",
      disciplineId: m?.disciplineId ?? null,
      disciplineName: m?.disciplineName || "Revisão",
      color: m?.color || "var(--primary)",
      score: 1000 + overdueDays,
      route: "/revisions",
    });
    usedTopics.add(topicId);
  }

  const weakTopics = [...mastery]
    .filter((m) => m.resolved > 0 && !usedTopics.has(m.topicId))
    .sort((a, b) => {
      const weightA = coverageByTopic.get(a.topicId)?.weight ?? 1;
      const weightB = coverageByTopic.get(b.topicId)?.weight ?? 1;
      const scoreA = (100 - a.readiness) * (0.5 + weightA);
      const scoreB = (100 - b.readiness) * (0.5 + weightB);
      return scoreB - scoreA;
    });

  for (const m of weakTopics) {
    if (m.readiness >= 70 && m.daysSinceStudy < 14) continue;
    const coverageRow = coverageByTopic.get(m.topicId);
    const isQuestionDrill = m.resolved >= 20 && m.accuracy < 60;
    blocks.push({
      id: `weak-${m.topicId}`,
      kind: isQuestionDrill ? "questoes" : "estudo",
      title: m.topicName,
      subtitle: m.disciplineName,
      reason: isQuestionDrill
        ? `Acurácia de ${m.accuracy}% em ${m.resolved} questões`
        : `Prontidão de ${m.readiness}% e ${m.daysSinceStudy}d sem revisar`,
      minutes: isQuestionDrill ? 25 : 30,
      topicId: m.topicId,
      topicName: m.topicName,
      disciplineId: m.disciplineId,
      disciplineName: m.disciplineName,
      color: m.color,
      score: (100 - m.readiness) * (0.5 + (coverageRow?.weight ?? 1)),
      route: "/question-session",
    });
    usedTopics.add(m.topicId);
  }

  for (const row of coverage.priorities) {
    if (blocks.length >= 12) break;
    if (!row.topicId || usedTopics.has(row.topicId)) continue;
    const m = masteryByTopic.get(row.topicId);
    blocks.push({
      id: `gap-${row.id}`,
      kind: "estudo",
      title: row.topic,
      subtitle: row.discipline,
      reason: `Lacuna do edital (peso ${Math.round(row.weight * 100)}%)`,
      minutes: 30,
      topicId: row.topicId,
      topicName: row.topic,
      disciplineId: row.disciplineId,
      disciplineName: row.discipline,
      color: m?.color || "var(--primary)",
      score: row.weight * (100 - row.readiness),
      route: "/question-session",
    });
    usedTopics.add(row.topicId);
  }

  for (const row of coverage.unmapped.slice(0, 3)) {
    blocks.push({
      id: `map-${row.id}`,
      kind: "mapear",
      title: row.topic,
      subtitle: row.discipline,
      reason: "Tópico do edital sem correspondência no sistema",
      minutes: 10,
      topicId: null,
      topicName: row.topic,
      disciplineId: null,
      disciplineName: row.discipline,
      color: "#64748b",
      score: 5,
      route: "/edital",
    });
  }

  for (const m of mastery) {
    if (
      m.readiness >= 75 &&
      m.daysSinceStudy >= 14 &&
      !usedTopics.has(m.topicId)
    ) {
      blocks.push({
        id: `maint-${m.topicId}`,
        kind: "revisao_rapida",
        title: m.topicName,
        subtitle: m.disciplineName,
        reason: `Forte, mas ${m.daysSinceStudy}d sem contato`,
        minutes: 10,
        topicId: m.topicId,
        topicName: m.topicName,
        disciplineId: m.disciplineId,
        disciplineName: m.disciplineName,
        color: m.color,
        score: 10,
        route: "/question-session",
      });
      usedTopics.add(m.topicId);
    }
  }

  blocks.sort((a, b) => b.score - a.score);

  // Intercala disciplinas para não começar com 4 blocos da mesma matéria.
  const ordered: PlanBlock[] = [];
  const remaining = [...blocks];
  while (remaining.length > 0 && ordered.length < 14) {
    const lastTwoSame =
      ordered.length >= 2 &&
      ordered[ordered.length - 1].disciplineId ===
        ordered[ordered.length - 2].disciplineId;
    const index = lastTwoSame
      ? remaining.findIndex(
          (block) =>
            block.disciplineId !== ordered[ordered.length - 1].disciplineId,
        )
      : 0;
    const [next] = remaining.splice(index >= 0 ? index : 0, 1);
    if (next) ordered.push(next);
  }

  let remainingMinutes = dailyMinutes;
  const selected: PlanBlock[] = [];
  for (const block of ordered) {
    if (block.minutes > remainingMinutes) continue;
    selected.push(block);
    remainingMinutes -= block.minutes;
    if (remainingMinutes <= 5) break;
  }

  return {
    date: today,
    dailyMinutes,
    plannedMinutes: selected.reduce((sum, block) => sum + block.minutes, 0),
    overdueRevisions: dueRevisions.length,
    blocks: selected,
  };
}

export async function getStudyOverview(
  userId: number,
  requestedMinutes?: number,
): Promise<StudyOverview> {
  const [disciplines, topics, revisions, settings] = await Promise.all([
    storage.getDisciplinesByUser(userId),
    storage.getTopicsByUser(userId),
    storage.getRevisionsByUser(userId),
    storage.getUserSettings(userId),
  ]);

  const dailyMinutes = Math.min(
    720,
    Math.max(
      30,
      Math.round(requestedMinutes || settings?.dailyGoalMinutes || 240),
    ),
  );
  const mastery = buildMastery(disciplines, topics, revisions);
  const coverage = computeCoverage(disciplines, topics, settings, mastery);
  const plan = computePlan(coverage, mastery, revisions, dailyMinutes);
  const distribution: Record<MasteryStatus, number> = {
    novo: 0,
    fragil: 0,
    em_evolucao: 0,
    forte: 0,
    dominado: 0,
  };
  for (const item of mastery) distribution[item.status]++;

  return {
    generatedAt: new Date().toISOString(),
    coverage,
    plan,
    mastery: {
      topics: mastery.length,
      avgReadiness:
        mastery.length > 0
          ? round(
              mastery.reduce((sum, item) => sum + item.readiness, 0) /
                mastery.length,
            )
          : 0,
      distribution,
      topWeak: [...mastery]
        .filter((item) => item.resolved > 0)
        .sort((a, b) => a.readiness - b.readiness)
        .slice(0, 10),
    },
  };
}

export { MIN_SAMPLE };
