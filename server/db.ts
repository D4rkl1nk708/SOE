// JSON Storage adapter — sem MySQL, sem conversão de tipos.
// Todos os campos de data são strings ISO (ex: "2025-01-15T10:30:00.000Z").
import * as storage from "./jsonStorage";

export async function upsertUser(user: {
  openId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  role?: "user" | "admin";
  lastSignedIn?: Date | string;
}): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  await storage.upsertUser({
    openId: user.openId,
    name: user.name,
    email: user.email,
    loginMethod: user.loginMethod,
    role: user.role,
  });
}

// Retorna o User diretamente do jsonStorage (createdAt etc. já são strings)
export async function getUserByOpenId(openId: string) {
  return storage.getUserByOpenId(openId);
}

// Re-exporta todas as funções de storage para compatibilidade
export const getDisciplinesByUser = storage.getDisciplinesByUser;
export const getDisciplineById = storage.getDisciplineById;
export const createDiscipline = storage.createDiscipline;
export const updateDiscipline = storage.updateDiscipline;
export const deleteDiscipline = storage.deleteDiscipline;
export const getTopicsByUser = storage.getTopicsByUser;
export const getTopicById = storage.getTopicById;
export const createTopic = storage.createTopic;
export const updateTopic = storage.updateTopic;
export const deleteTopic = storage.deleteTopic;
export const getRevisionsByUser = storage.getRevisionsByUser;
export const createRevisions = storage.createRevisions;
export const markRevisionCompleted = storage.markRevisionCompleted;
export const getCalendarData = storage.getCalendarData;
export const getDashboardStats = storage.getDashboardStats;
export const saveQuestionError = storage.saveQuestionError;
export const getQuestionErrors = storage.getQuestionErrorsByUser;
export const deleteQuestionsByContest = storage.deleteQuestionsByContest;
export const checkExamIntegrated = storage.checkExamIntegrated;
