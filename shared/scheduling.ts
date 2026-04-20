/**
 * Lógica de agendamento de revisões e testes.
 * Baseado no método do Dr. José Mário Chaves (25/50 dias + testes aleatórios).
 *
 * Este módulo é compartilhado entre server (routers.ts) e client (localDb.ts)
 * para eliminar duplicação de código.
 */

export interface ScheduleParams {
  testIntervalDays: number;
  revisionIntervalDays: number;
  revisionSecondPhaseDays: number;
  revisionsEnabled: boolean;
}

export interface ScheduledActivity {
  date: Date;
  revisionNumber: number;
  type: "revision" | "test";
}

const DEFAULT_PARAMS: ScheduleParams = {
  testIntervalDays: 3,
  revisionIntervalDays: 25,
  revisionSecondPhaseDays: 50,
  revisionsEnabled: true,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

export function getScheduleParams(
  settings?: {
    testIntervalDays?: number;
    revisionIntervalDays?: number;
    revisionSecondPhaseDays?: number;
  } | null
): ScheduleParams {
  const revisionIntervalDays = settings?.revisionIntervalDays ?? DEFAULT_PARAMS.revisionIntervalDays;
  return {
    testIntervalDays: settings?.testIntervalDays ?? DEFAULT_PARAMS.testIntervalDays,
    revisionIntervalDays,
    revisionSecondPhaseDays: settings?.revisionSecondPhaseDays ?? DEFAULT_PARAMS.revisionSecondPhaseDays,
    revisionsEnabled: revisionIntervalDays > 0,
  };
}

export function calculateRevisionDates(
  studyDate: Date,
  params: ScheduleParams
): ScheduledActivity[] {
  if (!params.revisionsEnabled) return [];

  const revisions: ScheduledActivity[] = [];
  let currentDate = new Date(studyDate);

  // Fase 1: 5 revisões com intervalo de phase1 dias
  for (let i = 1; i <= 5; i++) {
    currentDate = addDays(currentDate, params.revisionIntervalDays);
    revisions.push({ date: new Date(currentDate), revisionNumber: i, type: "revision" });
  }

  // Fase 2: 10 revisões com intervalo de phase2 dias
  for (let i = 6; i <= 15; i++) {
    currentDate = addDays(currentDate, params.revisionSecondPhaseDays);
    revisions.push({ date: new Date(currentDate), revisionNumber: i, type: "revision" });
  }

  return revisions;
}

export function generateRandomTests(
  studyDate: Date,
  revisions: Pick<ScheduledActivity, "date" | "revisionNumber">[],
  testIntervalDays: number
): ScheduledActivity[] {
  const tests: ScheduledActivity[] = [];
  let previousDate = new Date(studyDate);
  let testNumber = 1;

  for (const revision of revisions) {
    let currentTestDate = addDays(previousDate, testIntervalDays);

    // Gera testes enquanto couber antes da próxima revisão (com margem de 2 dias)
    while (currentTestDate.getTime() < revision.date.getTime() - 2 * MS_PER_DAY) {
      tests.push({ date: new Date(currentTestDate), revisionNumber: testNumber++, type: "test" });
      const daysToNext = testIntervalDays + Math.floor(Math.random() * Math.max(1, testIntervalDays));
      currentTestDate = addDays(currentTestDate, daysToNext);
    }

    previousDate = revision.date;
  }

  return tests;
}

/**
 * Gera todas as atividades (revisões + testes) para um tópico estudado em `studyDate`,
 * já ordenadas por data crescente.
 */
export function buildSchedule(studyDate: Date, params: ScheduleParams): ScheduledActivity[] {
  const revisions = calculateRevisionDates(studyDate, params);
  const tests = generateRandomTests(studyDate, revisions, params.testIntervalDays);
  return [...revisions, ...tests].sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Formata uma Date como string YYYY-MM-DD para armazenamento */
export function formatDateForDb(date: Date): string {
  return date.toISOString().split("T")[0];
}
