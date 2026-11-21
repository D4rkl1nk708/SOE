/**
 * Fixture realista das jornadas do aluno (v6.9.8, item 2.3).
 *
 * Nada de dado pessoal: nomes de disciplina e de assunto são genéricos e toda a
 * base é gerada aqui. O formato imita a base real — 3 disciplinas, 20 tópicos e
 * ~150 revisões por tópico, com a maior parte vencida — porque era exatamente
 * esse volume que fazia o plano repetir o mesmo tópico.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Database, Revision, Topic, User } from "../../shared/types";
import { addLocalDays } from "../../shared/localDay";

export const JOURNEY_OPEN_ID = "aluno-fixture";
export const JOURNEY_USER_ID = 1;

export interface JourneyMeta {
  today: string;
  disciplines: Array<{ id: number; name: string; weight: number }>;
  topics: Array<{ id: number; name: string; disciplineId: number }>;
  /** Tópico dono da revisão mais antiga (o primeiro bloco antes da correção). */
  oldestTopicId: number;
  revisionCount: number;
}

const DISCIPLINES = [
  { name: "Português", color: "#0ea5e9", weight: 3 },
  { name: "Raciocínio Lógico", color: "#8b5cf6", weight: 2 },
  { name: "Direito Constitucional", color: "#f59e0b", weight: 5 },
];

const TOPIC_NAMES = [
  "Concordância verbal e nominal",
  "Crase e regência",
  "Pontuação e coesão",
  "Interpretação de texto",
  "Reescrita de frases",
  "Estruturas lógicas",
  "Probabilidade",
  "Análise combinatória",
  "Sequências e séries",
  "Conjuntos e diagramas",
  "Princípios fundamentais",
  "Direitos e garantias",
  "Organização do Estado",
  "Poder Legislativo",
  "Poder Executivo",
  "Poder Judiciário",
  "Controle de constitucionalidade",
  "Remédios constitucionais",
  "Administração pública",
  "Ordem social",
];

/** 82 vencidas + 40 concluídas no passado + 28 futuras = 150 por tópico. */
const OVERDUE_PER_TOPIC = 82;
const COMPLETED_PER_TOPIC = 40;
const FUTURE_PER_TOPIC = 28;

function isoAtLocalNoon(day: string): string {
  return new Date(`${day}T12:00:00`).toISOString();
}

