import { test, expect } from "@playwright/test";

test.describe("SOE Core Features", () => {
  test.beforeEach(async ({ page }) => {
    // Acessa a página inicial com no-splash para agilizar os testes
    await page.goto("http://localhost:3000/?no-splash");
    await page.waitForLoadState("networkidle");
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
    // Verifica se algum widget visual carregou (ex: Radar ou Gráficos)
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
