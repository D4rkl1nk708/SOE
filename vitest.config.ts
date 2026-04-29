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
    environment: "jsdom",
    env: {
      VITE_SUPABASE_URL: "https://test.supabase.co",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
    },
    include: ["tests/**/*.test.{ts,tsx}", "server/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage",
      all: true,
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
    setupFiles: ["./tests/setup.ts"],
  },
});
