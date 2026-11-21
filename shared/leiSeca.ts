/**
 * Lei seca automática dos pontos cegos (v6.9.7, item 3).
 *
 * Detecta tópicos de literalidade fraca (volume + acerto baixo, artigo citado)
 * e monta cartões a partir do MATERIAL DO PRÓPRIO ALUNO: o erro do Caderno de
 * Erros e as notas do tópico.
 *
 * Regra dura: proibido inventar literalidade de lei. Todo cartão aponta para
 * sua origem (`sourceErrorId` ou `noteId`/`sourceNoteKey`); sem origem, o
 * cartão não existe.
 */

export const LEI_SECA_DECK = "lei-seca";

/** Meta diária padrão de cartões de lei seca. */
export const LEI_SECA_DEFAULT_DAILY_CAP = 15;

export interface LeiSecaDisciplineLike {
  id: number;
  name: string;
  performance?: { questionsResolved?: number; accuracy?: number } | null;
}

export interface LeiSecaTopicLike {
  id: number;
  name: string;
  disciplineId: number;
  notes?: string | null;
  topicNotes?: string[] | null;
  performance?: {
    questionsResolved?: number;
    accuracy?: number;
    correctCount?: number;
    errorCount?: number;
  } | null;
}

export interface LeiSecaErrorLike {
  id: number;
  topicId: number;
  disciplineId: number;
  statement?: string;
  correctAnswer?: string;
  userAnswer?: string;
  resolution?: string;
  supportText?: string;
  aiAnalysis?: string;
  statementPending?: boolean;
}

export interface LeiSecaNoteLike {
  id: number;
  disciplineId: number;
  topicId?: number;
  title?: string;
  content?: string;
}

export interface LeiSecaCandidate {
  topicId: number;
  disciplineId: number;
  topicName: string;
  disciplineName: string;
  questionsResolved: number;
  accuracy: number;
  /** Trechos de artigo encontrados no nome do tópico ("arts. 18 a 43"). */
  articleMentions: string[];
  /** Prioridade: maior = mais urgente. */
  score: number;
}

export interface LeiSecaCardDraft {
  disciplineId: number;
  topicId: number;
  front: string;
  back: string;
  deck: typeof LEI_SECA_DECK;
  sourceErrorId?: number;
  noteId?: number;
  /** Origem textual do tópico (`topicNotes[i]`), quando não há nota do banco. */
  sourceNoteKey?: string;
}

/** Volume e acerto mínimos: abaixo disso o "ponto cego" é amostra pequena. */
export const LEI_SECA_MIN_QUESTIONS = 10;
export const LEI_SECA_MAX_ACCURACY = 60;

/**
 * Placeholder que o próprio SOE grava quando só capturou o #id da questão.
 * Não é material do aluno: virar cartão com isso seria inventar conteúdo.
 */
const PLACEHOLDER_STATEMENT =
  /enunciado\s+n[aã]o\s+capturado|^\s*#?\d+\s*$|sem\s+enunciado/i;

export function isPlaceholderStatement(
  text: string | null | undefined,
): boolean {
  const value = String(text || "").trim();
  if (!value) return true;
  return PLACEHOLDER_STATEMENT.test(value);
}

const ARTICLE_PATTERN =
  /\b(art(?:s|igos?)?\.?\s*\d+[º°]?(?:\s*(?:a|ao|até|-|–)\s*\d+[º°]?)?)/gi;

export function extractArticleMentions(
  name: string | null | undefined,
): string[] {
  const found = String(name || "").match(ARTICLE_PATTERN) || [];
  const cleaned = found
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return Array.from(new Set(cleaned));
}

function accuracyOf(topic: LeiSecaTopicLike): number {
  const resolved = Number(topic.performance?.questionsResolved) || 0;
  const explicit = Number(topic.performance?.accuracy);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  if (resolved <= 0) return 0;
  const correct = Number(topic.performance?.correctCount) || 0;
  return Math.round((correct / resolved) * 100);
}

/**
 * Tópicos com `questionsResolved >= 10` e `accuracy < 60`, priorizando os que
 * citam artigo. O score nunca depende de IA: é (60 − acerto) + volume + artigo.
 */