export function buildJourneyDatabase(today: string): {
  db: Database;
  meta: JourneyMeta;
} {
  const stamp = isoAtLocalNoon(today);
  const user = {
    id: JOURNEY_USER_ID,
    openId: JOURNEY_OPEN_ID,
    name: "Aluno Fixture",
    email: null,
    loginMethod: "local",
    role: "admin",
    settings: {
      theme: "light",
      studyStreak: { current: 0, best: 0, lastStudyDate: null },
      dailyGoalMinutes: 240,
      exams: [],
      editalRows: [],
      editalCycle: [],
      baseDisciplineIds: [],
    },
    createdAt: stamp,
    updatedAt: stamp,
    lastSignedIn: stamp,
  } as unknown as User;

  const disciplines = DISCIPLINES.map((discipline, index) => ({
    id: index + 1,
    userId: JOURNEY_USER_ID,
    name: discipline.name,
    color: discipline.color,
    weight: discipline.weight,
    order: index + 1,
    studyTimeSeconds: 0,
    createdAt: stamp,
    updatedAt: stamp,
  }));

  const topics: Topic[] = TOPIC_NAMES.map((name, index) => ({
    id: index + 1,
    userId: JOURNEY_USER_ID,
    disciplineId: (index % disciplines.length) + 1,
    name,
    order: index + 1,
    studyDate:
      index % 5 === 0 ? addLocalDays(today, -3) : addLocalDays(today, -20),
    notes: null,
    performance: {
      questionsResolved: 30,
      correctCount: 12,
      errorCount: 18,
      accuracy: 40,
    },
    studyTimeSeconds: 0,
    createdAt: stamp,
    updatedAt: stamp,
  }));

  const revisions: Revision[] = [];
  let revisionId = 0;
  const push = (
    topicId: number,
    scheduledDate: string,
    revisionNumber: number,
    completed: boolean,
    completedAt: string | null,
  ) => {
    revisionId += 1;
    revisions.push({
      id: revisionId,
      userId: JOURNEY_USER_ID,
      topicId,
      scheduledDate,
      type: revisionNumber % 7 === 0 ? "test" : "revision",
      revisionNumber,
      completed,
      ignored: false,
      completedAt,
      createdAt: stamp,
      updatedAt: stamp,
    });
  };

  for (const topic of topics) {
    // 82 vencidas em faixas contíguas, como na base real: cada tópico tem o seu
    // próprio bloco de atraso (o tópico 1 é o mais antigo, ~400 dias). Era isso
    // que fazia o plano devolver SEMPRE o mesmo tópico: concluída a mais velha,
    // a segunda mais velha do mesmo tópico ainda vencia as dos outros.
    const bandStart = 400 - (topic.id - 1) * 20;
    for (let index = 0; index < OVERDUE_PER_TOPIC; index += 1) {
      const daysAgo = bandStart - Math.floor(index / 5);
      push(topic.id, addLocalDays(today, -daysAgo), index + 1, false, null);
    }
    // 40 concluídas em meses passados (histórico, nunca "hoje").
    for (let index = 0; index < COMPLETED_PER_TOPIC; index += 1) {
      const day = addLocalDays(today, -(200 + index));
      push(
        topic.id,
        day,
        OVERDUE_PER_TOPIC + index + 1,
        true,
        isoAtLocalNoon(day),
      );
    }
    // 28 futuras: precisam ficar intactas em qualquer conclusão em lote.
    for (let index = 0; index < FUTURE_PER_TOPIC; index += 1) {
      push(
        topic.id,
        addLocalDays(today, index + 1),
        OVERDUE_PER_TOPIC + COMPLETED_PER_TOPIC + index + 1,
        false,
        null,
      );
    }
    // Os dois primeiros tópicos também têm uma revisão para hoje.
    if (topic.id <= 2) {
      push(topic.id, today, 151, false, null);
    }
  }

  const counters = {
    users: 1,
    disciplines: disciplines.length,
    topics: topics.length,
    revisions: revisions.length,
    mockExams: 0,
    notes: 0,
    flashcards: 0,
    questionErrors: 0,
    essays: 0,
    tecSnapshots: 0,
    questionAttempts: 0,
  };

  const db = {
    users: [user],
    disciplines,
    topics,
    revisions,
    mockExams: [],
    notes: [],
    flashcards: [],
    questionErrors: [],
    essays: [],
    tecSnapshots: [],
    cadernosTec: {},
    questionAttempts: [],
    counters,
  } as unknown as Database;

  return {
    db,
    meta: {
      today,
      disciplines: disciplines.map((discipline) => ({
        id: discipline.id,
        name: discipline.name,
        weight: discipline.weight,
      })),
      topics: topics.map((topic) => ({
        id: topic.id,
        name: topic.name,
        disciplineId: topic.disciplineId,
      })),
      oldestTopicId: 1,
      revisionCount: revisions.length,
    },
  };
}

/**
 * Cria um diretório temporário isolado, aponta o storage para ele e grava a
 * fixture. Nunca toca em `data/` do repo nem na base real do aluno.
 */
export async function bootstrapJourney(today: string): Promise<{
  storage: typeof import("../../server/jsonStorage");
  dir: string;
  meta: JourneyMeta;
  cleanup: () => void;
}> {
  const storage = await import("../../server/jsonStorage");
  storage.closeDatabase();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "soe-journey-"));
  storage.setDataDir(dir);
  storage.resetCache();
  const { db, meta } = buildJourneyDatabase(today);
  storage.writeDatabase(db);
  return {
    storage,
    dir,
    meta,
    cleanup: () => {
      storage.closeDatabase();
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* handle ainda aberto no Windows: o SO limpa o temp */
      }
    },
  };
}
