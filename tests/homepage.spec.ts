import { test, expect } from "@playwright/test";

test("homepage has title and main elements", async ({ page }) => {
  await page.goto("http://localhost:3000/?no-splash");

  // Check title
  await expect(page).toHaveTitle(/SOE/);

  // Check for main app container or body
  await expect(page.locator("body")).toBeVisible();
});
