/**
 * Unified Canonical Type Definitions — SOE
 *
 * `shared/types.ts` é a fonte de verdade para os modelos e entidades
 * compartilhados entre cliente e servidor.
 */

export interface Discipline {
  id: number;
  userId: number;
  name: string;
  color: string;
  weight: number;
  order: number;
  performance?: {
    questionsResolved: number;
    accuracy: number;
    correctCount: number;
    errorCount: number;
    lastImportedAt?: string;
    [key: string]: any;
  };
  studyTimeSeconds: number; // Total study time in seconds
  createdAt: string;
  updatedAt: string;
}

export interface Topic {
  id: number;
  userId: number;
  disciplineId: number;
  name: string;
  order: number;
  studyDate: string;
  notes: string | null;
  performance?: {
    questionsResolved: number;
    accuracy: number;
    correctCount: number;
    errorCount: number;
    // R01 - Matriz de Origem do Erro
    errorByAttention?: number;
    errorByForgetting?: number;
    errorByTheory?: number;
    errorByTrap?: number;
    // R04 - Inferência por Tempo de Resposta (agregado)
    fastErrors?: number;
    slowErrors?: number;
    // History snapshots for R07/R09
    history?: Array<{
      date: string;
      accuracy: number;
      questionsResolved: number;
    }>;
    // TEC — dados enriquecidos de incidência e banca
    incidencia?: number; // 0.0–1.0 — percentual de incidência do assunto na banca/concurso
    totalQuestoesBanca?: number; // total de questões disponíveis no TEC para este assunto
    bancaDominante?: string; // banca com mais questões neste assunto (ex: "CESPE")
    bancaStats?: Record<string, { correct: number; wrong: number }>; // desempenho por banca
    dificuldade?: number; // 0.0–1.0 — dificuldade média do assunto no TEC
    lastImportedAt?: string; // ISO datetime da última importação TEC
    lastStudied?: string;
    [key: string]: any;
  };
  studyTimeSeconds: number;
  // R26 - Anotações de Sobrevivência (per-topic)
  topicNotes?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Revision {
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
  link?: string; // Link opcional para caderno de questões (TEC, etc.)
  // F04 - Índice de Dificuldade de Evocação
  recallRating?: 1 | 2 | 3 | 4 | 5; // 1=não lembrei nada, 5=lembrei fácil
  // F01 - Free Recall Mode
  freeRecallText?: string; // O que o usuário escreveu no free recall
}

export interface MockExam {
  id: number;
  userId: number;
  name: string;
  date: string;
  correct: number;
  wrong: number;
  blank: number;
  totalQuestions: number;
  score: number; // For CESPE: correct - wrong
  createdAt: string;
}

export interface StudyNote {
  id: number;
  userId: number;
  disciplineId: number;
  topicId?: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface EditalRow {
  id: string;
  discipline: string;
  topic: string;
  completed: boolean;
  notes?: string;
  // enriched fields from xlsx import
  incidencia?: number; // 0-1 percentage weight
  quantidade?: number; // absolute question count
  acerto?: number; // 0-1 hit rate
  revisar?: boolean;
  avancar?: boolean;
  discursiva?: boolean;
  isHeader?: boolean; // first row of a discipline group
}

export interface EditalVersion {
  id: string;
  name: string;
  savedAt: string;
  rows: EditalRow[];
}

export type ConfidenceLevel = "chute" | "acho" | "certeza";

export interface QuestionAttempt {
  id: string;
  topicId: number;
  disciplineId?: number;
  questionId?: string;
  banca?: string;
  answered: boolean;
  correct: boolean;
  confidence: ConfidenceLevel | null;
  /** before_result = marcada antes de o SOE registrar o gabarito */
  confidencePhase: "before_result" | "after_result" | null;
  seconds?: number;
  source?: "manual" | "tec" | "simulado";
  createdAt: string;
}

export interface UserSettings {
  examDate?: string;
  examName?: string;
  exams?: { id: string; name: string; date: string }[];
  editalCycle?: {
    id: string;
    title: string;
    durationMinutes: number;
    done: boolean;
  }[];
  editalRows?: EditalRow[];
  /** Versionamento do edital para comparar retificações */
  editalVersions?: EditalVersion[];
  cycleConfig?: {
    type: "numbered" | "weekdays";
    count: number; // number of cycles (for numbered) or days of week selected
    selectedDays?: number[]; // 0=Sun,1=Mon... for weekdays type
    assignments?: { cycleKey: string; disciplineId: number }[]; // which discipline goes in which cycle
  };
  theme: "light" | "dark";
  studyStreak: {
    current: number;
    best: number;
    lastStudyDate: string | null;
  };
  /** Dias entre testes (padrão 3) */
  testIntervalDays?: number;
  /** Dias entre revisões - fase 1 (padrão 25). 0 = sem revisões */
  revisionIntervalDays?: number;
  /** Dias entre revisões - fase 2 (padrão 50) */
  revisionSecondPhaseDays?: number;
  /** Meta diária de estudo em minutos */
  dailyGoalMinutes?: number;
  /** Anotações globais do usuário - R26 */
  topicNotes?: Array<{
    id: string;
    topicPattern: string;
    text: string;
    triggeredCount: number;
  }>;
  /** Afinidade de banca - R18 */
  bancaStats?: Record<string, { correct: number; wrong: number }>;
  /** Medidor de fadiga - R28: questões por sessão registradas */
  fatigueLog?: Array<{
    date: string;
    questionsCount: number;
    hourOfDay: number;
    accuracy: number;
  }>;
  /** Metas de dopamina - R29 */
  gamificationPoints?: number;
  /** Dashboard widget visibility/order config */
  dashboardConfig?: {
    hiddenWidgets?: string[];
    extraWidgets?: string[];
  };
  // ===== NEW FEATURES v10 =====
  /** F09 - Registro de estado emocional antes de estudar */
  emotionLog?: Array<{
    date: string; // ISO datetime
    mood: 1 | 2 | 3 | 4 | 5; // 1=muito mal, 5=ótimo
    hourOfDay: number;
  }>;
  /** F10 - Horário de pico registrado (horas com melhor desempenho) */
  peakHours?: Array<{ hour: number; avgAccuracy: number; sessions: number }>;
  /** Configurações de sincronização inteligente do TEC */
  tecSmartDisciplineMatching?: boolean;
  tecAskBeforeCreatingDiscipline?: boolean;
  tecDisciplineAliases?: Record<string, number>;
  pendingTecDisciplines?: Array<{
    id: string;
    disciplineName: string;
    topicName: string;
    timestamp: string;
    suggestedDisciplineId?: number;
    suggestedDisciplineName?: string;
  }>;
  /** F15 - Registro de horário de encerramento de estudo (sono) */
  sleepLog?: Array<{
    date: string;
    endStudyHour: number;
    alertIssued: boolean;
  }>;
  /** Sync History - F20 */
  syncHistory?: Array<{
    type: "upload" | "download";
    date: string;
    fileName?: string;
    status: "success" | "failure";
    message?: string;
  }>;
  /** F07 - Timer intercalação: tempo máximo contínuo na mesma disciplina (min) */
  attentionAlertMinutes?: number; // padrão 45
  /** F08 - Feedback postergado: mostrar gabarito só no final do bloco */
  delayedFeedback?: boolean;
  /** F16 - Modo pré-prova ativado automaticamente X dias antes */
  preExamDays?: number; // padrão 7
  /** F10 - Score de horário por sessão de estudo */
  studySessionLog?: Array<{
    date: string;
    hourStart: number;
    durationMin: number;
    accuracy: number;
    disciplineId?: number;
  }>;
  /** Token secreto usado pelo userscript Tampermonkey para autenticar pushes em tempo real */
  pushToken?: string;
  /** Chaves de API de Inteligência Artificial cadastradas pelo usuário (para o Mentor SOE) */
  aiApiKey?: string;
  aiProvider?: "gemini" | "openai" | "claude";
  /** Sincronização em Nuvem Invisível: Diretório de auto-backup (para espelhar no Google Drive/Dropbox localmente) */
  autoBackupDir?: string;
  autoBackupEnabled?: boolean;
  /** Foto de perfil em Base64 ou URL */
  profileImage?: string;
  /** Preferência do Electron: Minimizar para a bandeja ao fechar a janela */
  minimizeToTray?: boolean;
  /** F30 - Memória estratégica do Mentor (observações de longo prazo sobre o aluno) */
  mentorObservations?: string[];
  /** Nomes normalizados de disciplinas excluídas: impede que importação/sync
   *  as recriem. Recriar manualmente remove o bloqueio. */
  deletedDisciplineNames?: string[];
  /** Disciplinas da rotina base diária (lente independente do edital) */
  baseDisciplineIds?: number[];
  /** Tentativas com confiança declarada (máx. ~3000) */
  questionAttempts?: QuestionAttempt[];
  /** Agendador de revisão: clássico 25/50 por padrão */
  scheduler?: "classic" | "fsrs";
  /** Modo de captura do TEC: manual é o padrão seguro */
  tecCaptureMode?: "manual" | "assisted" | "import";
  /** F31 - Matriz de Confusão Conceitual (Tópicos que o aluno confunde entre si) */
  conceptConfusions?: Array<{
    id: string;
    conceptA: string;
    conceptB: string;
    explanation: string;
    detectedAt: string;
    occurrences: number;
  }>;
}

export interface User {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: "user" | "admin";
  settings: UserSettings;
  createdAt: string;
  updatedAt: string;
  lastSignedIn: string;
}

export interface Flashcard {
  id: number;
  userId: number;
  disciplineId: number;
  topicId?: number;
  noteId?: number;
  front: string;
  back: string;
  // spaced repetition state
  interval: number; // days until next review
  easeFactor: number; // SM-2 ease factor (default 2.5)
  repetitions: number; // times reviewed successfully
  nextReviewDate: string; // YYYY-MM-DD
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionError {
  id: number;
  userId: number;
  topicId: number;
  disciplineId: number;
  // Parsed from TEC paste
  questionId?: string; // e.g. "#3872741"
  banca?: string; // e.g. "CEBRASPE (CESPE)"
  year?: number;
  contest?: string; // e.g. "Agente Fazendário Estadual (SEFAZ PR)/Administrador"
  statement: string; // full question statement
  alternatives: { letter: string; text: string }[];
  userAnswer?: string; // e.g. "B"
  correctAnswer?: string; // e.g. "C"
  // Classification
  errorOrigin?: "attention" | "forgetting" | "theory" | "trap";
  // AI analysis saved per question
  aiAnalysis?: string;
  aiAnalyzedAt?: string;
  // AI revision tip
  aiRevisionTip?: string;
  aiRevisionTipAt?: string;
  // AI similar questions
  aiSimilarQuestions?: string;
  aiSimilarQuestionsAt?: string;
  // AI flashcard generated
  aiFlashcardGenerated?: boolean;
  resolution?: string; // NOVO: comentário da resolução importado do TEC
  supportText?: string; // NOVO: texto de apoio da questão
  source?: "manual" | "tec" | "mined"; // NOVO: origem da questão
  // IDEA 1: Mapeamento Psicológico de Distratores
  distractorPattern?:
    | "absolutist"
    | "partial"
    | "similar"
    | "negative"
    | "timing"
    | "calculation";
  createdAt: string;
}

export interface EssayCorrection {
  score: number;
  feedback: string; // Markdown formatted feedback
  errors: Array<{
    type: string;
    description: string;
    suggestion?: string;
    line?: number;
  }>;
  gradeBreakdown: Record<string, number>; // e.g., { "Gramática": 2.0, "Coesão": 3.0 }
}

export interface Essay {
  id: number;
  userId: number;
  disciplineId: number;
  topicId?: number;
  title: string; // Tema da redação
  banca: string;
  originalImage?: string; // Base64 or URL
  transcription: string;
  correction?: EssayCorrection;
  status: "draft" | "pending" | "corrected";
  createdAt: string;
  updatedAt: string;
}

// ============ TEC SNAPSHOT — histórico de performance por importação ============
export interface TecTopicSnapshot {
  topicName: string;
  disciplineName: string;
  questionsResolved: number;
  correctCount: number;
  errorCount: number;
  accuracy: number;
}

export interface TecSnapshot {
  id: number;
  userId: number;
  importedAt: string; // ISO datetime
  totalQuestions: number;
  totalCorrect: number;
  totalErrors: number;
  overallAccuracy: number;
  topics: TecTopicSnapshot[];
}

export interface CadernoTec {
  cadernoId: string;
  cadernoUrl: string;
  disciplina: string;
  lastSync: string; // ISO datetime
  topicsCount: number;
}

export interface Database {
  users: User[];
  disciplines: Discipline[];
  topics: Topic[];
  revisions: Revision[];
  mockExams: MockExam[];
  notes: StudyNote[];
  flashcards: Flashcard[];
  questionErrors: QuestionError[];
  essays: Essay[];
  tecSnapshots: TecSnapshot[];
  cadernosTec: Record<string | number, any>;
  mentorSessions?: any[];
  subjectiveAnswers?: any[];
  conceptConfusions?: any[];
  extraCollections?: any[];
  counters: {
    users: number;
    disciplines: number;
    topics: number;
    revisions: number;
    mockExams: number;
    notes: number;
    flashcards: number;
    questionErrors: number;
    essays: number;
    tecSnapshots: number;
    [key: string]: number;
  };
  _encodingFixed?: boolean;
  [key: string]: any;
}

// Erros compartilhados
export * from "./_core/errors";
