import type { UserSettings } from "../shared/types";
import {
  MAX_LESSONS,
  MAX_TOPIC_LESSON_VERSIONS,
  deleteLessonFrom,
  lessonsForTopic,
  upsertLesson,
  type SavedLesson,
} from "../shared/topicLessons";
import { getUserSettings, updateUserSettings } from "./jsonStorage";

/**
 * Analogias e micro-mundos criados pelo aluno.
 *
 * Ambos vivem dentro de `user.settings` (arrays simples), sem tabela nova e
 * sem chamada de IA: aqui só se guarda o que o aluno escolheu/confirmou.
 * As listas crescem sempre pelo fim (mais antigo → mais recente); o cap corta
 * a cabeça, então o que fica é sempre o mais recente.
 */

/** Máximo de analogias guardadas por usuário. */
export const MAX_ANALOGIES = 200;
/** Máximo de micro-mundos guardados por usuário (um por tópico). */
export const MAX_MICROWORLDS = 50;

export type SavedAnalogy = {
  id: string;
  topicId?: number;
  topicName: string;
  /** A analogia em si (a ponte entre o conhecido e o conceito novo). */
  analogy: string;
  /** Cada elemento do mapeamento: "conceito novo = elemento familiar". */
  mapping: string[];
  /** Onde a analogia quebra / deixa de valer. */
  breaks: string;
  /** Para que tipo de questão/momento ela serve melhor. */
  bestFor: string;
  /** O porquê que o aluno escreveu, com as próprias palavras. */
  whyItWorks?: string;
  chosenAt: string;
};

export type SavedMicroWorld = {
  id: string;
  topicId?: number;
  topicName: string;
  title: string;
  /** HTML autocontido do micro-mundo (renderizado em sandbox). */
  html: string;
  controls: string[];
  challenges: string[];
  limits: string[];
  createdAt: string;
};

export type { SavedLesson } from "../shared/topicLessons";

/** Chaves de `UserSettings` usadas por este módulo (fora do tipo, ver casts). */
type LearningKey = "topicAnalogies" | "microWorlds" | "topicLessons";

function normalizeTopicName(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Acrescenta `item` ao fim da lista e mantém no máximo `cap` itens — os mais
 * recentes (fim) ficam, os mais antigos (começo) caem. Não muta `list`.
 */
export function appendCapped<T>(list: T[], item: T, cap: number): T[] {
  const limit = Number.isFinite(cap) ? Math.max(0, Math.floor(cap)) : 0;
  const source = Array.isArray(list) ? list : [];
  if (limit === 0) return [];
  const next = [...source, item];
  return next.length > limit ? next.slice(-limit) : next;
}

/**
 * Filtra por tópico (trim + case-insensitive) e devolve do mais recente para o
 * mais antigo. Sem `topicName` (ou vazio) devolve a lista inteira, invertida.
 * Nunca muta o array recebido.
 */
export function filterByTopic<T extends { topicName: string }>(
  list: T[],
  topicName?: string,
): T[] {
  return pickByTopic(list, topicName).reverse();
}

/** Mesma seleção de `filterByTopic`, mas mantendo a ordem de inserção. */
function pickByTopic<T extends { topicName: string }>(
  list: T[],
  topicName?: string,
): T[] {
  const source = Array.isArray(list) ? list : [];
  const target = normalizeTopicName(topicName);
  if (!target) return source.slice();
  return source.filter(
    (item) => normalizeTopicName(item?.topicName) === target,
  );
}

/**
 * Ordena do mais recente para o mais antigo pela data informada. Datas iguais
 * (mesmo milissegundo) mantêm o item inserido por último na frente.
 */
function sortNewestFirst<T>(list: T[], stamp: (item: T) => string): T[] {
  return list
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const left = stamp(a.item) || "";
      const right = stamp(b.item) || "";
      if (left !== right) return right.localeCompare(left);
      return b.index - a.index;
    })
    .map((entry) => entry.item);
}

function readList<T>(
  settings: UserSettings | undefined,
  key: LearningKey,
): T[] {
  const bag = settings as unknown as Record<string, unknown> | undefined;
  const raw = bag?.[key];
  return Array.isArray(raw) ? (raw as T[]) : [];
}

async function requireSettings(userId: number): Promise<UserSettings> {
  const settings = await getUserSettings(userId);
  if (!settings) throw new Error("Usuário não encontrado.");
  return settings;
}

async function persist(
  userId: number,
  key: LearningKey,
  list: unknown[],
): Promise<void> {
  await updateUserSettings(userId, {
    [key]: list,
  } as unknown as Partial<UserSettings>);
}

