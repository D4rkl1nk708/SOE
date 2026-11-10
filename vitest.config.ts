import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

const rootDir = path.resolve(import.meta.dirname);

export default defineConfig({
  root: rootDir,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "client", "src"),
      "@server": path.resolve(rootDir, "server"),
      "@shared": path.resolve(rootDir, "shared"),
    },
  },
  test: {
    globals: true,
    // happy-dom em vez de jsdom: o jsdom 29 traz `html-encoding-sniffer` +
    // `@exodus/bytes` (ESM puro) e, em Node < 22.12, o require() interno estoura
    // ERR_REQUIRE_ESM e os arquivos de teste nem iniciam.
    environment: "happy-dom",
    include: ["tests/**/*.test.{ts,tsx}", "server/**/*.test.{ts,tsx}"],
    // A suíte histórica assume o motor JSON (arquivos database.json).
    // O motor SQLite tem spec dedicado: `npm run test:sqlite`.
    env: {
      SOE_STORAGE: "json",
    },
    server: {
      deps: {
        inline: ["html-encoding-sniffer", "@exodus/bytes"],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage",
      include: ["**/*.ts", "**/*.tsx"],
      exclude: [
        "node_modules",
        "dist",
        "scripts/**",
        "**/*.d.ts",
        "**/index.ts",
        "**/router.ts",
        "**/server/_core/**",
        "**/client/src/pages/**/index.tsx",
      ],
    },
  },
});
