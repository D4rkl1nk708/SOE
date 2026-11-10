#!/usr/bin/env node
/**
 * Cria data/database.json vazio para builds limpas (Linux, Android, Windows).
 * Usado quando você quer que a build comece sem dados de exemplo.
 * O usuário pode importar seus dados via JSON depois.
 * 
 * IMPORTANTE: Este script SEMPRE cria um database.json limpo, removendo dados antigos.
 * Use apenas quando quiser uma build totalmente limpa.
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "database.json");
const FORCE = process.argv.includes("--force");

// NUNCA apagar o banco existente por padrão: `build:clean` é pré-requisito de
// desktop:build:* e android:build, então um build de distribuição na máquina de
// dev destruía o histórico local silenciosamente.
if (fs.existsSync(DB_FILE)) {
  if (!FORCE) {
    console.log(
      "data/database.json já existe; mantido intacto (use --force para zerar).",
    );
    process.exit(0);
  }
  fs.unlinkSync(DB_FILE);
  console.log("Arquivo data/database.json antigo removido (--force).");
}

const now = new Date().toISOString();
const emptyDatabase = {
  users: [],
  disciplines: [],
  topics: [],
  revisions: [],
  mockExams: [],
  notes: [],
  counters: { users: 0, disciplines: 0, topics: 0, revisions: 0, mockExams: 0, notes: 0 },
};

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
fs.writeFileSync(DB_FILE, JSON.stringify(emptyDatabase, null, 2), "utf-8");
console.log("Criado data/database.json vazio para build limpa.");
