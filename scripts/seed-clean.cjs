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

// Sempre remover arquivo antigo para garantir build limpa
if (fs.existsSync(DB_FILE)) {
  fs.unlinkSync(DB_FILE);
  console.log("Arquivo data/database.json antigo removido.");
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
