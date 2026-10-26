/**
 * Smart Database Merge Engine for SOE
 * Unifies records from two devices (PC and Mobile) with:
 * - Entity deduplication and canonical matching (Disciplines, Topics, QuestionErrors, Revisions, etc.)
 * - Automatic resolution of question volume discrepancies (higher volume preserved)
 * - Error questions unified with fingerprint hashing
 * - Safe ID remapping and counter normalization
 */

export const normalizeString = (s: string | null | undefined): string => {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

export interface Database {
  users: any[];
  disciplines: any[];
  topics: any[];
  revisions: any[];
  mockExams?: any[];
  notes?: any[];
  flashcards?: any[];
  questionErrors?: any[];
  essays?: any[];
  tecSnapshots?: any[];
  cadernosTec?: Record<string, any>;
  subjectiveAnswers?: any[];
  conceptConfusions?: any[];
  extraCollections?: any[];
  counters: Record<string, number>;
  [key: string]: any;
}

export interface MergeReport {
  disciplinesCount: number;
  topicsCount: number;
  questionErrorsCount: number;
  revisionsCount: number;
  totalQuestionsResolved: number;
}

const nowIso = () => new Date().toISOString();

/**
 * Creates a unique fingerprint hash for a question error.
 */
export function getQuestionErrorKey(
  qe: any,
  canonicalDiscId: number,
  canonicalTopId: number,
): string {
  if (qe.questionId && String(qe.questionId).trim()) {
    return "qid:" + String(qe.questionId).trim().toLowerCase();
  }
  const cleanStmt = normalizeString(qe.statement || "").slice(0, 120);
  return `stmt:${canonicalDiscId}::${canonicalTopId}::${cleanStmt}`;
}

export function smartMergeDatabases(
  dbA: Database | null | undefined,
  dbB: Database | null | undefined,
  targetUserId?: number,
): Database {
  const safeA: Database =
    dbA && typeof dbA === "object"
      ? dbA
      : { users: [], disciplines: [], topics: [], revisions: [], counters: {} };
  const safeB: Database =
    dbB && typeof dbB === "object"
      ? dbB
      : { users: [], disciplines: [], topics: [], revisions: [], counters: {} };

  // 1. Determine active user ID & settings
  const userA =
    Array.isArray(safeA.users) && safeA.users.length > 0
      ? safeA.users[0]
      : null;
  const userB =
    Array.isArray(safeB.users) && safeB.users.length > 0
      ? safeB.users[0]
      : null;
  const effectiveUserId = targetUserId || userA?.id || userB?.id || 1;

  const settingsA = (userA?.settings as Record<string, any>) || {};
  const settingsB = (userB?.settings as Record<string, any>) || {};

  // Merge exams in settings
  const examsA = Array.isArray(settingsA.exams) ? settingsA.exams : [];
  const examsB = Array.isArray(settingsB.exams) ? settingsB.exams : [];
  const examMap = new Map<string, any>();
  for (const ex of [...examsA, ...examsB]) {
    const k = ex.id || normalizeString(ex.name);
    if (k && !examMap.has(k)) examMap.set(k, ex);
  }

  // Merge streak
  const streakA = settingsA.studyStreak || {
    current: 0,
    best: 0,
    lastStudyDate: null,
  };
  const streakB = settingsB.studyStreak || {
    current: 0,
    best: 0,
    lastStudyDate: null,
  };
  const mergedStreak = {
    current: Math.max(streakA.current || 0, streakB.current || 0),
    best: Math.max(streakA.best || 0, streakB.best || 0),
    lastStudyDate: streakA.lastStudyDate || streakB.lastStudyDate || null,
  };

  const attemptMap = new Map<string, any>();
  for (const attempt of [
    ...(Array.isArray(settingsA.questionAttempts)
      ? settingsA.questionAttempts
      : []),
    ...(Array.isArray(settingsB.questionAttempts)
      ? settingsB.questionAttempts
      : []),
  ]) {
    if (!attempt) continue;
    const key =
      attempt.id ||
      `${attempt.questionId || ""}::${attempt.topicId || ""}::${attempt.createdAt || ""}`;
    if (!attemptMap.has(key)) attemptMap.set(key, attempt);
  }

  const mergedSettings = {
    // A é o banco atual (dispositivo local); B é o recebido. O local vence
    // para não trocar tema, chave de IA, diretório de backup etc. no sync.
    ...settingsB,
    ...settingsA,
    questionAttempts: Array.from(attemptMap.values()).slice(-3000),
    deletedDisciplineNames: Array.from(
      new Set([
        ...(Array.isArray(settingsA.deletedDisciplineNames)
          ? settingsA.deletedDisciplineNames
          : []),
        ...(Array.isArray(settingsB.deletedDisciplineNames)
          ? settingsB.deletedDisciplineNames
          : []),
      ]),
    ),
    exams: Array.from(examMap.values()),
    studyStreak: mergedStreak,
    editalCycle:
      Array.isArray(settingsA.editalCycle) && settingsA.editalCycle.length > 0
        ? settingsA.editalCycle
        : settingsB.editalCycle || [],
    editalRows:
      Array.isArray(settingsA.editalRows) && settingsA.editalRows.length > 0
        ? settingsA.editalRows
        : settingsB.editalRows || [],
  };

  const primaryUser = {
    id: effectiveUserId,
    openId: userA?.openId || userB?.openId || "local-user",
    name: userA?.name || userB?.name || "Usuário",
    email: userA?.email || userB?.email || "local@estudos.local",
    loginMethod: userA?.loginMethod || userB?.loginMethod || "local",
    role: userA?.role || userB?.role || "admin",
    settings: mergedSettings,
    createdAt: userA?.createdAt || userB?.createdAt || nowIso(),
    updatedAt: nowIso(),
    lastSignedIn: nowIso(),
  };

  // 2. Canonical Disciplines (Deduplicated by normalized name)
  const blockedDisciplineNames = new Set(
    ((mergedSettings as any).deletedDisciplineNames || []).map((name: string) =>
      normalizeString(name),
    ),
  );
  const mapDiscIdA = new Map<number, number>();
  const mapDiscIdB = new Map<number, number>();
  const canonicalDisciplines = new Map<string, any>();
  let nextDiscId = 1;

  const processDisciplines = (list: any[], mapTarget: Map<number, number>) => {
    if (!Array.isArray(list)) return;
    for (const d of list) {
      if (!d || !d.name) continue;
      const key = normalizeString(d.name);
      if (!key) continue;
      if (blockedDisciplineNames.has(key)) continue;

      if (!canonicalDisciplines.has(key)) {
        const canonical = {
          id: nextDiscId++,
          userId: effectiveUserId,
          name: d.name.trim(),
          color: d.color || "var(--primary)",
          weight: typeof d.weight === "number" ? d.weight : 1,
          order:
            typeof d.order === "number"
              ? d.order
              : canonicalDisciplines.size + 1,
          studyTimeSeconds: Number(d.studyTimeSeconds) || 0,
          createdAt: d.createdAt || nowIso(),
          updatedAt: d.updatedAt || nowIso(),
        };
        canonicalDisciplines.set(key, canonical);
        mapTarget.set(d.id, canonical.id);
      } else {
        const existing = canonicalDisciplines.get(key)!;
        existing.studyTimeSeconds = Math.max(
          existing.studyTimeSeconds || 0,
          Number(d.studyTimeSeconds) || 0,
        );
        if (d.color && existing.color === "var(--primary)")
          existing.color = d.color;
        if (typeof d.weight === "number" && !existing.weight)
          existing.weight = d.weight;
        if (d.updatedAt && String(d.updatedAt) > String(existing.updatedAt)) {
          existing.updatedAt = d.updatedAt;
          existing.name = d.name.trim();
        }
        mapTarget.set(d.id, existing.id);
      }
    }
  };

  processDisciplines(safeA.disciplines || [], mapDiscIdA);
  processDisciplines(safeB.disciplines || [], mapDiscIdB);

  // 3. Canonical Topics (Deduplicated by canonical discipline + normalized name)
  const mapTopIdA = new Map<number, number>();
  const mapTopIdB = new Map<number, number>();
  const canonicalTopics = new Map<string, any>();
  let nextTopId = 1;

  const processTopics = (
    list: any[],
    discMap: Map<number, number>,
    topMap: Map<number, number>,
  ) => {
    if (!Array.isArray(list)) return;
    for (const t of list) {
      if (!t || !t.name) continue;
      const canonicalDiscId =
        discMap.get(t.disciplineId) || discMap.get(Number(t.disciplineId));
      if (!canonicalDiscId) continue;

      const normName = normalizeString(t.name);
      const topKey = `${canonicalDiscId}::${normName}`;

      if (!canonicalTopics.has(topKey)) {
        const p = t.performance ? { ...t.performance } : undefined;
        if (p) {
          const res = Number(p.questionsResolved) || 0;
          const cor = Number(p.correctCount) || 0;
          const err = Number(p.errorCount) || 0;
          const totalDerived = Math.max(res, cor + err);
          p.questionsResolved = totalDerived;
          p.correctCount = cor;
          p.errorCount = err;
          p.accuracy =
            totalDerived > 0 ? Math.round((cor / totalDerived) * 100) : 0;
        }

        const canonical = {
          id: nextTopId++,
          userId: effectiveUserId,
          disciplineId: canonicalDiscId,
          name: t.name.trim(),
          order: typeof t.order === "number" ? t.order : nextTopId,
          studyDate: t.studyDate || nowIso(),
          notes: t.notes || null,
          studyTimeSeconds: Number(t.studyTimeSeconds) || 0,
          performance: p,
          topicNotes: Array.isArray(t.topicNotes) ? [...t.topicNotes] : [],
          createdAt: t.createdAt || nowIso(),
          updatedAt: t.updatedAt || nowIso(),
        };
        canonicalTopics.set(topKey, canonical);
        topMap.set(t.id, canonical.id);
      } else {
        const existing = canonicalTopics.get(topKey)!;
        existing.studyTimeSeconds = Math.max(
          existing.studyTimeSeconds || 0,
          Number(t.studyTimeSeconds) || 0,
        );

        if (
          t.notes &&
          (!existing.notes || t.notes.length > existing.notes.length)
        ) {
          existing.notes = t.notes;
        }

        if (
          t.studyDate &&
          (!existing.studyDate || t.studyDate < existing.studyDate)
        ) {
          existing.studyDate = t.studyDate;
        }

        // Intelligent Performance Reconciliation:
        // Preserves totals, supports additive merges for offline/independent sessions, and reconciles history
        const curPerf = existing.performance;
        const newPerf = t.performance;

        if (!curPerf && newPerf) {
          existing.performance = { ...newPerf };
        } else if (curPerf && newPerf) {
          const curRes =
            Number(curPerf.questionsResolved) ||
            (Number(curPerf.correctCount) || 0) +
              (Number(curPerf.errorCount) || 0);
          const newRes =
            Number(newPerf.questionsResolved) ||
            (Number(newPerf.correctCount) || 0) +
              (Number(newPerf.errorCount) || 0);
          const curCor = Number(curPerf.correctCount) || 0;
          const newCor = Number(newPerf.correctCount) || 0;
          const curErr = Number(curPerf.errorCount) || 0;
          const newErr = Number(newPerf.errorCount) || 0;

          // Merge history by date
          const mergedHistMap = new Map<string, any>();
          for (const h of curPerf.history || [])
            if (h && h.date) mergedHistMap.set(h.date, h);
          for (const h of newPerf.history || []) {
            if (!h || !h.date) continue;
            if (!mergedHistMap.has(h.date)) {
              mergedHistMap.set(h.date, h);
            } else {
              const prevH = mergedHistMap.get(h.date);
              const maxQ = Math.max(
                prevH.questionsResolved || 0,
                h.questionsResolved || 0,
              );
              const bestAcc =
                maxQ === h.questionsResolved ? h.accuracy : prevH.accuracy;
              mergedHistMap.set(h.date, {
                ...prevH,
                questionsResolved: maxQ,
                accuracy: bestAcc,
              });
            }
          }

          let finalResolved = 0;
          let finalCorrect = 0;
          let finalError = 0;

          const incomingIsNewer =
            Boolean(newPerf.lastImportedAt) &&
            (!curPerf.lastImportedAt ||
              String(newPerf.lastImportedAt) > String(curPerf.lastImportedAt));

          // Case 1: Identical question counts -> keep the snapshot with the
          // best accuracy and keep correct+error === resolved.
          if (curRes === newRes) {
            finalResolved = curRes;
            const curAcc = curRes > 0 ? curCor / curRes : 0;
            const newAcc = newRes > 0 ? newCor / newRes : 0;
            if (newAcc > curAcc) {
              finalCorrect = newCor;
              finalError = newErr;
            } else {
              finalCorrect = curCor;
              finalError = curErr;
            }
          }
          // Case 2: One device is an offline/mobile subset answered independently (e.g. 200 on PC and 10 on Mobile)
          // When the smaller count is significantly smaller (< 20% of the larger) or < 50 questions, ADD them!
          // This handles cases like: 200 on desktop + 10 on mobile = 210 total.
          // Exige lastImportedAt mais novo: sem isso o mesmo payload era somado
          // de novo a cada sync (210 -> 220 -> 230...).
          else if (
            incomingIsNewer &&
            Math.min(curRes, newRes) > 0 &&
            (Math.min(curRes, newRes) < 50 ||
              Math.min(curRes, newRes) < Math.max(curRes, newRes) * 0.2)
          ) {
            const isCurSmaller = curRes < newRes;
            const smallCor = isCurSmaller ? curCor : newCor;
            const smallErr = isCurSmaller ? curErr : newErr;
            const smallRes = isCurSmaller ? curRes : newRes;

            const largeCor = isCurSmaller ? newCor : curCor;
            const largeErr = isCurSmaller ? newErr : curErr;
            const largeRes = isCurSmaller ? newRes : curRes;

            finalResolved = largeRes + smallRes;
            finalCorrect = largeCor + smallCor;
            finalError = largeErr + smallErr;
          }
          // Case 3: Incremental progression (delta sync) -> keep the higher volume
          else {
            const isNewHigher = newRes > curRes;
            finalResolved = isNewHigher ? newRes : curRes;
            finalCorrect = isNewHigher ? newCor : curCor;
            finalError = isNewHigher ? newErr : curErr;
          }

          finalResolved = Math.max(finalResolved, finalCorrect + finalError);
          // Mantém a invariante correta+erros = respondidas.
          finalError = Math.max(0, finalResolved - finalCorrect);
          const finalAcc =
            finalResolved > 0
              ? Math.round((finalCorrect / finalResolved) * 100)
              : 0;

          existing.performance = {
            ...curPerf,
            ...newPerf,
            questionsResolved: finalResolved,
            accuracy: finalAcc,
            correctCount: finalCorrect,
            errorCount: finalError,
            lastImportedAt:
              newPerf.lastImportedAt || curPerf.lastImportedAt || nowIso(),
            history: Array.from(mergedHistMap.values()),
          };
        }

        if (Array.isArray(t.topicNotes)) {
          const notesSet = new Set(existing.topicNotes || []);
          for (const note of t.topicNotes) notesSet.add(note);
          existing.topicNotes = Array.from(notesSet);
        }

        topMap.set(t.id, existing.id);
      }
    }
  };

  processTopics(safeA.topics || [], mapDiscIdA, mapTopIdA);
  processTopics(safeB.topics || [], mapDiscIdB, mapTopIdB);

  // 4. Question Errors (Deduplicated by fingerprint)
  const canonicalErrors = new Map<string, any>();
  let nextErrId = 1;

  const processQuestionErrors = (
    list: any[],
    discMap: Map<number, number>,
    topMap: Map<number, number>,
  ) => {
    if (!Array.isArray(list)) return;
    for (const qe of list) {
      if (!qe) continue;
      const canonicalDiscId =
        discMap.get(qe.disciplineId) ||
        discMap.get(Number(qe.disciplineId)) ||
        0;
      const canonicalTopId =
        topMap.get(qe.topicId) || topMap.get(Number(qe.topicId)) || 0;
      if (!canonicalDiscId || !canonicalTopId) continue;

      const key = getQuestionErrorKey(qe, canonicalDiscId, canonicalTopId);
      if (!canonicalErrors.has(key)) {
        canonicalErrors.set(key, {
          ...qe,
          id: nextErrId++,
          userId: effectiveUserId,
          disciplineId: canonicalDiscId,
          topicId: canonicalTopId,
          statement: qe.statement || "",
          alternatives: Array.isArray(qe.alternatives) ? qe.alternatives : [],
          createdAt: qe.createdAt || nowIso(),
          updatedAt: qe.updatedAt || nowIso(),
        });
      } else {
        const existing = canonicalErrors.get(key)!;
        if (qe.aiAnalysis && !existing.aiAnalysis) {
          existing.aiAnalysis = qe.aiAnalysis;
          existing.aiAnalyzedAt = qe.aiAnalyzedAt || nowIso();
        }
        if (qe.aiRevisionTip && !existing.aiRevisionTip) {
          existing.aiRevisionTip = qe.aiRevisionTip;
          existing.aiRevisionTipAt = qe.aiRevisionTipAt || nowIso();
        }
        if (qe.aiSimilarQuestions && !existing.aiSimilarQuestions) {
          existing.aiSimilarQuestions = qe.aiSimilarQuestions;
          existing.aiSimilarQuestionsAt = qe.aiSimilarQuestionsAt || nowIso();
        }
        if (qe.errorOrigin && !existing.errorOrigin)
          existing.errorOrigin = qe.errorOrigin;
        if (qe.userAnswer && !existing.userAnswer)
          existing.userAnswer = qe.userAnswer;
        if (qe.correctAnswer && !existing.correctAnswer)
          existing.correctAnswer = qe.correctAnswer;
      }
    }
  };

  processQuestionErrors(safeA.questionErrors || [], mapDiscIdA, mapTopIdA);
  processQuestionErrors(safeB.questionErrors || [], mapDiscIdB, mapTopIdB);

  // 5. Revisions
  const canonicalRevisions = new Map<string, any>();
  let nextRevId = 1;

  const processRevisions = (list: any[], topMap: Map<number, number>) => {
    if (!Array.isArray(list)) return;
    for (const r of list) {
      if (!r) continue;
      const canonicalTopId =
        topMap.get(r.topicId) || topMap.get(Number(r.topicId));
      if (!canonicalTopId) continue;

      const schedDate = (r.scheduledDate || "").slice(0, 10);
      const revNumber = Number.isFinite(Number(r.revisionNumber))
        ? Number(r.revisionNumber)
        : 1;
      const revKey = `${canonicalTopId}::${r.type || "revision"}::${revNumber}::${schedDate}`;

      if (!canonicalRevisions.has(revKey)) {
        canonicalRevisions.set(revKey, {
          ...r,
          id: nextRevId++,
          userId: effectiveUserId,
          topicId: canonicalTopId,
          scheduledDate: r.scheduledDate || nowIso().slice(0, 10),
          type: r.type || "revision",
          revisionNumber: revNumber,
          completed: Boolean(r.completed),
          ignored: Boolean(r.ignored),
          completedAt: r.completedAt || (r.completed ? nowIso() : null),
          createdAt: r.createdAt || nowIso(),
          updatedAt: r.updatedAt || nowIso(),
          link: r.link || "",
        });
      } else {
        const existing = canonicalRevisions.get(revKey)!;
        if (r.completed && !existing.completed) {
          existing.completed = true;
          existing.completedAt = r.completedAt || nowIso();
        }
        if (r.ignored) existing.ignored = true;
        if (r.link && !existing.link) existing.link = r.link;
        if (r.updatedAt && String(r.updatedAt) > String(existing.updatedAt)) {
          existing.updatedAt = r.updatedAt;
        }
      }
    }
  };

  processRevisions(safeA.revisions || [], mapTopIdA);
  processRevisions(safeB.revisions || [], mapTopIdB);

  // 6. Mock Exams
  const canonicalMockExams = new Map<string, any>();
  let nextMockId = 1;
  const processMockExams = (list: any[]) => {
    if (!Array.isArray(list)) return;
    for (const m of list) {
      if (!m || !m.name) continue;
      const key = `${normalizeString(m.name)}::${m.date || ""}`;
      if (!canonicalMockExams.has(key)) {
        canonicalMockExams.set(key, {
          ...m,
          id: nextMockId++,
          userId: effectiveUserId,
        });
      } else {
        const existing = canonicalMockExams.get(key)!;
        if ((m.score || 0) > (existing.score || 0)) {
          canonicalMockExams.set(key, {
            ...m,
            id: existing.id,
            userId: effectiveUserId,
          });
        }
      }
    }
  };
  processMockExams(safeA.mockExams || []);
  processMockExams(safeB.mockExams || []);

  // 7. Notes
  const canonicalNotes = new Map<string, any>();
  let nextNoteId = 1;
  const processNotes = (
    list: any[],
    discMap: Map<number, number>,
    topMap: Map<number, number>,
  ) => {
    if (!Array.isArray(list)) return;
    for (const n of list) {
      if (!n || !n.title) continue;
      const canonicalDiscId =
        discMap.get(n.disciplineId) || discMap.get(Number(n.disciplineId)) || 0;
      const canonicalTopId = n.topicId
        ? topMap.get(n.topicId) || topMap.get(Number(n.topicId)) || 0
        : 0;
      const key = `${canonicalDiscId}::${canonicalTopId}::${normalizeString(n.title)}`;
      if (!canonicalNotes.has(key)) {
        canonicalNotes.set(key, {
          ...n,
          id: nextNoteId++,
          userId: effectiveUserId,
          disciplineId: canonicalDiscId,
          topicId: canonicalTopId || undefined,
        });
      } else {
        const existing = canonicalNotes.get(key)!;
        if (
          (n.content || "").length > (existing.content || "").length ||
          (n.updatedAt && n.updatedAt > existing.updatedAt)
        ) {
          canonicalNotes.set(key, {
            ...n,
            id: existing.id,
            userId: effectiveUserId,
            disciplineId: canonicalDiscId,
            topicId: canonicalTopId || undefined,
          });
        }
      }
    }
  };
  processNotes(safeA.notes || [], mapDiscIdA, mapTopIdA);
  processNotes(safeB.notes || [], mapDiscIdB, mapTopIdB);

  // 8. Flashcards
  const canonicalFlashcards = new Map<string, any>();
  let nextFlashId = 1;
  const processFlashcards = (
    list: any[],
    discMap: Map<number, number>,
    topMap: Map<number, number>,
  ) => {
    if (!Array.isArray(list)) return;
    for (const f of list) {
      if (!f || !f.front) continue;
      const canonicalDiscId =
        discMap.get(f.disciplineId) || discMap.get(Number(f.disciplineId)) || 0;
      const canonicalTopId = f.topicId
        ? topMap.get(f.topicId) || topMap.get(Number(f.topicId)) || 0
        : 0;
      const key = `${canonicalDiscId}::${canonicalTopId}::${normalizeString(f.front)}::${normalizeString(f.back)}`;
      if (!canonicalFlashcards.has(key)) {
        canonicalFlashcards.set(key, {
          ...f,
          id: nextFlashId++,
          userId: effectiveUserId,
          disciplineId: canonicalDiscId,
          topicId: canonicalTopId || undefined,
        });
      } else {
        const existing = canonicalFlashcards.get(key)!;
        const newRep = Number(f.repetitions) || 0;
        const curRep = Number(existing.repetitions) || 0;
        const newUpdated = String(f.updatedAt || "");
        const curUpdated = String(existing.updatedAt || "");
        if (newRep > curRep || (newRep === curRep && newUpdated > curUpdated)) {
          canonicalFlashcards.set(key, {
            ...f,
            id: existing.id,
            userId: effectiveUserId,
            disciplineId: canonicalDiscId,
            topicId: canonicalTopId || undefined,
          });
        }
      }
    }
  };
  processFlashcards(safeA.flashcards || [], mapDiscIdA, mapTopIdA);
  processFlashcards(safeB.flashcards || [], mapDiscIdB, mapTopIdB);

  // 9. Subjective Answers & Concept Confusions
  const canonicalSubjective = new Map<string, any>();
  let nextSubjId = 1;
  const processSubjective = (list: any[], topMap: Map<number, number>) => {
    if (!Array.isArray(list)) return;
    for (const sa of list) {
      if (!sa) continue;
      const canonicalTopId =
        topMap.get(sa.topicId) || topMap.get(Number(sa.topicId)) || 0;
      const textKey = normalizeString(
        sa.statement || sa.transcription || sa.topicName || "",
      ).slice(0, 80);
      // O id é local ao dispositivo; usar createdAt/texto como identidade
      // evita duplicar a mesma resposta a cada sync.
      const key = sa.createdAt
        ? `created:${sa.createdAt}::${canonicalTopId}`
        : `${canonicalTopId}::${textKey}::${sa.banca || ""}`;
      if (!canonicalSubjective.has(key)) {
        canonicalSubjective.set(key, {
          ...sa,
          id: nextSubjId++,
          userId: effectiveUserId,
          topicId: canonicalTopId,
        });
      } else {
        const existing = canonicalSubjective.get(key);
        if (sa.score !== undefined && existing.score === undefined) {
          canonicalSubjective.set(key, {
            ...sa,
            id: existing.id,
            userId: effectiveUserId,
            topicId: canonicalTopId,
          });
        }
      }
    }
  };
  processSubjective(safeA.subjectiveAnswers || [], mapTopIdA);
  processSubjective(safeB.subjectiveAnswers || [], mapTopIdB);

  // 9b. Canonical Essays (Redações)
  const canonicalEssays = new Map<string, any>();
  let nextEssayId = 1;
  const processEssays = (
    list: any[],
    discMap: Map<number, number>,
    topMap: Map<number, number>,
  ) => {
    if (!Array.isArray(list)) return;
    for (const e of list) {
      if (!e || !e.title) continue;
      const canonicalDiscId =
        discMap.get(e.disciplineId) ||
        discMap.get(Number(e.disciplineId)) ||
        e.disciplineId ||
        0;
      const canonicalTopId = e.topicId
        ? topMap.get(e.topicId) || topMap.get(Number(e.topicId)) || 0
        : undefined;
      const key = `${canonicalDiscId}::${normalizeString(e.title)}::${normalizeString(e.banca || "")}`;
      if (!canonicalEssays.has(key)) {
        canonicalEssays.set(key, {
          ...e,
          id: nextEssayId++,
          userId: effectiveUserId,
          disciplineId: canonicalDiscId,
          topicId: canonicalTopId,
        });
      } else {
        const existing = canonicalEssays.get(key);
        if (e.status === "corrected" && existing.status !== "corrected") {
          canonicalEssays.set(key, {
            ...e,
            id: existing.id,
            userId: effectiveUserId,
            disciplineId: canonicalDiscId,
            topicId: canonicalTopId,
          });
        } else if (
          (e.transcription || "").length > (existing.transcription || "").length
        ) {
          canonicalEssays.set(key, {
            ...e,
            id: existing.id,
            userId: effectiveUserId,
            disciplineId: canonicalDiscId,
            topicId: canonicalTopId,
          });
        }
      }
    }
  };
  processEssays(safeA.essays || [], mapDiscIdA, mapTopIdA);
  processEssays(safeB.essays || [], mapDiscIdB, mapTopIdB);

  const canonicalConfusions = new Map<string, any>();
  let nextConfId = 1;
  const processConfusions = (list: any[]) => {
    if (!Array.isArray(list)) return;
    for (const c of list) {
      if (!c || !c.conceptA || !c.conceptB) continue;
      const key = `${normalizeString(c.conceptA)}::${normalizeString(c.conceptB)}`;
      if (!canonicalConfusions.has(key)) {
        canonicalConfusions.set(key, {
          ...c,
          id: nextConfId++,
          userId: effectiveUserId,
        });
      }
    }
  };
  processConfusions(safeA.conceptConfusions || []);
  processConfusions(safeB.conceptConfusions || []);

  // 10. TecSnapshots
  const canonicalSnapshots = new Map<string, any>();
  let nextSnapId = 1;
  const processSnapshots = (list: any[]) => {
    if (!Array.isArray(list)) return;
    for (const s of list) {
      if (!s) continue;
      // TecSnapshot é um retrato agregado por importação (importedAt + topics),
      // não possui disciplineId/topicId. A chave anterior (0::0::data) colapsava
      // todos os snapshots em um só.
      const importedAt = s.importedAt || s.createdAt || s.date || "";
      const key = String(importedAt || s.id || "");
      if (!key) continue;
      if (!canonicalSnapshots.has(key)) {
        canonicalSnapshots.set(key, {
          ...s,
          id: nextSnapId++,
          userId: effectiveUserId,
          importedAt: importedAt || nowIso(),
        });
      }
    }
  };
  processSnapshots(safeA.tecSnapshots || []);
  processSnapshots(safeB.tecSnapshots || []);

  // 11. Mentor Sessions & AI Conversations
  const canonicalMentorSessions = new Map<string, any>();
  const processMentorSessions = (list: any[]) => {
    if (!Array.isArray(list)) return;
    for (const ms of list) {
      if (!ms || !ms.id) continue;
      const key = String(ms.id);
      if (!canonicalMentorSessions.has(key)) {
        canonicalMentorSessions.set(key, { ...ms, userId: effectiveUserId });
      } else {
        const existing = canonicalMentorSessions.get(key);
        const msgsNew = ms.messages?.length || 0;
        const msgsCur = existing.messages?.length || 0;
        if (msgsNew >= msgsCur) {
          canonicalMentorSessions.set(key, { ...ms, userId: effectiveUserId });
        }
      }
    }
  };
  processMentorSessions(safeA.mentorSessions || []);
  processMentorSessions(safeB.mentorSessions || []);

  // 12. Recalculate Discipline Performance based on merged topics
  const finalTopics = Array.from(canonicalTopics.values());
  for (const disc of canonicalDisciplines.values()) {
    const discTopics = finalTopics.filter((t) => t.disciplineId === disc.id);
    const resolved = discTopics.reduce(
      (s, t) => s + (t.performance?.questionsResolved || 0),
      0,
    );
    const correct = discTopics.reduce(
      (s, t) => s + (t.performance?.correctCount || 0),
      0,
    );
    const errors = discTopics.reduce(
      (s, t) => s + (t.performance?.errorCount || 0),
      0,
    );
    const studySecs = Math.max(
      disc.studyTimeSeconds || 0,
      discTopics.reduce((s, t) => s + (t.studyTimeSeconds || 0), 0),
    );
    const accuracy = resolved > 0 ? Math.round((correct / resolved) * 100) : 0;

    disc.studyTimeSeconds = studySecs;
    disc.performance = {
      questionsResolved: resolved,
      accuracy,
      correctCount: correct,
      errorCount: errors,
    };
  }

  const finalDisciplines = Array.from(canonicalDisciplines.values()).sort(
    (a, b) => (a.order ?? 999) - (b.order ?? 999),
  );

  const finalRevisions = Array.from(canonicalRevisions.values());
  const finalErrors = Array.from(canonicalErrors.values());

  // Cadernos TEC: unir por cadernoId e reatribuir ao usuário efetivo. O merge
  // anterior sobrescrevia a lista inteira quando os dois lados usavam a mesma
  // chave de usuário.
  const cadernoMap = new Map<string, any>();
  for (const source of [safeA.cadernosTec, safeB.cadernosTec]) {
    for (const list of Object.values(source || {})) {
      for (const c of Array.isArray(list) ? list : []) {
        const id = String(c?.cadernoId || "");
        if (!id) continue;
        const prev = cadernoMap.get(id);
        if (!prev) {
          cadernoMap.set(id, { ...c });
        } else {
          prev.lastSync =
            String(c.lastSync || "") > String(prev.lastSync || "")
              ? c.lastSync
              : prev.lastSync;
          prev.topicsCount = Math.max(
            Number(prev.topicsCount) || 0,
            Number(c.topicsCount) || 0,
          );
          prev.cadernoUrl = prev.cadernoUrl || c.cadernoUrl;
          prev.disciplina = prev.disciplina || c.disciplina;
        }
      }
    }
  }
  const mergedCadernos =
    cadernoMap.size > 0
      ? { [effectiveUserId]: Array.from(cadernoMap.values()) }
      : {};

  const mergedDb: Database = {
    users: [primaryUser],
    disciplines: finalDisciplines,
    topics: finalTopics,
    revisions: finalRevisions,
    mockExams: Array.from(canonicalMockExams.values()),
    notes: Array.from(canonicalNotes.values()),
    flashcards: Array.from(canonicalFlashcards.values()),
    questionErrors: finalErrors,
    essays: Array.from(canonicalEssays.values()),
    tecSnapshots: Array.from(canonicalSnapshots.values()),
    subjectiveAnswers: Array.from(canonicalSubjective.values()),
    conceptConfusions: Array.from(canonicalConfusions.values()),
    mentorSessions: Array.from(canonicalMentorSessions.values()),
    cadernosTec: mergedCadernos,
    counters: {
      users: 1,
      disciplines: nextDiscId - 1,
      topics: nextTopId - 1,
      revisions: nextRevId - 1,
      mockExams: nextMockId - 1,
      notes: nextNoteId - 1,
      flashcards: nextFlashId - 1,
      questionErrors: nextErrId - 1,
      essays: nextEssayId - 1,
      tecSnapshots: nextSnapId - 1,
    },
    _mergeReport: {
      disciplinesCount: finalDisciplines.length,
      topicsCount: finalTopics.length,
      questionErrorsCount: finalErrors.length,
      revisionsCount: finalRevisions.length,
      totalQuestionsResolved: finalTopics.reduce(
        (s, t) => s + (t.performance?.questionsResolved || 0),
        0,
      ),
    },
  };

  return mergedDb;
}
