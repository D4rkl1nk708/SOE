// Supabase Storage adapter — Versão Final e Tipada.
import { supabase } from "./supabase";

export type Discipline = any;
export type Topic = any;
export type Revision = any;

export async function upsertUser(user: any): Promise<void> {
  const { error } = await supabase.from("users").upsert({
      open_id: user.openId, name: user.name, email: user.email,
      login_method: user.loginMethod, role: user.role,
      last_signed_in: user.lastSignedIn || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "open_id" });
  if (error) throw error;
}

export async function getUserByOpenId(openId: string) {
  const { data, error } = await supabase.from("users").select("*").eq("open_id", openId).single();
  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function setTopicPerformance(topicId: number, userId: number, data: any) {
  const { error } = await supabase.from("topics").update({ performance: data, updated_at: new Date().toISOString() }).eq("id", topicId).eq("user_id", userId);
  if (error) throw error;
}

export async function updateTopic(id: number, userId: number, data: any) {
  const { error } = await supabase.from("topics").update({ ...data, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

export async function deleteTopic(id: number, userId: number) {
  const { error } = await supabase.from("topics").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

export async function reorderTopics(userId: number, disciplineId: number, orderedIds: number[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    await supabase.from("topics").update({ order: i }).eq("id", orderedIds[i]).eq("user_id", userId);
  }
}

export async function reorderDisciplines(userId: number, orderedIds: number[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    await supabase.from("disciplines").update({ order: i }).eq("id", orderedIds[i]).eq("user_id", userId);
  }
}

export async function resetAllTopicStats(userId: number) {
  const { error } = await supabase.from("topics").update({ performance: {}, study_time_seconds: 0 }).eq("user_id", userId);
  if (error) throw error;
}

export async function addTopicStudyTime(topicId: number, userId: number, seconds: number) {
  const { data, error: getError } = await supabase.from("topics").select("study_time_seconds").eq("id", topicId).single();
  if (getError) throw getError;
  const { error } = await supabase.from("topics").update({ study_time_seconds: (data.study_time_seconds || 0) + seconds }).eq("id", topicId).eq("user_id", userId);
  if (error) throw error;
}

export async function getDisciplinesByUser(userId: number) {
  const { data, error } = await supabase.from("disciplines").select("*").eq("user_id", userId).order("order");
  if (error) throw error;
  return data;
}

export async function createDiscipline(data: any) {
  const { data: disc, error } = await supabase.from("disciplines").insert({ user_id: data.userId, name: data.name, color: data.color, weight: data.weight }).select().single();
  if (error) throw error;
  return disc;
}

export async function getTopicsByUser(userId: number) {
  const { data, error } = await supabase.from("topics").select("*").eq("user_id", userId).order("order");
  if (error) throw error;
  return data;
}

export async function createTopic(data: any) {
  const { data: topic, error } = await supabase.from("topics").insert({ user_id: data.userId, discipline_id: data.disciplineId, name: data.name, study_date: data.studyDate, notes: data.notes }).select().single();
  if (error) throw error;
  return topic;
}

export async function getRevisionsByUser(userId: number, filters?: any) {
  let query = supabase.from("revisions").select("*").eq("user_id", userId);
  if (filters?.completed !== undefined) query = query.eq("completed", filters.completed);
  if (filters?.ignored !== undefined) query = query.eq("ignored", filters.ignored);
  const { data, error } = await query.order("scheduled_date", { ascending: true });
  if (error) throw error;
  return data;
}

export async function markRevisionCompleted(id: number, userId: number, completed: boolean) {
  const { error } = await supabase.from("revisions").update({ completed, completed_at: completed ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

export async function getUserSettings(userId: number) {
  const { data, error } = await supabase.from("users").select("settings").eq("id", userId).single();
  if (error) throw error;
  return data?.settings;
}

export async function updateUserSettings(userId: number, settings: any) {
  const current = await getUserSettings(userId);
  const { error } = await supabase.from("users").update({ settings: { ...current, ...settings }, updated_at: new Date().toISOString() }).eq("id", userId);
  if (error) throw error;
}

export async function createRevisions(revisions: any[]) {
  const { error } = await supabase.from("revisions").insert(revisions);
  if (error) throw error;
}

export async function deleteDiscipline(id: number, userId: number) {
  const { error } = await supabase.from("disciplines").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

export async function updateDiscipline(id: number, userId: number, data: any) {
  const { error } = await supabase.from("disciplines").update({ ...data, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

export async function getTecSnapshots(userId: number, limit: number = 10) {
  const { data, error } = await supabase.from("tec_snapshots").select("*").eq("user_id", userId).order("snapshot_date", { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

export async function saveQuestionError(data: any) {
  const { error } = await supabase.from("question_errors").insert({
    user_id: data.userId, topic_id: data.topicId, discipline_id: data.disciplineId, question_id: data.questionId,
    banca: data.banca, year: data.year, contest: data.contest, statement: data.statement,
    alternatives: data.alternatives, user_answer: data.userAnswer, correct_answer: data.correctAnswer, error_origin: data.errorOrigin
  });
  if (error) throw error;
}

export async function getQuestionErrorsByUser(userId: number, filters: any = {}) {
  const { data, error } = await supabase.from("question_errors").select("*").eq("user_id", userId);
  if (error) throw error;
  return { items: data || [], total: data?.length || 0, hasMore: false, nextOffset: 0 };
}

export async function getCalendarData(userId: number, startDate: string, endDate: string) {
  const { data: revisions, error: revError } = await supabase.from("revisions").select("*").eq("user_id", userId).gte("scheduled_date", startDate).lte("scheduled_date", endDate);
  if (revError) throw revError;
  const topicIds = [...new Set(revisions.map((r) => r.topic_id))];
  const { data: topics, error: topError } = await supabase.from("topics").select("*").in("id", topicIds);
  if (topError) throw topError;
  const { data: disciplines, error: discError } = await supabase.from("disciplines").select("*").eq("user_id", userId);
  if (discError) throw discError;
  return { revisions: revisions.map((r) => ({ ...r, scheduledDate: r.scheduled_date, topicId: r.topic_id })), topics, disciplines };
}

export async function getCadernosTec(userId: number) {
  const settings = await getUserSettings(userId);
  return settings?.cadernosTec || [];
}

export async function saveRevisionRecallRating(id: number, userId: number, rating: number, freeRecallText?: string) {
  const { error } = await supabase.from("revisions").update({ recall_rating: rating, free_recall_text: freeRecallText, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

export async function markRevisionIgnored(id: number, userId: number, ignored: boolean) {
  const { error } = await supabase.from("revisions").update({ ignored, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

export async function rescheduleRevision(id: number, userId: number, newDate: string) {
  const { error } = await supabase.from("revisions").update({ scheduled_date: newDate, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

export async function updateRevisionLink(id: number, userId: number, link: string) {
  const { error } = await supabase.from("revisions").update({ link, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

export async function checkExamIntegrated(userId: number) { return false; }

export async function getUserByPushToken(token: string) {
  const { data, error } = await supabase.from("users").select("*").contains("settings", { pushToken: token }).single();
  if (error) return null;
  return data;
}

export async function saveTecSnapshot(userId: number, topics: any[]) {
  const { error } = await supabase.from("tec_snapshots").insert({ user_id: userId, topics });
  if (error) throw error;
}

export async function saveCadernoTec(userId: number, data: any) {
  const current = await getUserSettings(userId);
  const cadernos = current?.cadernosTec || [];
  const updated = [...cadernos.filter((c: any) => c.cadernoId !== data.cadernoId), data];
  await updateUserSettings(userId, { cadernosTec: updated });
}

export async function deleteCadernoTec(userId: number, cadernoId: string) {
  const current = await getUserSettings(userId);
  const cadernos = current?.cadernosTec || [];
  const updated = cadernos.filter((c: any) => c.cadernoId !== cadernoId);
  await updateUserSettings(userId, { cadernosTec: updated });
}

export async function updateFlashcard(id: number, userId: number, data: any) {
  const { error } = await supabase.from("flashcards").update({ ...data, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

export async function deleteFlashcard(id: number, userId: number) {
  const { error } = await supabase.from("flashcards").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

export async function reviewFlashcard(id: number, userId: number, quality: number) {
  const { data: fc, error: getError } = await supabase.from("flashcards").select("*").eq("id", id).single();
  if (getError) throw getError;
  let interval = fc.interval || 1, easeFactor = fc.ease_factor || 2.5, repetitions = fc.repetitions || 0;
  if (quality >= 3) { if (repetitions === 0) interval = 1; else if (repetitions === 1) interval = 6; else interval = Math.round(interval * easeFactor); repetitions++; } else { interval = 1; repetitions = 0; }
  easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  const nextReview = new Date(); nextReview.setDate(nextReview.getDate() + interval);
  await supabase.from("flashcards").update({ interval, ease_factor: easeFactor, repetitions, next_review_date: nextReview.toISOString().split("T")[0], updated_at: new Date().toISOString() }).eq("id", id);
}

export async function archiveFlashcard(id: number, userId: number, archived: boolean) {
  const { error } = await supabase.from("flashcards").update({ archived }).eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

export async function exportDatabase() { return { message: "Os dados estão no Supabase." }; }
export async function importDatabase(json: string) {}

export async function generatePushToken(userId: number) {
  const token = Math.random().toString(36).substring(2, 15);
  await updateUserSettings(userId, { pushToken: token });
  return token;
}

export async function upsertNote(data: any) {
  const { data: note, error } = await supabase.from('study_notes').upsert({ id: data.id, user_id: data.userId, topic_id: data.topicId, content: data.content, updated_at: new Date().toISOString() }).select().single();
  if (error) throw error;
  return note;
}

export async function deleteNote(id: number, userId: number) {
  const { error } = await supabase.from('study_notes').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

export async function getFlashcardsByUser(userId: number) {
  const { data, error } = await supabase.from('flashcards').select('*').eq('user_id', userId);
  if (error) throw error;
  return data;
}

export async function createFlashcard(data: any) {
  const { data: fc, error } = await supabase.from('flashcards').insert({ user_id: data.userId, topic_id: data.topicId, front: data.front, back: data.back, next_review_date: new Date().toISOString().split('T')[0] }).select().single();
  if (error) throw error;
  return fc;
}

export async function deleteQuestionError(id: number, userId: number) {
  const { error } = await supabase.from('question_errors').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

export async function getTodayStudyMinutes(userId: number) { return 0; }
export async function revokePushToken(userId: number) { await updateUserSettings(userId, { pushToken: null }); }
export async function getNotesByUser(userId: number) {
  const { data, error } = await supabase.from('study_notes').select('*').eq('user_id', userId);
  if (error) throw error;
  return data;
}

export async function getTopicById(id: number) {
  const { data, error } = await supabase.from('topics').select('*').eq('id', id).single();
  return data;
}

export async function deleteQuestionsByContest(contest: string, userId: number) {
  await supabase.from('question_errors').delete().eq('contest', contest).eq('user_id', userId);
}

export async function updateTopicNotes(id: number, userId: number, notes: string) {
  await updateTopic(id, userId, { notes });
}

export async function getMockExamsByUser(userId: number) {
  const { data, error } = await supabase.from('mock_exams').select('*').eq('user_id', userId);
  return data || [];
}

export async function createMockExam(userId: number, data: any) {
  const { data: exam, error } = await supabase.from('mock_exams').insert({ ...data, user_id: userId }).select().single();
  return exam;
}

export async function updateMockExam(id: number, userId: number, data: any) {
  await supabase.from('mock_exams').update(data).eq('id', id).eq('user_id', userId);
}

export async function deleteMockExam(id: number, userId: number) {
  await supabase.from('mock_exams').delete().eq('id', id).eq('user_id', userId);
}

export async function saveQuestionErrorAnalysis(id: number, userId: number, analysis: any) {
  await supabase.from('question_errors').update({ analysis }).eq('id', id).eq('user_id', userId);
}

export async function saveQuestionErrorRevisionTip(id: number, userId: number, tip: string) {
  await supabase.from('question_errors').update({ revision_tip: tip }).eq('id', id).eq('user_id', userId);
}

export async function saveQuestionErrorSimilarQuestions(id: number, userId: number, questions: any[]) {
  await supabase.from('question_errors').update({ similar_questions: questions }).eq('id', id).eq('user_id', userId);
}

export async function markQuestionErrorFlashcardGenerated(id: number, userId: number) {
  await supabase.from('question_errors').update({ flashcard_generated: true }).eq('id', id).eq('user_id', userId);
}

export async function getEssaysByUser(userId: number) {
  const { data, error } = await supabase.from('study_notes').select('*').eq('user_id', userId).eq('is_essay', true);
  return data || [];
}

export async function saveEssay(userId: number, data: any) {
  const { data: essay, error } = await supabase.from('study_notes').insert({ ...data, user_id: userId, is_essay: true }).select().single();
  return essay;
}

export async function updateEssay(id: number, userId: number, data: any) {
  await supabase.from('study_notes').update(data).eq('id', id).eq('user_id', userId);
}

export async function deleteEssay(id: number, userId: number) {
  await supabase.from('study_notes').delete().eq('id', id).eq('user_id', userId);
}

export async function getEssayById(id: number, userId: number) {
  const { data, error } = await supabase.from('study_notes').select('*').eq('id', id).eq('user_id', userId).single();
  return data;
}

export async function getLastRevisionDate(userId: number) {
  const { data, error } = await supabase.from('revisions').select('completed_at').eq('user_id', userId).eq('completed', true).order('completed_at', { ascending: false }).limit(1).single();
  return data?.completed_at;
}

export async function logEmotion(userId: number, emotion: string) {
  const current = await getUserSettings(userId);
  const logs = current?.emotionLogs || [];
  logs.push({ emotion, timestamp: new Date().toISOString() });
  await updateUserSettings(userId, { emotionLogs: logs });
}

export async function logStudySession(userId: number, hourStart: number, durationMin: number, accuracy: number, disciplineId?: number) {
  const current = await getUserSettings(userId);
  const logs = current?.studySessionLogs || [];
  logs.push({ hourStart, durationMin, accuracy, disciplineId, timestamp: new Date().toISOString() });
  await updateUserSettings(userId, { studySessionLogs: logs });
}

export async function logStudyEndTime(userId: number, endHour: number, alertIssued: boolean) {
  await updateUserSettings(userId, { lastStudyEndTime: { endHour, alertIssued } });
}
