/**
 * Camada de armazenamento local (IndexedDB) para o app rodar standalone no Android.
 * Replica a lógica do backend jsonStorage.
 */
import Dexie, { type Table } from "dexie";
import { buildSchedule, formatDateForDb, getScheduleParams } from "@shared/scheduling";
import { callAiProvider, extractJSON, AiProvider } from "./aiHelpers";

const now = () => new Date().toISOString();

interface User {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastSignedIn: string;
}

interface Discipline {
  id: number;
  userId: number;
  name: string;
  color: string;
  weight: number;
  order: number;
  studyTimeSeconds: number;
  createdAt: string;
  updatedAt: string;
}

interface Topic {
  id: number;
  userId: number;
  disciplineId: number;
  name: string;
  order: number;
  studyDate: string;
  notes: string | null;
  studyTimeSeconds: number;
  performance?: { questionsResolved: number; accuracy: number; correctCount: number; errorCount: number };
  createdAt: string;
  updatedAt: string;
}

interface Revision {
  id: number;
  userId: number;
  topicId: number;
  scheduledDate: string;
  type: "revision" | "test";
  revisionNumber: number;
  completed: boolean;
  ignored: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MockExam {
  id: number;
  userId: number;
  name: string;
  date: string;
  correct: number;
  wrong: number;
  blank: number;
  totalQuestions: number;
  score: number;
  createdAt: string;
}

interface Note {
  id: number;
  userId: number;
  disciplineId: number;
  topicId?: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface Counters {
  users: number;
  disciplines: number;
  topics: number;
  revisions: number;
  mockExams: number;
  notes: number;
  questionErrors: number;
}

interface Flashcard {
  id: number;
  userId: number;
  disciplineId: number;
  topicId?: number;
  noteId?: number;
  front: string;
  back: string;
  interval: number;
  easeFactor: number;
  repetitions: number;
  nextReviewDate: string;
  createdAt: string;
  updatedAt: string;
}

interface TecTopicSnapshot {
  topicName: string;
  disciplineName: string;
  questionsResolved: number;
  correctCount: number;
  errorCount: number;
  accuracy: number;
}

interface TecSnapshot {
  id: number;
  userId: number;
  importedAt: string;
  totalQuestions: number;
  totalCorrect: number;
  totalErrors: number;
  overallAccuracy: number;
  topics: TecTopicSnapshot[];
}

interface Counters {
  users: number;
  disciplines: number;
  topics: number;
  revisions: number;
  mockExams: number;
  notes: number;
  questionErrors: number;
  flashcards: number;
  tecSnapshots: number;
  conceptConfusions: number;
}

interface QuestionError {
  id: number;
  userId: number;
  topicId: number;
  disciplineId: number;
  questionId?: string;
  banca?: string;
  year?: number;
  contest?: string;
  statement: string;
  alternatives: { letter: string; text: string }[];
  userAnswer?: string;
  correctAnswer?: string;
  errorOrigin?: "attention" | "forgetting" | "theory" | "trap";
  createdAt: string;
}

export interface SubjectiveAnswer {
  id?: number;
  userId: number;
  revisionId: number;
  topicId: number;
  topicName: string;
  disciplineName: string;
  banca: string;
  imageDataUrl: string;
  transcription: string;
  correction: string;
  score?: number;
  createdAt: string;
}

export interface ConceptConfusion {
  id: number;
  userId: number;
  disciplineId?: number;
  discipline?: string;
  conceptA: string;
  conceptB: string;
  explanation: string;
  count: number;
  lastDetectedAt: string;
}

class LocalDb extends Dexie {
  users!: Table<User & { id: number }>;
  disciplines!: Table<Discipline & { id: number }>;
  topics!: Table<Topic & { id: number }>;
  revisions!: Table<Revision & { id: number }>;
  mockExams!: Table<MockExam & { id: number }>;
  notes!: Table<Note & { id: number }>;
  questionErrors!: Table<QuestionError & { id: number }>;
  flashcards!: Table<Flashcard & { id: number }>;
  tecSnapshots!: Table<TecSnapshot & { id: number }>;
  extraCollections!: Table<{ key: string; data: unknown }>;
  counters!: Table<{ key: string; value: number }>;
  subjectiveAnswers!: Table<SubjectiveAnswer & { id: number }>;
  conceptConfusions!: Table<ConceptConfusion & { id: number }>;

