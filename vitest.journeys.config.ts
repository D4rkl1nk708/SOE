import { defineConfig } from "vitest/config";
import path from "path";

const rootDir = path.resolve(import.meta.dirname);

/**
 * Suíte de jornadas + fuso (v6.9.8, item 2.3 e 2.2).
 *
 * Separada da suíte principal por dois motivos:
 *  - roda contra o motor SQLite (router real + `soe.sqlite` temporário);
 *  - força `TZ=America/Sao_Paulo`, que é o fuso do aluno — os testes de "virar
 *    o dia" só provam alguma coisa com o fuso real.
 *
 * Entra no portão de qualidade do release (`.github/workflows/release.yml`).
 */
export default defineConfig({
  root: rootDir,
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "client", "src"),
      "@server": path.resolve(rootDir, "server"),
      "@shared": path.resolve(rootDir, "shared"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/journeys/**/*.test.ts", "tests/tz/**/*.test.ts"],
    env: {
      SOE_STORAGE: "sqlite",
      TZ: "America/Sao_Paulo",
    },
    // Um processo por arquivo: o `node:sqlite` mantém o arquivo travado e cada
    // jornada usa o seu próprio DATA_DIR temporário.
    pool: "forks",
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
