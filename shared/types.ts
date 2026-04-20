/**
 * Unified type exports — SOE v1.0.1+
 *
 * O sistema usa jsonStorage como única fonte de verdade (JSON em disco).
 * O schema Drizzle/MySQL é mantido apenas como referência histórica e NÃO
 * deve ser importado no código de produção — ele define tipos com Date objects
 * que são incompatíveis com o formato string ISO que o jsonStorage usa.
 *
 * Sempre importe tipos de runtime a partir deste arquivo ou diretamente de
 * "../../server/jsonStorage".
 */

// Re-exporta todos os tipos do storage real (fonte de verdade)
export type {
  User,
  Discipline,
  Topic,
  Revision,
  MockExam,
  StudyNote,
  Flashcard,
  QuestionError,
  TecTopicSnapshot,
  TecSnapshot,
  CadernoTec,
  UserSettings,
} from "../server/jsonStorage";

// Erros compartilhados
export * from "./_core/errors";
