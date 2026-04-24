import { test, expect } from "@playwright/test";

test("homepage has title and main elements", async ({ page }) => {
  await page.goto("http://localhost:3000/");

  // Check title
  await expect(page).toHaveTitle(/SOE/);

  // Check for some main components
  const sidebar = page.locator("nav");
  await expect(sidebar).toBeVisible();
});