/** Salva (ou atualiza, quando `id` já existe) uma analogia escolhida. */
export async function saveAnalogy(
  userId: number,
  entry: Omit<SavedAnalogy, "id" | "chosenAt"> & {
    id?: string;
    chosenAt?: string;
  },
): Promise<SavedAnalogy> {
  const settings = await requireSettings(userId);
  const current = readList<SavedAnalogy>(settings, "topicAnalogies");
  const existingIndex = entry.id
    ? current.findIndex((item) => item.id === entry.id)
    : -1;
  const previous = existingIndex >= 0 ? current[existingIndex] : undefined;

  const record: SavedAnalogy = {
    ...entry,
    id: entry.id || previous?.id || makeId("ana"),
    chosenAt: entry.chosenAt || previous?.chosenAt || new Date().toISOString(),
  };

  const merged =
    existingIndex >= 0
      ? current.map((item, index) => (index === existingIndex ? record : item))
      : appendCapped(current, record, MAX_ANALOGIES);
  const capped =
    merged.length > MAX_ANALOGIES ? merged.slice(-MAX_ANALOGIES) : merged;

  await persist(userId, "topicAnalogies", capped);
  return record;
}

/** Analogias do usuário, da mais recente para a mais antiga. */
export async function listAnalogies(
  userId: number,
  topicName?: string,
): Promise<SavedAnalogy[]> {
  const settings = await getUserSettings(userId);
  const filtered = pickByTopic(
    readList<SavedAnalogy>(settings, "topicAnalogies"),
    topicName,
  );
  return sortNewestFirst(filtered, (item) => item.chosenAt);
}

/**
 * Salva o micro-mundo de um tópico. Só existe um por tópico: o anterior do
 * mesmo `topicName` é substituído. Cap de 50, os mais recentes ficam.
 */
export async function saveMicroWorld(
  userId: number,
  entry: Omit<SavedMicroWorld, "id" | "createdAt">,
): Promise<SavedMicroWorld> {
  const settings = await requireSettings(userId);
  const current = readList<SavedMicroWorld>(settings, "microWorlds");
  const record: SavedMicroWorld = {
    ...entry,
    id: makeId("mw"),
    createdAt: new Date().toISOString(),
  };
  const topicKey = normalizeTopicName(record.topicName);
  const withoutPrevious = current.filter(
    (item) => normalizeTopicName(item?.topicName) !== topicKey,
  );

  await persist(
    userId,
    "microWorlds",
    appendCapped(withoutPrevious, record, MAX_MICROWORLDS),
  );
  return record;
}

/** Micro-mundos do usuário, do mais recente para o mais antigo. */
export async function listMicroWorlds(
  userId: number,
  topicName?: string,
): Promise<SavedMicroWorld[]> {
  const settings = await getUserSettings(userId);
  const filtered = pickByTopic(
    readList<SavedMicroWorld>(settings, "microWorlds"),
    topicName,
  );
  return sortNewestFirst(filtered, (item) => item.createdAt);
}

/**
 * Aula interativa: uma por tópico na frente, até 5 versões guardadas.
 * O `id` é sempre novo (cada geração é uma versão); a ordem de leitura vem de
 * `createdAt`. A poda por tópico vive em `shared/topicLessons.ts` para o app
 * offline aplicar exatamente a mesma regra.
 */
export async function saveLesson(
  userId: number,
  entry: Omit<SavedLesson, "id" | "createdAt">,
): Promise<SavedLesson> {
  const settings = await requireSettings(userId);
  const current = readList<SavedLesson>(settings, "topicLessons");
  const record: SavedLesson = {
    ...entry,
    topicName: entry.topicName.trim(),
    id: makeId("aula"),
    createdAt: new Date().toISOString(),
  };
  await persist(
    userId,
    "topicLessons",
    upsertLesson(current, record, {
      perTopic: MAX_TOPIC_LESSON_VERSIONS,
      total: MAX_LESSONS,
    }),
  );
  return record;
}

/** Aulas do usuário (da mais recente para a mais antiga), filtradas por tópico. */
export async function listLessons(
  userId: number,
  topicName?: string,
): Promise<SavedLesson[]> {
  const settings = await getUserSettings(userId);
  return lessonsForTopic(
    readList<SavedLesson>(settings, "topicLessons"),
    topicName,
  );
}

/** Apaga uma versão de aula. Devolve `false` quando o id não existe. */
export async function deleteLesson(
  userId: number,
  lessonId: string,
): Promise<boolean> {
  const settings = await requireSettings(userId);
  const current = readList<SavedLesson>(settings, "topicLessons");
  const next = deleteLessonFrom(current, lessonId);
  if (next.length === current.length) return false;
  await persist(userId, "topicLessons", next);
  return true;
}
