import { test, expect } from "@playwright/test";

// Credenciais de teste (usuário já criado no Supabase)
const TEST_EMAIL = "test@gmail.com";
const TEST_PASSWORD = "6482";

test.describe("SOE Core Features", () => {
  test.beforeEach(async ({ page }) => {
    // Faz login via bypass de teste (localhost apenas)
    await page.goto("http://localhost:3000/login?no-splash&test=true");
    // Aguarda redirecionamento para fora do login
    await page.waitForURL(url => !url.pathname.includes("/login"), { timeout: 10000 });
  });

  test("Deve acessar o Perfil e abrir a aba do Sentinela", async ({ page }) => {
    await page.goto("http://localhost:3000/profile?no-splash#dou");
    await expect(
      page.getByRole("heading", {
        name: /Monitoramento DOU|Configuração de Busca/i,
      }),
    ).toBeVisible();
  });

  test("Deve acessar as Anotações", async ({ page }) => {
    await page.goto("http://localhost:3000/notes?no-splash");
    await expect(
      page.getByRole("heading", { name: /Anotações|Notas/i }).first(),
    ).toBeVisible();
  });

  test("Deve acessar o Analytics", async ({ page }) => {
    await page.goto("http://localhost:3000/analytics?no-splash");
    await expect(page).toHaveURL(/\/analytics/);
  });

  test("Deve acessar o Simulado e ver a tela de configuração", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000/simulado?no-splash");
    await expect(page.getByText(/Simulado Cronometrado/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Iniciar Simulado/i }),
    ).toBeVisible();
  });
});