export function detectLeiSecaCandidates(
  disciplines: LeiSecaDisciplineLike[] | null | undefined,
  topics: LeiSecaTopicLike[] | null | undefined,
): LeiSecaCandidate[] {
  const disciplineNames = new Map<number, string>(
    (disciplines || []).map((discipline) => [discipline.id, discipline.name]),
  );

  const candidates: LeiSecaCandidate[] = [];
  for (const topic of topics || []) {
    if (!topic || typeof topic.id !== "number") continue;
    const resolved = Number(topic.performance?.questionsResolved) || 0;
    if (resolved < LEI_SECA_MIN_QUESTIONS) continue;
    const accuracy = accuracyOf(topic);
    if (accuracy >= LEI_SECA_MAX_ACCURACY) continue;

    const articleMentions = extractArticleMentions(topic.name);
    const gap = Math.max(0, LEI_SECA_MAX_ACCURACY - accuracy);
    const volume = Math.min(40, Math.round(resolved / 5));
    const articleBonus = articleMentions.length > 0 ? 25 : 0;

    candidates.push({
      topicId: topic.id,
      disciplineId: topic.disciplineId,
      topicName: topic.name,
      disciplineName:
        disciplineNames.get(topic.disciplineId) ||
        `Disciplina ${topic.disciplineId}`,
      questionsResolved: resolved,
      accuracy,
      articleMentions,
      score: gap + volume + articleBonus,
    });
  }

  return candidates.sort(
    (a, b) =>
      b.score - a.score ||
      b.questionsResolved - a.questionsResolved ||
      a.topicName.localeCompare(b.topicName),
  );
}

