import { defineConfig, devices } from "@playwright/test";

// Permite apontar para um servidor já em execução (ex.: CI sobe o build de
// produção na 3101). Sem a variável, assume o dev server local na 3000.
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const hasExternalServer = Boolean(process.env.PLAYWRIGHT_BASE_URL);

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Só sobe o dev server quando não há um alvo externo configurado; no CI o
  // job e2e já sobe o servidor de produção e passa PLAYWRIGHT_BASE_URL.
  ...(hasExternalServer
    ? {}
    : {
        webServer: {
          command: "npm run dev",
          url: "http://localhost:3000",
          reuseExistingServer: !process.env.CI,
          timeout: 120000,
        },
      }),
});
