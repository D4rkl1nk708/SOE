/**
 * Aula interativa — modelo puro e regras de armazenamento por tópico.
 *
 * Vive em `shared/` porque as duas pontas precisam da mesma regra: o servidor
 * (JSON/SQLite) e o app offline (IndexedDB no APK). Nada de I/O aqui — só
 * funções sobre arrays, para o comportamento ser idêntico nos dois lados.
 */

export type LessonStep = {
  /** Título curto do passo (2 a 6 palavras). */
  title: string;
  /** Uma frase de narração, sincronizada com a animação. */
  text: string;
};

export type LessonQuestion = {
  prompt: string;
  options: string[];
  /** Índice da alternativa correta em `options`. */
  correctIndex: number;
  /** Feedback mostrado depois de responder, certo ou errado. */
  feedback: string;
};

export type SavedLesson = {
  id: string;
  topicId?: number;
  topicName: string;
  disciplineName?: string;
  title: string;
  /** HTML autocontido com a animação (renderizado em sandbox sem rede). */
  html: string;
  steps: LessonStep[];
  /** A interação que explora o conceito (arrastar, slider, montar). */
  interaction: string;
  question: LessonQuestion;
  /** O que a animação ignora. */
  limits: string[];
  createdAt: string;
};

/** Versões guardadas por tópico: a atual + 4 anteriores. */
export const MAX_TOPIC_LESSON_VERSIONS = 5;
/** Teto total de aulas guardadas por usuário. */
export const MAX_LESSONS = 100;

export function lessonTopicKey(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Insere `record` como a versão mais recente do tópico, mantendo no máximo
 * `MAX_TOPIC_LESSON_VERSIONS` versões daquele tópico e `MAX_LESSONS` no total.
 * Não muta `list`; a ordem de leitura é resolvida por `lessonsForTopic`.
 */
export function upsertLesson(
  list: SavedLesson[],
  record: SavedLesson,
  caps: { perTopic?: number; total?: number } = {},
): SavedLesson[] {
  const perTopic = Math.max(
    1,
    Math.floor(caps.perTopic ?? MAX_TOPIC_LESSON_VERSIONS),
  );
  const total = Math.max(1, Math.floor(caps.total ?? MAX_LESSONS));
  const source = Array.isArray(list) ? list : [];
  const key = lessonTopicKey(record.topicName);
  const sameTopic = source.filter(
    (item) => lessonTopicKey(item?.topicName) === key,
  );
  const others = source.filter(
    (item) => lessonTopicKey(item?.topicName) !== key,
  );
  const history = [...sameTopic, record].slice(-perTopic);
  const next = [...others, ...history];
  return next.length > total ? next.slice(-total) : next;
}

/** Aulas do tópico (ou todas), da mais recente para a mais antiga. */
export function lessonsForTopic(
  list: SavedLesson[],
  topicName?: string,
  limit?: number,
): SavedLesson[] {
  const source = Array.isArray(list) ? list : [];
  const key = lessonTopicKey(topicName);
  const filtered = key
    ? source.filter((item) => lessonTopicKey(item?.topicName) === key)
    : source.slice();
  const sorted = filtered
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const left = a.item?.createdAt || "";
      const right = b.item?.createdAt || "";
      if (left !== right) return right.localeCompare(left);
      return b.index - a.index;
    })
    .map((entry) => entry.item);
  const cap = Number.isFinite(limit as number)
    ? Math.max(0, Math.floor(limit as number))
    : sorted.length;
  return sorted.slice(0, cap);
}

/** Remove uma aula pelo id (não muta `list`). */
export function deleteLessonFrom(
  list: SavedLesson[],
  lessonId: string,
): SavedLesson[] {
  const source = Array.isArray(list) ? list : [];
  return source.filter((item) => item?.id !== lessonId);
}