function shorten(text: string | null | undefined, max: number): string {
  const value = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Cartões a partir dos erros do aluno: frente = assertiva curta, verso =
 * resposta correta + resolução. Erro ainda sem enunciado não gera cartão.
 */
export function buildCardsFromErrors(
  errors: LeiSecaErrorLike[] | null | undefined,
  topicIds?: number[] | null,
): LeiSecaCardDraft[] {
  const allowed = topicIds && topicIds.length > 0 ? new Set(topicIds) : null;
  const cards: LeiSecaCardDraft[] = [];

  for (const error of errors || []) {
    if (!error || typeof error.id !== "number") continue;
    if (error.statementPending) continue;
    if (allowed && !allowed.has(error.topicId)) continue;

    const front = shorten(error.statement, 320);
    if (!front) continue;
    // Enunciado placeholder ("[Enunciado não capturado pelo TEC]") não é fonte.
    if (isPlaceholderStatement(front)) continue;

    const parts: string[] = [];
    if (error.correctAnswer)
      parts.push(`Resposta correta: ${error.correctAnswer}`);
    if (error.userAnswer) parts.push(`Você marcou: ${error.userAnswer}`);
    const explanation =
      error.resolution || error.supportText || error.aiAnalysis;
    if (explanation) parts.push(shorten(explanation, 700));
    const back = parts.join("\n\n");
    // Sem gabarito nem resolução não há o que memorizar: não inventamos.
    if (!back) continue;

    cards.push({
      disciplineId: error.disciplineId,
      topicId: error.topicId,
      front,
      back,
      deck: LEI_SECA_DECK,
      sourceErrorId: error.id,
    });
  }

  return cards;
}

/**
 * Cartões a partir das notas do aluno (`topicNotes` do tópico e notas do
 * banco). A nota é a fonte: o verso repete o texto escrito por ele.
 */
export function buildCardsFromTopicNotes(
  topics: LeiSecaTopicLike[] | null | undefined,
  notes: LeiSecaNoteLike[] | null | undefined,
  topicIds?: number[] | null,
): LeiSecaCardDraft[] {
  const allowed = topicIds && topicIds.length > 0 ? new Set(topicIds) : null;
  const cards: LeiSecaCardDraft[] = [];

  for (const topic of topics || []) {
    if (!topic || typeof topic.id !== "number") continue;
    if (allowed && !allowed.has(topic.id)) continue;

    const inline = Array.isArray(topic.topicNotes) ? topic.topicNotes : [];
    inline.forEach((text, index) => {
      const content = String(text || "").trim();
      if (content.length < 3) return;
      const lines = content
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
      const front = shorten(lines[0] || content, 200);
      const back = shorten(lines.slice(1).join(" ") || content, 900);
      if (!front || !back) return;
      cards.push({
        disciplineId: topic.disciplineId,
        topicId: topic.id,
        front,
        back,
        deck: LEI_SECA_DECK,
        sourceNoteKey: `topic:${topic.id}:${index}`,
      });
    });

    const legacyNote = String(topic.notes || "").trim();
    if (legacyNote.length >= 3) {
      const lines = legacyNote
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
      const front = shorten(lines[0] || legacyNote, 200);
      const back = shorten(lines.slice(1).join(" ") || legacyNote, 900);
      if (front && back) {
        cards.push({
          disciplineId: topic.disciplineId,
          topicId: topic.id,
          front,
          back,
          deck: LEI_SECA_DECK,
          sourceNoteKey: `topic:${topic.id}:notes`,
        });
      }
    }
  }

  for (const note of notes || []) {
    if (!note || typeof note.id !== "number") continue;
    if (typeof note.topicId !== "number") continue;
    if (allowed && !allowed.has(note.topicId)) continue;
    const content = String(note.content || "").trim();
    if (content.length < 3) continue;
    const title = String(note.title || "").trim();
    const lines = content
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const front = shorten(title || lines[0] || content, 200);
    const back = shorten(
      (title ? lines.join(" ") : lines.slice(1).join(" ") || content) ||
        content,
      900,
    );
    if (!front || !back) continue;
    cards.push({
      disciplineId: note.disciplineId,
      topicId: note.topicId,
      front,
      back,
      deck: LEI_SECA_DECK,
      noteId: note.id,
    });
  }

  return cards;
}

export interface BuildLeiSecaInput {
  disciplines: LeiSecaDisciplineLike[];
  topics: LeiSecaTopicLike[];
  errors: LeiSecaErrorLike[];
  notes: LeiSecaNoteLike[];
  /** Tópicos alvo; vazio = todos os candidatos detectados. */
  topicIds?: number[] | null;
}

/**
 * Monta o lote completo (erros primeiro: são o material mais concreto) e
 * deduplica por origem, para a chamada repetida não duplicar.
 */
export function buildLeiSecaCards(input: BuildLeiSecaInput): {
  cards: LeiSecaCardDraft[];
  candidates: LeiSecaCandidate[];
} {
  const candidates = detectLeiSecaCandidates(input.disciplines, input.topics);
  const targetIds =
    input.topicIds && input.topicIds.length > 0
      ? input.topicIds
      : candidates.map((candidate) => candidate.topicId);

  const fromErrors = buildCardsFromErrors(input.errors, targetIds);
  const fromNotes = buildCardsFromTopicNotes(
    input.topics,
    input.notes,
    targetIds,
  );

  const seen = new Set<string>();
  const cards: LeiSecaCardDraft[] = [];
  for (const card of [...fromErrors, ...fromNotes]) {
    const origin = card.sourceErrorId
      ? `err:${card.sourceErrorId}`
      : card.noteId
        ? `note:${card.noteId}`
        : card.sourceNoteKey
          ? `key:${card.sourceNoteKey}`
          : "";
    if (!origin || seen.has(origin)) continue;
    seen.add(origin);
    cards.push(card);
  }

  return { cards, candidates };
}

/** Cap diário: quantos cartões o aluno estuda por dia (padrão 15). */
export function resolveDailyCap(cap: unknown): number {
  const parsed = Number(cap);
  if (!Number.isFinite(parsed) || parsed < 0) return LEI_SECA_DEFAULT_DAILY_CAP;
  return Math.min(200, Math.round(parsed));
}

/** Cartões de hoje: deck de lei seca vencidos, cortados pelo cap diário. */
export function selectLeiSecaToday<
  T extends { deck?: string; nextReviewDate?: string; archived?: boolean },
>(cards: T[] | null | undefined, today: string, cap: unknown): T[] {
  const limit = resolveDailyCap(cap);
  if (limit === 0) return [];
  return (cards || [])
    .filter((card) => card && card.deck === LEI_SECA_DECK && !card.archived)
    .filter((card) => String(card.nextReviewDate || "") <= today)
    .sort((a, b) =>
      String(a.nextReviewDate || "").localeCompare(
        String(b.nextReviewDate || ""),
      ),
    )
    .slice(0, limit);
}

/** Estatística do deck para a aba: total, vencidos hoje e feitos hoje. */
export function summarizeLeiSecaDeck(
  cards:
    | Array<{
        deck?: string;
        nextReviewDate?: string;
        archived?: boolean;
        updatedAt?: string;
      }>
    | null
    | undefined,
  today: string,
  cap: unknown,
): { total: number; dueToday: number; todayBatch: number; cap: number } {
  const deck = (cards || []).filter(
    (card) => card && card.deck === LEI_SECA_DECK && !card.archived,
  );
  const due = deck.filter((card) => String(card.nextReviewDate || "") <= today);
  const todayBatch = selectLeiSecaToday(deck, today, cap);
  return {
    total: deck.length,
    dueToday: due.length,
    todayBatch: todayBatch.length,
    cap: resolveDailyCap(cap),
  };
}
