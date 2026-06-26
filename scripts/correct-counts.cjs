/**
 * Database correction script: Fix specific inflated topic counts.
 */
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(process.cwd(), 'data', 'database.json');

const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));

const topics = db.topics || [];

console.log('Adjusting topic counts...');

for (const t of topics) {
  // 1. "Dos Direitos e Deveres Individuais e Coletivos (art. 5º da CF/1988)"
  // Should be 7 questions resolved instead of 314 (3 correct + 2 wrong before the jump, plus 2 solved after the jump)
  if (t.id === 169 || t.id === 371) {
    console.log(`  Adjusting topic ${t.id} ("${t.name}"): 314 -> 7`);
    t.performance = {
      questionsResolved: 7,
      accuracy: 71,
      correctCount: 5,
      errorCount: 2,
      errorByAttention: t.performance?.errorByAttention ?? 0,
      errorByForgetting: t.performance?.errorByForgetting ?? 0,
      errorByTheory: t.performance?.errorByTheory ?? 0,
      errorByTrap: t.performance?.errorByTrap ?? 0,
      fastErrors: t.performance?.fastErrors ?? 0,
      slowErrors: t.performance?.slowErrors ?? 0,
      history: [
        { date: '2026-04-01', accuracy: 0, questionsResolved: 0 },
        { date: '2026-04-06', accuracy: 60, questionsResolved: 5 },
        { date: '2026-04-09', accuracy: 60, questionsResolved: 5 },
        { date: '2026-04-27', accuracy: 71, questionsResolved: 7 }
      ],
      lastImportedAt: t.performance?.lastImportedAt
    };
  }

  // 2. "Algoritmos de Criptografia"
  // Should be 0 questions resolved instead of 107 (jumped directly to 107 from 0 on import)
  if (t.id === 250 || t.id === 452) {
    console.log(`  Adjusting topic ${t.id} ("${t.name}"): 107 -> 0`);
    t.performance = {
      questionsResolved: 0,
      accuracy: 0,
      correctCount: 0,
      errorCount: 0,
      errorByAttention: 0,
      errorByForgetting: 0,
      errorByTheory: 0,
      errorByTrap: 0,
      fastErrors: 0,
      slowErrors: 0,
      history: [
        { date: '2026-04-09', accuracy: 0, questionsResolved: 0 }
      ],
      lastImportedAt: t.performance?.lastImportedAt
    };
  }
}

// Update the tecSnapshots to match the corrected counts as well, so that charts render correctly
const snapshots = db.tecSnapshots || [];
for (const s of snapshots) {
  if (s.topics) {
    for (const st of s.topics) {
      if (st.topicName.trim() === 'Dos Direitos e Deveres Individuais e Coletivos (art. 5º da CF/1988)') {
        if (st.questionsResolved > 10) {
          st.questionsResolved = 7;
          st.correctCount = 5;
          st.errorCount = 2;
          st.accuracy = 71;
        }
      }
      if (st.topicName.trim() === 'Algoritmos de Criptografia') {
        if (st.questionsResolved > 0) {
          st.questionsResolved = 0;
          st.correctCount = 0;
          st.errorCount = 0;
          st.accuracy = 0;
        }
      }
    }
  }
  // Recompute totalQuestions, totalCorrect, totalErrors, overallAccuracy
  s.totalQuestions = s.topics.reduce((sum, t) => sum + (t.questionsResolved || 0), 0);
  s.totalCorrect = s.topics.reduce((sum, t) => sum + (t.correctCount || 0), 0);
  s.totalErrors = s.topics.reduce((sum, t) => sum + (t.errorCount || 0), 0);
  s.overallAccuracy = s.totalQuestions > 0 ? Math.round((s.totalCorrect / s.totalQuestions) * 100) : 0;
}

fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
console.log('✓ Database counts corrected and saved!');
