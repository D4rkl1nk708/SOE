#!/usr/bin/env node
/**
 * Cria data/database.json inicial com 3 matérias de exemplo se o arquivo não existir.
 * Rodado a cada build para que novos usuários vejam o sistema com dados de demonstração.
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "database.json");

if (fs.existsSync(DB_FILE)) {
  console.log("data/database.json já existe; seed ignorado.");
  process.exit(0);
}

const now = new Date().toISOString();
const seed = {
  users: [
    {
      id: 1,
      openId: "local-user",
      name: "Usuário Local",
      email: "local@estudos.local",
      loginMethod: "local",
      role: "admin",
      settings: {
        theme: "light",
        studyStreak: { current: 0, best: 0, lastStudyDate: null },
        testIntervalDays: 3,
        revisionIntervalDays: 25,
        revisionSecondPhaseDays: 50,
        exams: [],
        editalCycle: [],
        editalRows: [],
      },
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    },
  ],
  disciplines: [
    { id: 1, userId: 1, name: "Direito Constitucional", color: "#3B82F6", weight: 5, order: 1, studyTimeSeconds: 0, createdAt: now, updatedAt: now },
    { id: 2, userId: 1, name: "Língua Portuguesa", color: "#10B981", weight: 5, order: 2, studyTimeSeconds: 0, createdAt: now, updatedAt: now },
    { id: 3, userId: 1, name: "Raciocínio Lógico", color: "#F59E0B", weight: 5, order: 3, studyTimeSeconds: 0, createdAt: now, updatedAt: now },
  ],
  topics: [],
  revisions: [],
  mockExams: [],
  notes: [],
  counters: { users: 1, disciplines: 3, topics: 0, revisions: 0, mockExams: 0, notes: 0 },
};

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), "utf-8");
console.log("Criado data/database.json com 3 matérias de exemplo.");
