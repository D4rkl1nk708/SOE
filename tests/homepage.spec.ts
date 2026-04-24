import { test, expect } from "@playwright/test";

test("homepage has title and main elements", async ({ page }) => {
  await page.goto("http://localhost:3000/");

  // Check title
  await expect(page).toHaveTitle(/SOE/);

  // Check for main navigation elements
  // We use .first() because the app has both desktop and mobile navs
  const sidebar = page.locator("nav").first();
  await expect(sidebar).toBeVisible();
});
