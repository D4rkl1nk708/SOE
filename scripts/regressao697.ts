/**
 * Regressão contra um SQLite REAL (cópia): consolidação de disciplinas
 * duplicadas (v6.9.7, item 7) + leitura do deck de lei seca.
 *
 * Nunca abre a base original: recebe DATA_DIR apontando para a cópia.
 */
import * as storage from "../server/jsonStorage";

async function main() {
  const dataDir = process.env.DATA_DIR || "";
  if (!dataDir || !dataDir.includes("soe697-copy")) {
    throw new Error("DATA_DIR precisa apontar para a CÓPIA (soe697-copy).");
  }
  const db = storage.readDatabase();
  const users = db.users || [];
  const userId = users[0]?.id ?? 1;

  const disciplines = await storage.getDisciplinesByUser(userId);
  const topics = await storage.getTopicsByUser(userId);
  const questionsOf = (list: typeof disciplines) =>
    list.reduce(
      (sum, discipline) =>
        sum + (Number(discipline.performance?.questionsResolved) || 0),
      0,
    );

  const preview = await storage.previewDisciplineConsolidation(userId);
  console.log(
    JSON.stringify(
      {
        fase: "preview",
        disciplinas: disciplines.length,
        topicos: topics.length,
        questoesDisciplinas: questionsOf(disciplines),
        grupos: preview.groups.length,
        antes: preview.disciplinesBefore,
        depois: preview.disciplinesAfter,
        questoesMovidas: preview.questionsMoved,
        topicosMovidos: preview.totalTopics,
        amostra: preview.groups.slice(0, 5).map((group) => ({
          destino: group.targetName,
          origens: group.sources.map((source) => source.name),
          questoes: group.questions,
          topicos: group.topics,
        })),
      },
      null,
      1,
    ),
  );

  if (preview.groups.length === 0) {
    console.log("SEM GRUPOS: nada a consolidar.");
    return;
  }

  const before = questionsOf(disciplines);
  const result = await storage.consolidateDuplicateDisciplines(userId);
  const after = await storage.getDisciplinesByUser(userId);
  const topicosDepois = await storage.getTopicsByUser(userId);

  console.log(
    JSON.stringify(
      {
        fase: "consolidado",
        grupos: result.consolidated,
        origensAbsorvidas: result.sourcesAbsorbed,
        disciplinasAntes: result.disciplinesBefore,
        disciplinasDepois: result.disciplinesAfter,
        questoesAntes: before,
        questoesDepois: questionsOf(after),
        preservado: before === questionsOf(after),
        topicosAntes: topics.length,
        topicosDepois: topicosDepois.length,
        maiorDisciplina: after
          .map((discipline) => ({
            nome: discipline.name,
            questoes: discipline.performance?.questionsResolved || 0,
          }))
          .sort((a, b) => b.questoes - a.questoes)
          .slice(0, 3),
      },
      null,
      1,
    ),
  );

  const again = await storage.consolidateDuplicateDisciplines(userId);
  console.log(
    JSON.stringify({
      fase: "idempotente",
      consolidados: again.consolidated,
      disciplinas: again.disciplinesAfter,
    }),
  );

  const leiSeca = await storage.getLeiSecaToday(userId);
  console.log(
    JSON.stringify({
      fase: "lei-seca",
      cartoesHoje: leiSeca.cards.length,
      totalNoDeck: leiSeca.total,
      vencidos: leiSeca.dueToday,
      meta: leiSeca.cap,
      candidatos: leiSeca.candidates.slice(0, 5).map((candidate) => ({
        topico: candidate.topicName,
        acerto: candidate.accuracy,
        questoes: candidate.questionsResolved,
      })),
    }),
  );

  const built = await storage.buildLeiSecaDeck(userId);
  const builtAgain = await storage.buildLeiSecaDeck(userId);
  const today = await storage.getLeiSecaToday(userId);
  console.log(
    JSON.stringify({
      fase: "lei-seca-montado",
      criados: built.created.length,
      pulados: built.skipped,
      segundaChamadaCriou: builtAgain.created.length,
      cartoesHoje: today.cards.length,
      totalNoDeck: today.total,
      vencidos: today.dueToday,
      meta: today.cap,
      origem: built.created.slice(0, 4).map((card) => ({
        erro: card.sourceErrorId ?? null,
        nota: card.noteId ?? null,
        topico: card.topicId,
      })),
    }),
  );

  const cards = await storage.getFlashcardsByUser(userId);
  const errors = (db.questionErrors || []).filter(
    (error) => error.userId === userId && !error.statementPending,
  );
  console.log(
    JSON.stringify({
      fase: "base",
      flashcards: cards.length,
      errosComEnunciado: errors.length,
      notas: (db.notes || []).filter((note) => note.userId === userId).length,
      tentativas: (db.questionAttempts || []).length,
    }),
  );
}

main().catch((error) => {
  console.error("FALHA:", error);
  process.exit(1);
});