  constructor() {
    super("SOE_Local");
    this.version(1).stores({
      users: "id, openId",
      disciplines: "id, userId",
      topics: "id, userId, disciplineId, [userId+disciplineId]",
      revisions: "id, userId, topicId, scheduledDate",
      mockExams: "id, userId",
      notes: "id, userId, disciplineId",
      counters: "key",
    });
    this.version(2).stores({
      users: "id, openId",
      disciplines: "id, userId",
      topics: "id, userId, disciplineId, [userId+disciplineId]",
      revisions: "id, userId, topicId, scheduledDate",
      mockExams: "id, userId",
      notes: "id, userId, disciplineId",
      questionErrors: "id, userId, topicId, disciplineId",
      counters: "key",
    });
    this.version(3).stores({
      users: "id, openId",
      disciplines: "id, userId",
      topics: "id, userId, disciplineId, [userId+disciplineId]",
      revisions: "id, userId, topicId, scheduledDate",
      mockExams: "id, userId",
      notes: "id, userId, disciplineId",
      questionErrors: "id, userId, topicId, disciplineId",
      extraCollections: "key",
      counters: "key",
    });
    this.version(4).stores({
      users: "id, openId",
      disciplines: "id, userId",
      topics: "id, userId, disciplineId, [userId+disciplineId]",
      revisions: "id, userId, topicId, scheduledDate",
      mockExams: "id, userId",
      notes: "id, userId, disciplineId",
      questionErrors: "id, userId, topicId, disciplineId",
      extraCollections: "key",
      counters: "key",
      subjectiveAnswers: "++id, userId, revisionId, topicId, banca, createdAt",
    });
    this.version(5).stores({
      users: "id, openId",
      disciplines: "id, userId",
      topics: "id, userId, disciplineId, [userId+disciplineId]",
      revisions: "id, userId, topicId, scheduledDate",
      mockExams: "id, userId",
      notes: "id, userId, disciplineId",
      questionErrors: "id, userId, topicId, disciplineId",
      flashcards: "id, userId, disciplineId, topicId",
      tecSnapshots: "id, userId, importedAt",
      extraCollections: "key",
      counters: "key",
      subjectiveAnswers: "++id, userId, revisionId, topicId, banca, createdAt",
    });
    this.version(6).stores({
      users: "id, openId",
      disciplines: "id, userId",
      topics: "id, userId, disciplineId, [userId+disciplineId]",
      revisions: "id, userId, topicId, scheduledDate",
      mockExams: "id, userId",
      notes: "id, userId, disciplineId",
      questionErrors: "id, userId, topicId, disciplineId",
      flashcards: "id, userId, disciplineId, topicId",
      tecSnapshots: "id, userId, importedAt",
      extraCollections: "key",
      counters: "key",
      subjectiveAnswers: "++id, userId, revisionId, topicId, banca, createdAt",
      conceptConfusions: "id, userId, disciplineId",
    });
  }
}

const db = new LocalDb();

async function getCounters(): Promise<Counters> {
  const rows = await db.counters.toArray();
  const m: Record<string, number> = {};
  for (const r of rows) m[r.key] = r.value;
  return {
    users: m.users ?? 0,
    disciplines: m.disciplines ?? 0,
    topics: m.topics ?? 0,
    revisions: m.revisions ?? 0,
    mockExams: m.mockExams ?? 0,
    notes: m.notes ?? 0,
    questionErrors: m.questionErrors ?? 0,
    flashcards: m.flashcards ?? 0,
    tecSnapshots: m.tecSnapshots ?? 0,
  };
}

async function incCounter(key: keyof Counters): Promise<number> {
  const c = await getCounters();
  const v = (c[key] ?? 0) + 1;
  await db.counters.put({ key, value: v });
  return v;
}

const LOCAL_USER_ID = 1;

async function ensureLocalUser(): Promise<User> {
  let u = await db.users.get(LOCAL_USER_ID);
  if (!u) {
    const settings = {
      theme: "light",
      studyStreak: { current: 0, best: 0, lastStudyDate: null },
      exams: [] as { id: string; name: string; date: string }[],
      editalCycle: [] as { id: string; title: string; durationMinutes: number; done: boolean }[],
      editalRows: [] as { id: string; discipline: string; topic: string; completed: boolean; notes?: string }[],
    };
    await db.users.add({
      id: LOCAL_USER_ID,
      openId: "local-user",
      name: "Usuário Local",
      email: "local@estudos.local",
      loginMethod: "local",
      role: "admin",
      settings,
      createdAt: now(),
      updatedAt: now(),
      lastSignedIn: now(),
    });
    await db.counters.put({ key: "users", value: 1 });
    u = (await db.users.get(LOCAL_USER_ID))!;
  }
  return u as User;
}

export async function localAuthMe(): Promise<User | null> {
  return ensureLocalUser();
}

export async function localUpdateSettings(input: Record<string, unknown>): Promise<{ success: boolean }> {
  const u = await ensureLocalUser();
  const settings = { ...(u.settings as Record<string, unknown>), ...input };
  await db.users.update(LOCAL_USER_ID, { settings, updatedAt: now() });
  return { success: true };
}

export async function localExamList(): Promise<{ id: string; name: string; date: string }[]> {
  const u = await ensureLocalUser();
  return ((u.settings as Record<string, unknown>).exams as { id: string; name: string; date: string }[]) ?? [];
}

export async function localExamUpsert(input: { id?: string; name: string; date: string }): Promise<{ success: boolean; id: string }> {
  const u = await ensureLocalUser();
  const exams = ((u.settings as Record<string, unknown>).exams as { id: string; name: string; date: string }[]) ?? [];
  const nextId = input.id ?? `exam-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const exists = exams.some((e) => e.id === nextId);
  const updated = exists
    ? exams.map((e) => (e.id === nextId ? { ...e, name: input.name, date: input.date } : e))
    : [...exams, { id: nextId, name: input.name, date: input.date }];
  await db.users.update(LOCAL_USER_ID, {
    settings: { ...(u.settings as Record<string, unknown>), exams: updated },
    updatedAt: now(),
  });
  return { success: true, id: nextId };
}

export async function localExamRemove(input: { id: string }): Promise<{ success: boolean }> {
  const u = await ensureLocalUser();
  const exams = ((u.settings as Record<string, unknown>).exams as { id: string; name: string; date: string }[]) ?? [];
  const updated = exams.filter((e) => e.id !== input.id);
  await db.users.update(LOCAL_USER_ID, {
    settings: { ...(u.settings as Record<string, unknown>), exams: updated },
    updatedAt: now(),
  });
  return { success: true };
}

export async function localDisciplineList(): Promise<Discipline[]> {
  const list = await db.disciplines.where("userId").equals(LOCAL_USER_ID).toArray();
  return list.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

export async function localDisciplineCreate(input: { name: string; color: string; weight: number }): Promise<{ id: number }> {
  const list = await db.disciplines.where("userId").equals(LOCAL_USER_ID).toArray();
  const nextOrder = list.length ? Math.max(...list.map((d) => d.order ?? 0)) + 1 : 1;
  const id = await incCounter("disciplines");
  await db.disciplines.add({
    id,
    userId: LOCAL_USER_ID,
    name: input.name,
    color: input.color,
    weight: input.weight,
    order: nextOrder,
    studyTimeSeconds: 0,
    createdAt: now(),
    updatedAt: now(),
  });
  return { id };
}

export async function localDisciplineUpdate(input: { id: number; name?: string; color?: string; weight?: number; order?: number }): Promise<{ success: boolean }> {
  const { id, ...data } = input;
  const d = await db.disciplines.get(id);
  if (d && d.userId === LOCAL_USER_ID) {
    await db.disciplines.update(id, { ...data, updatedAt: now() });
  }
  return { success: true };
}

export async function localDisciplineDelete(input: { id: number }): Promise<{ success: boolean }> {
  const topics = await db.topics.where("[userId+disciplineId]").equals([LOCAL_USER_ID, input.id]).toArray();
  for (const t of topics) {
    await db.revisions.where("topicId").equals(t.id).delete();
  }
  await db.topics.where("disciplineId").equals(input.id).delete();
  await db.notes.where("disciplineId").equals(input.id).delete();
  await db.disciplines.delete(input.id);
  return { success: true };
}

export async function localDisciplineReorder(input: { orderedIds: number[] }): Promise<{ success: boolean }> {
  for (let i = 0; i < input.orderedIds.length; i++) {
    await db.disciplines.update(input.orderedIds[i], { order: i + 1, updatedAt: now() });
  }
  return { success: true };
}

export async function localTopicList(input?: { disciplineId?: number; search?: string }): Promise<{ topics: Topic[]; disciplines: Discipline[] }> {
  let topics = await db.topics.where("userId").equals(LOCAL_USER_ID).toArray();
  if (input?.disciplineId) topics = topics.filter((t) => t.disciplineId === input.disciplineId);
  if (input?.search) {
    const s = input.search.toLowerCase();
    topics = topics.filter((t) => t.name.toLowerCase().includes(s));
  }
  topics.sort((a, b) => {
    if (a.disciplineId !== b.disciplineId) return a.disciplineId - b.disciplineId;
    return (a.order ?? 999) - (b.order ?? 999);
  });
  const disciplines = await localDisciplineList();
  return { topics, disciplines };
}

export async function localTopicCreate(input: {
  name: string;
  disciplineId: number;
  studyDate?: string;
  notes?: string;
}): Promise<{ id: number; revisionsCreated: number }> {
  const studyDate = input.studyDate ?? formatDateForDb(new Date());
  const u = await ensureLocalUser();
  const settings = u.settings as Record<string, unknown>;
  const params = getScheduleParams(settings);
  const list = await db.topics.where("[userId+disciplineId]").equals([LOCAL_USER_ID, input.disciplineId]).toArray();
  const nextOrder = list.length ? Math.max(...list.map((t) => t.order ?? 0)) + 1 : 1;
  const id = await incCounter("topics");
  await db.topics.add({
    id,
    userId: LOCAL_USER_ID,
    disciplineId: input.disciplineId,
    name: input.name,
    order: nextOrder,
    studyDate,
    notes: input.notes ?? null,
    studyTimeSeconds: 0,
    createdAt: now(),
    updatedAt: now(),
  });
  const activities = buildSchedule(new Date(studyDate), params);
  // Batch revision inserts in a single transaction for performance
  await db.transaction("rw", db.revisions, db.counters, async () => {
    for (const act of activities) {
      const rid = await incCounter("revisions");
      await db.revisions.add({
        id: rid,
        userId: LOCAL_USER_ID,
        topicId: id,
        scheduledDate: formatDateForDb(act.date),
        type: act.type,
        revisionNumber: act.revisionNumber,
        completed: false,
        ignored: false,
        completedAt: null,
        createdAt: now(),
        updatedAt: now(),
      });
    }
  });
  return { id, revisionsCreated: activities.length };
}

export async function localTopicDelete(input: { id: number }): Promise<{ success: true }> {
  await db.revisions.where("topicId").equals(input.id).delete();
  await db.notes.where("topicId").equals(input.id).delete();
  await db.topics.delete(input.id);
  return { success: true };
}

export async function localTopicUpdate(input: { id: number; name?: string; disciplineId?: number; notes?: string }): Promise<{ success: boolean }> {
  const { id, ...data } = input;
  const t = await db.topics.get(id);
  if (t && t.userId === LOCAL_USER_ID) {
    await db.topics.update(id, { ...data, updatedAt: now() });
  }
  return { success: true };
}

export async function localTopicSetPerformance(input: { topicId: number; correctCount: number; errorCount: number }): Promise<{ success: boolean }> {
  const t = await db.topics.get(input.topicId);
  if (t && t.userId === LOCAL_USER_ID) {
    const total = input.correctCount + input.errorCount;
    const accuracy = total > 0 ? Math.round((input.correctCount / total) * 100) : 0;
    await db.topics.update(input.topicId, {
      performance: {
        questionsResolved: total,
        accuracy,
        correctCount: input.correctCount,
        errorCount: input.errorCount,
      },
      updatedAt: now(),
    });
  }
  return { success: true };
}

export async function localTopicReorder(input: { disciplineId: number; orderedIds: number[] }): Promise<{ success: boolean }> {
  // Batch all updates in a single transaction for performance
  await db.transaction("rw", db.topics, async () => {
    await Promise.all(
      input.orderedIds.map((id, i) => db.topics.update(id, { order: i + 1, updatedAt: now() }))
    );
  });
  return { success: true };
}

export async function localTopicResetAllStats(): Promise<{ success: boolean }> {
  const topics = await db.topics.where("userId").equals(LOCAL_USER_ID).toArray();
  await Promise.all(
    topics.map((t) =>
      db.topics.update(t.id, {
        performance: undefined,
        updatedAt: now(),
      })
    )
  );
  return { success: true };
}

export async function localRevisionList(input?: { completed?: boolean; ignored?: boolean }): Promise<Revision[]> {
  let list = await db.revisions.where("userId").equals(LOCAL_USER_ID).toArray();
  if (input?.completed !== undefined) list = list.filter((r) => r.completed === input.completed);
  if (input?.ignored !== undefined) list = list.filter((r) => r.ignored === input.ignored);
  return list.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
}

export async function localRevisionMarkCompleted(input: { id: number; completed: boolean }): Promise<{ success: boolean }> {
  const r = await db.revisions.get(input.id);
  if (r && r.userId === LOCAL_USER_ID) {
    await db.revisions.update(input.id, {
      completed: input.completed,
      completedAt: input.completed ? now() : null,
      updatedAt: now(),
    });
  }
  return { success: true };
}

export async function localRevisionMarkIgnored(input: { id: number; ignored: boolean }): Promise<{ success: boolean }> {
  const r = await db.revisions.get(input.id);
  if (r && r.userId === LOCAL_USER_ID) {
    await db.revisions.update(input.id, { ignored: input.ignored, updatedAt: now() });
  }
  return { success: true };
}

export async function localImportExportBackup(): Promise<string> {
  const users = await db.users.toArray();
  const disciplines = await db.disciplines.toArray();
  const topics = await db.topics.toArray();
  const revisions = await db.revisions.toArray();
  const mockExams = await db.mockExams.toArray();
  const notes = await db.notes.toArray();
  const questionErrors = await db.questionErrors.toArray();
  const rawExtras = await db.extraCollections.toArray();
  const extras: Record<string, any> = {};
  for (const ext of rawExtras) extras[ext.key] = ext.data;
  const c = await getCounters();
  return JSON.stringify(
    { users, disciplines, topics, revisions, mockExams, notes, questionErrors, counters: c, ...extras },
    null,
    2
  );
}

export async function localImportImportBackup(input: { json: string }): Promise<{ success: boolean }> {
  const data = JSON.parse(input.json);
  if (!data.users || !data.disciplines || !data.topics || !data.revisions) throw new Error("Invalid database format");
  await db.transaction("rw", [db.users, db.disciplines, db.topics, db.revisions, db.mockExams, db.notes, db.questionErrors, db.extraCollections, db.counters], async () => {
    await db.users.clear();
    await db.disciplines.clear();
    await db.topics.clear();
    await db.revisions.clear();
    await db.mockExams.clear();
    await db.notes.clear();
    await db.questionErrors.clear();
    await db.extraCollections.clear();
    await db.counters.clear();
    for (const u of data.users) await db.users.add(u);
    for (const d of data.disciplines) await db.disciplines.add(d);
    for (const t of data.topics) await db.topics.add(t);
    for (const r of data.revisions) await db.revisions.add(r);
    for (const m of data.mockExams ?? []) await db.mockExams.add(m);
    for (const n of data.notes ?? []) await db.notes.add(n);
    for (const qe of data.questionErrors ?? []) await db.questionErrors.add(qe);
    if (data.flashcards) await db.extraCollections.put({ key: "flashcards", data: data.flashcards });
    if (data.tecSnapshots) await db.extraCollections.put({ key: "tecSnapshots", data: data.tecSnapshots });
    if (data.cadernosTec) await db.extraCollections.put({ key: "cadernosTec", data: data.cadernosTec });
    const c = data.counters ?? {};
    for (const [k, v] of Object.entries(c)) await db.counters.put({ key: k, value: v as number });
  });
  return { success: true };
}

export async function localCalendarGetData(input: { startDate: string; endDate: string }): Promise<{
  revisions: Revision[];
  topics: Topic[];
  disciplines: Discipline[];
}> {
  const revisions = await db.revisions
    .where("userId")
    .equals(LOCAL_USER_ID)
    .filter((r) => !r.ignored && r.scheduledDate >= input.startDate && r.scheduledDate <= input.endDate)
    .toArray();
  const topics = await db.topics.where("userId").equals(LOCAL_USER_ID).toArray();
  const disciplines = await db.disciplines.where("userId").equals(LOCAL_USER_ID).toArray();
  return { revisions, topics, disciplines };
}

export async function localDashboardGetStats(): Promise<Record<string, unknown>> {
  const u = await ensureLocalUser();
  const disciplines = await localDisciplineList();
  const topics = await db.topics.where("userId").equals(LOCAL_USER_ID).toArray();
  const revisions = await db.revisions.where("userId").equals(LOCAL_USER_ID).toArray();
  const today = formatDateForDb(new Date());
  const pendingRevisions = revisions.filter((r) => !r.completed && !r.ignored && r.scheduledDate < today).length;
  const completedRevisions = revisions.filter((r) => r.completed).length;
  const disciplineStats = disciplines.map((d) => {
    const discTopics = topics.filter((t) => t.disciplineId === d.id).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    const totalResolved = discTopics.reduce((s, t) => s + (t.performance?.questionsResolved ?? 0), 0);
    const totalCorrect = discTopics.reduce((s, t) => s + (t.performance?.correctCount ?? 0), 0);
    const totalError = discTopics.reduce((s, t) => s + (t.performance?.errorCount ?? 0), 0);
    const agg = totalResolved > 0
      ? { questionsResolved: totalResolved, accuracy: Math.round((totalCorrect / totalResolved) * 100), correctCount: totalCorrect, errorCount: totalError }
      : (d as any).performance;
    const studyTime = discTopics.reduce((s, t) => s + (t.studyTimeSeconds ?? 0), 0);
    return {
      disciplineId: d.id,
      name: d.name,
      color: d.color,
      topicCount: discTopics.length,
      performance: agg,
      studyTimeSeconds: studyTime,
      topics: discTopics.map((t) => {
        const topicRevs = revisions.filter((r) => r.topicId === t.id);
        return {
          id: t.id,
          name: t.name,
          studyDate: t.studyDate,
          studyTimeSeconds: t.studyTimeSeconds ?? 0,
          completedRevisions: topicRevs.filter((r) => r.completed).length,
          performance: t.performance,
        };
      }),
    };
  });
  return {
    totalTopics: topics.length,
    totalDisciplines: disciplines.length,
    pendingRevisions,
    completedRevisions,
    settings: u.settings,
    disciplineStats,
  };
}

export async function localMockExamList(): Promise<MockExam[]> {
  return db.mockExams.where("userId").equals(LOCAL_USER_ID).sortBy("date").then((a) => a.reverse());
}

export async function localMockExamCreate(input: {
  name: string;
  date: string;
  correct: number;
  wrong: number;
  blank: number;
  totalQuestions: number;
}): Promise<MockExam> {
  const id = await incCounter("mockExams");
  const score = input.correct - input.wrong;
  const exam: MockExam = {
    id,
    userId: LOCAL_USER_ID,
    ...input,
    score,
    createdAt: now(),
  };
  await db.mockExams.add(exam);
  return exam;
}

export async function localNoteList(): Promise<Note[]> {
  return db.notes.where("userId").equals(LOCAL_USER_ID).toArray().then((a) => a.sort((x, y) => y.updatedAt.localeCompare(x.updatedAt)));
}

export async function localNoteUpsert(input: {
  id?: number;
  userId: number;
  disciplineId: number;
  topicId?: number;
  title: string;
  content: string;
}): Promise<{ success: boolean }> {
  if (input.id) {
    const n = await db.notes.get(input.id);
    if (n && n.userId === LOCAL_USER_ID) {
      await db.notes.update(input.id, { ...input, updatedAt: now() });
    }
  } else {
    const id = await incCounter("notes");
    await db.notes.add({
      id,
      userId: LOCAL_USER_ID,
      disciplineId: input.disciplineId,
      topicId: input.topicId,
      title: input.title,
      content: input.content,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  return { success: true };
}

export async function localMockExamUpdate(input: {
  id: number;
  name?: string;
  date?: string;
  correct?: number;
  wrong?: number;
  blank?: number;
  totalQuestions?: number;
}): Promise<{ success: boolean }> {
  const exam = await db.mockExams.get(input.id);
  if (!exam || exam.userId !== LOCAL_USER_ID) return { success: false };
  const { id, ...data } = input;
  const correct = data.correct ?? exam.correct;
  const wrong = data.wrong ?? exam.wrong;
  await db.mockExams.update(id, { ...data, score: correct - wrong });
  return { success: true };
}

export async function localMockExamDelete(input: { id: number }): Promise<{ success: boolean }> {
  const exam = await db.mockExams.get(input.id);
  if (!exam || exam.userId !== LOCAL_USER_ID) return { success: false };
  await db.mockExams.delete(input.id);
  return { success: true };
}

export async function localNoteDelete(input: { id: number }): Promise<{ success: boolean }> {
  const note = await db.notes.get(input.id);
  if (!note || note.userId !== LOCAL_USER_ID) return { success: false };
  await db.notes.delete(input.id);
  return { success: true };
}

export async function localDashboardGetWeeklyStats(): Promise<Record<string, unknown>> {
  const disciplines = await localDisciplineList();
  const topics = await db.topics.where("userId").equals(LOCAL_USER_ID).toArray();

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(weekStart.getDate() - 7);
  const lastWeekEnd = new Date(weekStart);
  lastWeekEnd.setMilliseconds(-1);

  function inRange(dateStr: string, from: Date, to: Date): boolean {
    const d = new Date(dateStr);
    return d >= from && d <= to;
  }

  const thisWeekTopics = topics.filter(t => inRange(t.createdAt || t.studyDate, weekStart, today));
  const lastWeekTopics = topics.filter(t => inRange(t.createdAt || t.studyDate, lastWeekStart, lastWeekEnd));

  const sumPerf = (ts: typeof topics) => ({
    topics: ts.length,
    questions: ts.reduce((s, t) => s + (t.performance?.questionsResolved ?? 0), 0),
    correct: ts.reduce((s, t) => s + (t.performance?.correctCount ?? 0), 0),
    studySeconds: ts.reduce((s, t) => s + (t.studyTimeSeconds ?? 0), 0),
  });

  const byDiscipline = disciplines.map(d => {
    const discTopics = topics.filter(t => t.disciplineId === d.id);
    const totalQ = discTopics.reduce((s, t) => s + (t.performance?.questionsResolved ?? 0), 0);
    const totalC = discTopics.reduce((s, t) => s + (t.performance?.correctCount ?? 0), 0);
    const secs = discTopics.reduce((s, t) => s + (t.studyTimeSeconds ?? 0), 0);
    return { name: d.name, color: d.color, studySeconds: secs, accuracy: totalQ > 0 ? Math.round(totalC / totalQ * 100) : 0, questionsResolved: totalQ };
  }).filter(d => d.studySeconds > 0 || d.questionsResolved > 0);

  return { thisWeek: sumPerf(thisWeekTopics), lastWeek: sumPerf(lastWeekTopics), byDiscipline };
}

// ============ QUESTION ERRORS ============
export async function localSaveQuestionError(input: {
  topicId: number; disciplineId: number;
  questionId?: string; banca?: string; year?: number; contest?: string;
  statement: string; alternatives: { letter: string; text: string }[];
  userAnswer?: string; correctAnswer?: string;
  errorOrigin?: "attention" | "forgetting" | "theory" | "trap";
}): Promise<QuestionError> {
  const id = await incCounter("questionErrors");
  const record: QuestionError = {
    ...input,
    id,
    userId: LOCAL_USER_ID,
    createdAt: now(),
  };
  await db.questionErrors.add(record);
  return record;
}

export interface LocalPaginatedResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
}

export async function localGetQuestionErrors(
  opts?: { topicId?: number; disciplineId?: number; limit?: number; offset?: number }
): Promise<LocalPaginatedResult<QuestionError>> {
  let results = await db.questionErrors.where("userId").equals(LOCAL_USER_ID).reverse().sortBy("createdAt");
  if (opts?.topicId) results = results.filter(e => e.topicId === opts.topicId);
  if (opts?.disciplineId) results = results.filter(e => e.disciplineId === opts.disciplineId);
  const total = results.length;
  const limit = Math.min(opts?.limit ?? 50, 200);
  const offset = opts?.offset ?? 0;
  const items = results.slice(offset, offset + limit);
  return { items, total, hasMore: offset + limit < total, nextOffset: offset + limit };
}

export async function localDeleteQuestionError(input: { id: number }): Promise<{ success: boolean }> {
  const err = await db.questionErrors.get(input.id);
  if (!err || err.userId !== LOCAL_USER_ID) return { success: false };
  await db.questionErrors.delete(input.id);
  return { success: true };
}

// ─── Subjective Answers ──────────────────────────────────────────────────────
export async function localSaveSubjectiveAnswer(input: {
  revisionId: number;
  topicId: number;
  topicName: string;
  disciplineName: string;
  banca: string;
  imageDataUrl: string;
  transcription: string;
  correction: string;
  score?: number;
}): Promise<SubjectiveAnswer & { id: number }> {
  const record: SubjectiveAnswer = {
    ...input,
    userId: LOCAL_USER_ID,
    createdAt: now(),
  };
  // Dexie requires cast because id is auto-generated
  const id = await db.subjectiveAnswers.add(record as any);
  return { ...record, id: id as number };
}

export async function localGetSubjectiveAnswers(opts?: { topicId?: number; banca?: string; limit?: number }): Promise<(SubjectiveAnswer & { id: number })[]> {
  let results = await db.subjectiveAnswers.where("userId").equals(LOCAL_USER_ID).reverse().sortBy("createdAt");
  if (opts?.topicId) results = results.filter(e => e.topicId === opts.topicId);
  if (opts?.banca) results = results.filter(e => e.banca === opts.banca);
  if (opts?.limit) results = results.slice(0, opts.limit);
  return results as (SubjectiveAnswer & { id: number })[];
}

export async function localDeleteSubjectiveAnswer(id: number): Promise<void> {
  await db.subjectiveAnswers.delete(id);
}

// ============ FLASHCARDS ============
export async function localFlashcardList(): Promise<Flashcard[]> {
  return db.flashcards.where("userId").equals(LOCAL_USER_ID).toArray();
}

export async function localFlashcardCreate(input: {
  disciplineId: number;
  topicId?: number;
  noteId?: number;
  front: string;
  back: string;
}): Promise<Flashcard> {
  const id = await incCounter("flashcards");
  const card: Flashcard = {
    id,
    userId: LOCAL_USER_ID,
    ...input,
    interval: 0,
    easeFactor: 2.5,
    repetitions: 0,
    nextReviewDate: formatDateForDb(new Date()),
    createdAt: now(),
    updatedAt: now(),
  };
  await db.flashcards.add(card);
  return card;
}

export async function localFlashcardUpdate(input: {
  id: number;
  front?: string;
  back?: string;
}): Promise<{ success: boolean }> {
  const card = await db.flashcards.get(input.id);
  if (!card || card.userId !== LOCAL_USER_ID) return { success: false };
  await db.flashcards.update(input.id, { ...input, updatedAt: now() });
  return { success: true };
}

export async function localFlashcardDelete(input: { id: number }): Promise<{ success: boolean }> {
  const card = await db.flashcards.get(input.id);
  if (!card || card.userId !== LOCAL_USER_ID) return { success: false };
  await db.flashcards.delete(input.id);
  return { success: true };
}

export async function localFlashcardReview(input: { id: number; quality: number }): Promise<Flashcard> {
  const card = await db.flashcards.get(input.id);
  if (!card || card.userId !== LOCAL_USER_ID) throw new Error("Flashcard not found");
  
  // Simple SM-2 implementation
  let { interval, easeFactor, repetitions } = card;
  if (input.quality >= 3) {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easeFactor);
    repetitions++;
  } else {
    repetitions = 0;
    interval = 1;
  }
  easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - input.quality) * (0.08 + (5 - input.quality) * 0.02)));
  
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + interval);
  const nextReviewDate = formatDateForDb(nextDate);
  
  const updated = { ...card, interval, easeFactor, repetitions, nextReviewDate, updatedAt: now() };
  await db.flashcards.update(input.id, updated);
  return updated;
}

// ============ MENTOR / AI ============
export async function localGetTecRegressions(input: { thresholdPp: number }): Promise<{
  regressions: any[];
  weakTopics: any[];
  latestSnapshot: any;
  previousSnapshot: any;
  deltaAccuracy: number | null;
  deltaQuestions: number | null;
}> {
  const snaps = await db.tecSnapshots.where("userId").equals(LOCAL_USER_ID).reverse().sortBy("importedAt");
  const latest = snaps[0] || null;
  const previous = snaps[1] || null;
  
  const regressions: any[] = [];
  if (latest && previous) {
    for (const t of latest.topics) {
      const prevT = previous.topics.find(p => p.topicName === t.topicName && p.disciplineName === t.disciplineName);
      if (prevT && prevT.accuracy - t.accuracy >= (input.thresholdPp || 5)) {
        regressions.push({
          topicName: t.topicName,
          disciplineName: t.disciplineName,
          previousAccuracy: prevT.accuracy,
          currentAccuracy: t.accuracy,
          delta: t.accuracy - prevT.accuracy
        });
      }
    }
  }

  const weakTopics = latest ? latest.topics.filter(t => t.accuracy < 65 && t.questionsResolved >= 5) : [];

  return {
    regressions,
    weakTopics,
    latestSnapshot: latest ? { importedAt: latest.importedAt, totalQuestions: latest.totalQuestions, overallAccuracy: latest.overallAccuracy } : null,
    previousSnapshot: previous ? { importedAt: previous.importedAt, totalQuestions: previous.totalQuestions, overallAccuracy: previous.overallAccuracy } : null,
    deltaAccuracy: latest && previous ? latest.overallAccuracy - previous.overallAccuracy : null,
    deltaQuestions: latest && previous ? latest.totalQuestions - previous.totalQuestions : null,
  };
}

export async function localMentorChat(input: {
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  apiKey: string;
  provider: AiProvider;
}): Promise<{ reply: string }> {
  const [stats, snaps, errors, disciplines, revisions, notes, flashcards, { topics }] = await Promise.all([
    localDashboardGetStats(),
    db.tecSnapshots.where("userId").equals(LOCAL_USER_ID).reverse().sortBy("importedAt"),
    localGetQuestionErrors({ limit: 10 }),
    localDisciplineList(),
    localRevisionList(),
    localNoteList(),
    localFlashcardList(),
    localTopicList()
  ]);

  const latestSnap = snaps[0];
  const weak = latestSnap ? latestSnap.topics.filter(t => t.accuracy < 65 && t.questionsResolved >= 5) : [];
  
  const totalResolved = (stats.disciplineStats as any[] ?? []).reduce((sum, d) => sum + (d.performance?.questionsResolved ?? 0), 0);
  const weakStr = weak.length > 0 ? weak.slice(0, 5).map(t => `${t.disciplineName} > ${t.topicName} (${t.accuracy}%)`).join(", ") : "Nenhum tópico crítico.";
  const errorsStr = errors.items.slice(0, 10).map(e => {
    const d = disciplines.find(d => d.id === e.disciplineId);
    return `[${d?.name ?? "Desconhecida"}] Questão: "${e.statement.slice(0, 100)}..." | Erro: ${e.errorOrigin ?? "desconhecido"}`;
  }).join("\n");
  
  const revisionsStr = revisions.filter(r => !r.completed && !r.ignored).slice(0, 10).map(r => {
    const t = topics.find(t => t.id === r.topicId);
    return `Data: ${r.scheduledDate} | Tema: ${t?.name ?? "Desconhecido"}`;
  }).join("\n");

  const notesStr = notes.slice(0, 5).map(n => `- ${n.title}: ${n.content.replace(/<[^>]+>/g, "").substring(0, 80)}...`).join("\n");
  const topicsStr = topics.slice(0, 10).map(t => `ID: ${t.id} | ${t.name}`).join("\n");

  const transcript = input.history.map(m => `${m.role === "user" ? "Aluno" : "Mentor"}: ${m.content}`).join("\n\n");

  const prompt = `Você é o Mentor SOE — professor particular de concursos. Responda ao aluno baseado no contexto:
DADOS:
- Resolvidas: ${totalResolved}
- Pontos fracos: ${weakStr}
- Últimos erros:
${errorsStr}
- Calendário:
${revisionsStr || "Vazio"}
- Anotações:
${notesStr || "Vazio"}
- Editais:
${topicsStr || "Vazio"}

Poderes:
[FLASHCARD]{"front": "...", "back": "...", "disciplineId": 123}[/FLASHCARD]
[RESCHEDULE]{"topicId": 123, "newDate": "YYYY-MM-DD"}[/RESCHEDULE]

Histórico:
${transcript}

Aluno: ${input.message}
Mentor:`;

  const reply = await callAiProvider(input.provider, input.apiKey, prompt, 1500);
  let finalReply = reply.trim();

  // Process Flashcards
  const flashRegex = /\[FLASHCARD\]([\s\S]*?)\[\/FLASHCARD\]/g;
  let match;
  let createdCount = 0;
  while ((match = flashRegex.exec(finalReply)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      if (data.front && data.back && data.disciplineId) {
        await localFlashcardCreate({
          disciplineId: Number(data.disciplineId),
          topicId: data.topicId ? Number(data.topicId) : undefined,
          front: data.front,
          back: data.back
        });
        createdCount++;
      }
    } catch {}
  }

  // Process Reschedules
  const reschedRegex = /\[RESCHEDULE\]([\s\S]*?)\[\/RESCHEDULE\]/g;
  while ((match = reschedRegex.exec(finalReply)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      if (data.topicId && data.newDate) {
        const rev = revisions.find(r => r.topicId === Number(data.topicId) && !r.completed && !r.ignored);
        if (rev) await db.revisions.update(rev.id, { scheduledDate: data.newDate });
      }
    } catch {}
  }

  finalReply = finalReply.replace(/\[FLASHCARD\][\s\S]*?\[\/FLASHCARD\]/g, "").replace(/\[RESCHEDULE\][\s\S]*?\[\/RESCHEDULE\]/g, "").trim();
  if (createdCount > 0) finalReply += `\n\n✨ *(Criei ${createdCount} flashcard${createdCount > 1 ? 's' : ''} para você!)*`;

  return { reply: finalReply };
}

export async function localGetWeakProfile(): Promise<{ weakTopics: any[]; weakDisciplines: any[] }> {
  const [disciplines, topics, revisions, errors] = await Promise.all([
    localDisciplineList(),
    db.topics.where("userId").equals(LOCAL_USER_ID).toArray(),
    db.revisions.where("userId").equals(LOCAL_USER_ID).toArray(),
    db.questionErrors.where("userId").equals(LOCAL_USER_ID).toArray(),
  ]);

  const completedRevisions = revisions.filter(r => r.completed);

  const weakTopics = topics.map(t => {
    const perf = t.performance;
    const topicRevs = completedRevisions.filter(r => r.topicId === t.id);
    const accuracy = perf && perf.questionsResolved > 0 ? perf.correctCount / perf.questionsResolved : null;
    const topicErrors = errors.filter(e => e.topicId === t.id);
    
    let score = 0;
    if (accuracy !== null) score += (1 - accuracy) * 50;
    score += Math.min(topicErrors.length * 5, 50);

    const disc = disciplines.find(d => d.id === t.disciplineId);
    return {
      topicId: t.id,
      topicName: t.name,
      disciplineId: t.disciplineId,
      disciplineName: disc?.name ?? "—",
      disciplineColor: disc?.color ?? "#888",
      accuracy: accuracy !== null ? Math.round(accuracy * 100) : null,
      questionsResolved: perf?.questionsResolved ?? 0,
      errorCount: topicErrors.length,
      vulnerabilityScore: Math.round(score),
    };
  }).filter(t => t.questionsResolved > 0 || t.errorCount > 0)
    .sort((a, b) => b.vulnerabilityScore - a.vulnerabilityScore);

  const weakDisciplines = disciplines.map(d => {
    const dTopics = weakTopics.filter(t => t.disciplineId === d.id);
    const avgScore = dTopics.length > 0 ? dTopics.reduce((s, t) => s + t.vulnerabilityScore, 0) / dTopics.length : 0;
    return {
      disciplineId: d.id,
      name: d.name,
      color: d.color,
      avgVulnerabilityScore: Math.round(avgScore),
      topicCount: dTopics.length,
      topWorstTopics: dTopics.slice(0, 3),
    };
  }).sort((a, b) => b.avgVulnerabilityScore - a.avgVulnerabilityScore);

  return { weakTopics: weakTopics.slice(0, 20), weakDisciplines };
}

export async function localGetDailyBriefing(): Promise<{ briefing: string }> {
  const today = formatDateForDb(new Date());
  const [revisions, topics, stats, settings] = await Promise.all([
    db.revisions.where("scheduledDate").equals(today).toArray(),
    localTopicList(),
    localDashboardGetStats(),
    localAuthMe().then(u => u?.settings as any)
  ]);

  const pending = revisions.filter(r => !r.completed && !r.ignored);
  if (pending.length === 0) return { briefing: "Nenhuma revisão agendada para hoje. Aproveite para avançar na teoria ou resolver questões!" };

  const prompt = `Você é o Mentor SOE. Gere um briefing curto (máximo 4 parágrafos) e motivador para o aluno baseado nas revisões de hoje (${today}):
- Total de revisões: ${pending.length}
- Tópicos: ${pending.map(p => topics.topics.find(t => t.id === p.topicId)?.name).slice(0, 5).join(", ")}
- Performance geral: ${stats.overallAccuracy}%
Fale sobre a importância de manter a consistência e dê uma dica prática de estudo.`;

  const provider = settings?.aiProvider || "gemini";
  const apiKey = settings?.aiApiKey || "";
  
  if (!apiKey) return { briefing: "Configure sua API Key no Perfil para receber briefings personalizados via IA!" };

  const reply = await callAiProvider(provider as any, apiKey, prompt, 800);
  return { briefing: reply.trim() };
}

export async function localDiagnoseError(input: {
  statement: string;
  alternatives: { letter: string; text: string }[];
  userAnswer: string;
  correctAnswer: string;
  errorOrigin?: string;
  disciplineName: string;
  topicName: string;
  apiKey: string;
  provider: AiProvider;
}): Promise<any> {
  const chosenText = input.alternatives.find(a => a.letter === input.userAnswer)?.text ?? "";
  const correctText = input.alternatives.find(a => a.letter === input.correctAnswer)?.text ?? "";

  const prompt = `Você é o Mentor SOE. O aluno acabou de errar uma questão. Dê um diagnóstico CIRÚRGICO.
Disciplina: ${input.disciplineName} | Tópico: ${input.topicName}
Questão: ${input.statement}
${input.alternatives.map(a => `${a.letter}) ${a.text}`).join("\n")}
Aluno marcou: ${input.userAnswer}) ${chosenText}
Gabarito: ${input.correctAnswer}) ${correctText}
Tipo de erro: ${input.errorOrigin ?? "não classificado"}

Responda em JSON exato (sem markdown):
{
  "diagnosis": "2-3 linhas explicativas",
  "concept": "Conceito-chave em 1 linha",
  "rule": "Regra ou macete",
  "fixationQuestions": [
    {
      "statement": "pergunta 1",
      "alternatives": [{"letter": "A", "text": "..."}, {"letter": "B", "text": "..."}, {"letter": "C", "text": "..."}, {"letter": "D", "text": "..."}],
      "correctAnswer": "letra"
    }
  ]
}`;

  const reply = await callAiProvider(input.provider, input.apiKey, prompt, 1200);
  try {
    return extractJSON(reply);
  } catch {
    return { diagnosis: reply, concept: "", rule: "", fixationQuestions: [] };
  }
}

export async function localProcessText(input: { text: string; action: string; apiKey: string; provider: AiProvider }): Promise<{ result: string }> {
  const prompts: Record<string, string> = {
    summarize: "Resuma o seguinte texto de estudo de forma concisa e estruturada:",
    improve: "Melhore a escrita e clareza técnica deste resumo de estudos, mantendo o tom profissional:",
    explain: "Explique de forma didática e simples o seguinte conceito:",
    autocomplete: "Continue o raciocínio deste texto de forma lógica e informativa:",
  };
  const prompt = `${prompts[input.action] || "Analise o texto:"}\n\n${input.text}`;
  const result = await callAiProvider(input.provider, input.apiKey, prompt);
  return { result };
}

export async function localGenerateFlashcardsFromText(input: {
  text: string;
  disciplineId: number;
  topicId?: number;
  noteId?: number;
  apiKey: string;
  provider: AiProvider;
}): Promise<{ success: boolean; count: number }> {
  const prompt = `Gere flashcards (frente e verso) para o Anki baseado no texto de estudos abaixo.
Foque em conceitos-chave, definições e mnemônicos.
Responda APENAS em JSON no formato: [{"front": "...", "back": "..."}]

TEXTO:
${input.text}`;

  const reply = await callAiProvider(input.provider, input.apiKey, prompt, 1500);
  const cards = extractJSON(reply);
  if (!Array.isArray(cards)) throw new Error("IA não gerou uma lista de cards.");

  for (const c of cards) {
    await localFlashcardCreate({
      disciplineId: input.disciplineId,
      topicId: input.topicId,
      noteId: input.noteId,
      front: c.front,
      back: c.back,
    });
  }
  return { success: true, count: cards.length };
}

export async function localGetConceptConfusions(): Promise<ConceptConfusion[]> {
  return db.conceptConfusions.where("userId").equals(LOCAL_USER_ID).reverse().sortBy("lastDetectedAt");
}

export async function localSaveConceptConfusion(input: Partial<ConceptConfusion>): Promise<{ success: boolean }> {
  const existing = await db.conceptConfusions
    .where({ userId: LOCAL_USER_ID, conceptA: input.conceptA, conceptB: input.conceptB })
    .first();

  if (existing) {
    await db.conceptConfusions.update(existing.id, {
      count: (existing.count || 0) + 1,
      lastDetectedAt: now(),
      explanation: input.explanation || existing.explanation,
    });
  } else {
    const c = await getCounters();
    const id = c.conceptConfusions + 1;
    await db.conceptConfusions.add({
      id,
      userId: LOCAL_USER_ID,
      disciplineId: input.disciplineId,
      discipline: input.discipline,
      conceptA: input.conceptA!,
      conceptB: input.conceptB!,
      explanation: input.explanation || "",
      count: 1,
      lastDetectedAt: now(),
    });
    await db.counters.put({ key: "conceptConfusions", value: id });
  }
  return { success: true };
}
