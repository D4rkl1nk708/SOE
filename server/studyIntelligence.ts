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

export interface BaseLensSummary {
  configured: boolean;
  disciplines: number;
  topics: number;
  studied: number;
  mastered: number;
  coveragePct: number;
  readiness: number;
}

export interface CalibrationSummary {
  total: number;
  calibrated: number;
  answered: number;
  skipped: number;
  accuracy: number;
  brier: number;
  overconfidence: number;
  underconfidence: number;
}

export interface PlanBlock {
  id: string;
  kind: PlanKind;
  lens?: "base" | "edital" | "revisao";
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
  base: BaseLensSummary;
  calibration: CalibrationSummary;
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

export function computeCalibration(attempts: any[]): CalibrationSummary {
  const answered = attempts.filter((attempt) => attempt?.answered);
  const calibrated = answered.filter(
    (attempt) =>
      attempt.confidence && attempt.confidencePhase === "before_result",
  );
  const weights: Record<string, number> = {
    chute: 0.25,
    acho: 0.6,
    certeza: 0.9,
  };
  let brier = 0;
  let overconfidence = 0;
  let underconfidence = 0;
  for (const attempt of calibrated) {
    const probability = weights[attempt.confidence] ?? 0.5;
    const outcome = attempt.correct ? 1 : 0;
    brier += (probability - outcome) ** 2;
    if (attempt.confidence === "certeza" && !attempt.correct) overconfidence++;
    if (attempt.confidence === "chute" && attempt.correct) underconfidence++;
  }
  return {
    total: attempts.length,
    answered: answered.length,
    skipped: attempts.length - answered.length,
    calibrated: calibrated.length,
    accuracy:
      answered.length > 0
        ? Math.round(
            (answered.filter((attempt) => attempt.correct).length /
              answered.length) *
              100,
          )
        : 0,
    brier:
      calibrated.length > 0
        ? Math.round((brier / calibrated.length) * 1000) / 1000
        : 0,
    overconfidence,
    underconfidence,
  };
}

function computeBaseLens(
  disciplines: Discipline[],
  topics: Topic[],
  mastery: TopicMastery[],
  configuredIds: number[] | undefined,
): BaseLensSummary {
  const configured = Array.isArray(configuredIds) && configuredIds.length > 0;
  const ids = new Set(
    configured ? configuredIds : disciplines.map((discipline) => discipline.id),
  );
  const baseTopics = topics.filter((topic) => ids.has(topic.disciplineId));
  const baseMastery = mastery.filter((item) => ids.has(item.disciplineId));
  const studied = baseTopics.filter(
    (topic) =>
      (topic.performance?.questionsResolved || 0) > 0 ||
      (topic.performance?.correctCount || 0) > 0,
  ).length;
  return {
    configured,
    disciplines: ids.size,
    topics: baseTopics.length,
    studied,
    mastered: baseMastery.filter((item) => item.readiness >= 75).length,
    coveragePct:
      baseTopics.length > 0
        ? Math.round((studied / baseTopics.length) * 100)
        : 0,
    readiness:
      baseMastery.length > 0
        ? Math.round(
            baseMastery.reduce((sum, item) => sum + item.readiness, 0) /
              baseMastery.length,
          )
        : 0,
  };
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
  baseDisciplineIds: Set<number>,
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
      lens: "revisao",
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
      lens: baseDisciplineIds.has(m.disciplineId) ? "base" : "edital",
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
      lens: "edital",
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
      lens: "edital",
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
        lens: baseDisciplineIds.has(m.disciplineId) ? "base" : "edital",
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

export interface FsrsPreviewItem {
  topicId: number;
  topicName: string;
  disciplineName: string;
  readiness: number;
  accuracy: number;
  currentNextReview: string | null;
  suggestedIntervalDays: number;
  suggestedDate: string;
  reason: string;
}

export interface ErrorIntelligence {
  total: number;
  recent30: number;
  byOrigin: Array<{ origin: string; count: number; share: number }>;
  topTopics: Array<{
    topicId: number;
    topicName: string;
    disciplineName: string;
    count: number;
  }>;
  topBancas: Array<{ banca: string; count: number }>;
  overconfidence: number;
}

export async function getErrorIntelligence(
  userId: number,
): Promise<ErrorIntelligence> {
  const [errorsPage, topics, disciplines, settings] = await Promise.all([
    storage.getQuestionErrorsByUser(userId, { limit: 200 }),
    storage.getTopicsByUser(userId),
    storage.getDisciplinesByUser(userId),
    storage.getUserSettings(userId),
  ]);
  const errors = errorsPage.items;
  const cutoff = Date.now() - 30 * DAY_MS;
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const disciplineById = new Map(
    disciplines.map((discipline) => [discipline.id, discipline]),
  );
  const originCounts = new Map<string, number>();
  const topicCounts = new Map<number, number>();
  const bancaCounts = new Map<string, number>();

  for (const error of errors) {
    const origin = error.errorOrigin || "nao_classificado";
    originCounts.set(origin, (originCounts.get(origin) || 0) + 1);
    topicCounts.set(error.topicId, (topicCounts.get(error.topicId) || 0) + 1);
    if (error.banca) {
      bancaCounts.set(error.banca, (bancaCounts.get(error.banca) || 0) + 1);
    }
  }

  const total = errors.length;
  const calibrated = (settings?.questionAttempts || []).filter(
    (attempt) =>
      attempt.answered &&
      attempt.confidence &&
      attempt.confidencePhase === "before_result",
  );
  const overconfidence = calibrated.filter(
    (attempt) => attempt.confidence === "certeza" && !attempt.correct,
  ).length;

  return {
    total,
    recent30: errors.filter((error) => {
      const time = Date.parse(error.createdAt || "");
      return Number.isFinite(time) && time >= cutoff;
    }).length,
    byOrigin: [...originCounts.entries()]
      .map(([origin, count]) => ({
        origin,
        count,
        share: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count),
    topTopics: [...topicCounts.entries()]
      .map(([topicId, count]) => {
        const topic = topicById.get(topicId);
        return {
          topicId,
          topicName: topic?.name || "Tópico removido",
          disciplineName:
            disciplineById.get(topic?.disciplineId ?? -1)?.name || "Disciplina",
          count,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    topBancas: [...bancaCounts.entries()]
      .map(([banca, count]) => ({ banca, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    overconfidence,
  };
}

export interface DataHealth {
  duplicateDisciplines: number;
  duplicateTopics: number;
  orphanTopics: number;
  orphanRevisions: number;
  orphanErrors: number;
  orphanAttempts: number;
  examples: string[];
  healthy: boolean;
}

export async function getDataHealth(userId: number): Promise<DataHealth> {
  const [disciplines, topics, revisions, errorsPage, settings] =
    await Promise.all([
      storage.getDisciplinesByUser(userId),
      storage.getTopicsByUser(userId),
      storage.getRevisionsByUser(userId),
      storage.getQuestionErrorsByUser(userId, { limit: 200 }),
      storage.getUserSettings(userId),
    ]);
  const disciplineIds = new Set(disciplines.map((d) => d.id));
  const topicIds = new Set(topics.map((t) => t.id));
  const discNames = new Map<string, number>();
  const duplicatesDisc: string[] = [];
  for (const discipline of disciplines) {
    const key = normalizeString(discipline.name);
    if (!key) continue;
    if (discNames.has(key)) duplicatesDisc.push(discipline.name);
    else discNames.set(key, discipline.id);
  }
  const topicKeys = new Map<string, number>();
  const duplicateTopics: string[] = [];
  for (const topic of topics) {
    const key = `${topic.disciplineId}::${normalizeString(topic.name)}`;
    if (topicKeys.has(key)) duplicateTopics.push(topic.name);
    else topicKeys.set(key, topic.id);
  }
  const orphanTopics = topics.filter((t) => !disciplineIds.has(t.disciplineId));
  const orphanRevisions = revisions.filter((r) => !topicIds.has(r.topicId));
  const orphanErrors = errorsPage.items.filter(
    (e) => !topicIds.has(e.topicId) || !disciplineIds.has(e.disciplineId),
  );
  const orphanAttempts = (settings?.questionAttempts || []).filter(
    (attempt) => !topicIds.has(attempt.topicId),
  );
  const examples = [
    ...duplicatesDisc
      .slice(0, 2)
      .map((name) => `Disciplina duplicada: ${name}`),
    ...duplicateTopics.slice(0, 2).map((name) => `Tópico duplicado: ${name}`),
    ...orphanTopics.slice(0, 2).map((t) => `Tópico sem disciplina: ${t.name}`),
    ...orphanRevisions.slice(0, 2).map((r) => `Revisão sem tópico: #${r.id}`),
  ];
  const totalProblems =
    duplicatesDisc.length +
    duplicateTopics.length +
    orphanTopics.length +
    orphanRevisions.length +
    orphanErrors.length +
    orphanAttempts.length;
  return {
    duplicateDisciplines: duplicatesDisc.length,
    duplicateTopics: duplicateTopics.length,
    orphanTopics: orphanTopics.length,
    orphanRevisions: orphanRevisions.length,
    orphanErrors: orphanErrors.length,
    orphanAttempts: orphanAttempts.length,
    examples,
    healthy: totalProblems === 0,
  };
}

export interface WeeklyReview {
  from: string;
  to: string;
  answered: number;
  correct: number;
  accuracy: number;
  sessions: number;
  minutes: number;
  revisionsCompleted: number;
  revisionsDueNext7: number;
  touchedTopics: number;
  wins: string[];
  risks: string[];
}

export async function getWeeklyReview(userId: number): Promise<WeeklyReview> {
  const [settings, revisions, topics] = await Promise.all([
    storage.getUserSettings(userId),
    storage.getRevisionsByUser(userId),
    storage.getTopicsByUser(userId),
  ]);
  const now = Date.now();
  const from = now - 7 * DAY_MS;
  const to = now;
  const attempts = (settings?.questionAttempts || []).filter((attempt) => {
    const time = Date.parse(attempt.createdAt || "");
    return Number.isFinite(time) && time >= from && time <= to;
  });
  const answered = attempts.filter((attempt) => attempt.answered);
  const correct = answered.filter((attempt) => attempt.correct).length;
  const sessions = (settings?.studySessionLog || []).filter((session) => {
    const time = Date.parse(session.date || "");
    return Number.isFinite(time) && time >= from;
  });
  const minutes = sessions.reduce(
    (sum, session) => sum + (Number(session.durationMin) || 0),
    0,
  );
  const today = new Date().toISOString().slice(0, 10);
  const next7 = new Date(now + 7 * DAY_MS).toISOString().slice(0, 10);
  const revisionsCompleted = revisions.filter(
    (revision) =>
      revision.completed &&
      revision.completedAt &&
      Date.parse(revision.completedAt) >= from,
  ).length;
  const revisionsDueNext7 = revisions.filter(
    (revision) =>
      !revision.completed &&
      !revision.ignored &&
      revision.scheduledDate >= today &&
      revision.scheduledDate <= next7,
  ).length;
  const touchedTopics = new Set(
    answered.map((attempt) => attempt.topicId).filter(Boolean),
  ).size;
  const accuracy =
    answered.length > 0 ? Math.round((correct / answered.length) * 100) : 0;
  const wins: string[] = [];
  const risks: string[] = [];
  if (answered.length > 0) wins.push(`${answered.length} questões respondidas`);
  if (minutes > 0) wins.push(`${Math.round(minutes / 60)}h de estudo`);
  if (revisionsCompleted > 0)
    wins.push(`${revisionsCompleted} revisões concluídas`);
  if (accuracy >= 70) wins.push(`Acurácia de ${accuracy}%`);
  if (answered.length === 0)
    risks.push("Nenhuma questão registrada nesta semana");
  if (accuracy > 0 && accuracy < 50) risks.push(`Acurácia baixa: ${accuracy}%`);
  if (revisionsDueNext7 > 10)
    risks.push(`${revisionsDueNext7} revisões nos próximos 7 dias`);
  if (minutes < 60) risks.push("Tempo de estudo baixo nesta semana");
  return {
    from: new Date(from).toISOString().slice(0, 10),
    to: new Date(to).toISOString().slice(0, 10),
    answered: answered.length,
    correct,
    accuracy,
    sessions: sessions.length,
    minutes,
    revisionsCompleted,
    revisionsDueNext7,
    touchedTopics,
    wins,
    risks,
  };
}

export async function previewFsrsSchedule(
  userId: number,
  days = 30,
): Promise<{
  scheduler: "classic" | "fsrs";
  applied: boolean;
  generatedAt: string;
  note: string;
  items: FsrsPreviewItem[];
}> {
  const [disciplines, topics, revisions, settings] = await Promise.all([
    storage.getDisciplinesByUser(userId),
    storage.getTopicsByUser(userId),
    storage.getRevisionsByUser(userId),
    storage.getUserSettings(userId),
  ]);
  const mastery = buildMastery(disciplines, topics, revisions);
  const nextByTopic = new Map<number, string>();
  for (const revision of revisions) {
    if (revision.completed || revision.ignored) continue;
    const current = nextByTopic.get(revision.topicId);
    if (!current || revision.scheduledDate < current) {
      nextByTopic.set(revision.topicId, revision.scheduledDate);
    }
  }
  const items = mastery
    .filter((item) => item.resolved > 0)
    .sort((a, b) => a.readiness - b.readiness)
    .slice(0, 12)
    .map((item) => {
      // Heurística de estabilidade: quanto maior a acurácia suavizada e o
      // volume, maior o intervalo; quanto menor a prontidão, mais cedo.
      const stability =
        4 +
        item.smoothedAccuracy * 0.35 * 30 +
        Math.log10(item.resolved + 1) * 10;
      const interval = Math.max(
        3,
        Math.min(days, Math.round(stability * (0.6 + item.retention * 0.6))),
      );
      const date = new Date(Date.now() + interval * DAY_MS)
        .toISOString()
        .slice(0, 10);
      return {
        topicId: item.topicId,
        topicName: item.topicName,
        disciplineName: item.disciplineName,
        readiness: item.readiness,
        accuracy: item.accuracy,
        currentNextReview: nextByTopic.get(item.topicId) || null,
        suggestedIntervalDays: interval,
        suggestedDate: date,
        reason:
          item.readiness < 50
            ? "Prontidão baixa: revisão curta"
            : item.readiness >= 75
              ? "Bom domínio: espaçar mais"
              : "Progresso intermediário",
      };
    });

  return {
    scheduler: settings?.scheduler || "classic",
    applied: false,
    generatedAt: new Date().toISOString(),
    note: "Prévia experimental. O 25/50 continua ativo; nada é gravado no calendário.",
    items,
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
  const baseDisciplineIds = new Set(
    settings?.baseDisciplineIds?.length
      ? settings.baseDisciplineIds
      : disciplines.map((discipline) => discipline.id),
  );
  const base = computeBaseLens(
    disciplines,
    topics,
    mastery,
    settings?.baseDisciplineIds,
  );
  const calibration = computeCalibration(settings?.questionAttempts || []);
  const plan = computePlan(
    coverage,
    mastery,
    revisions,
    dailyMinutes,
    baseDisciplineIds,
  );
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
    base,
    calibration,
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
