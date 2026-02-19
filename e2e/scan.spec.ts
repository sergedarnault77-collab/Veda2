import { test, expect } from "@playwright/test";
import { seedAuthenticatedUser } from "./fixtures/auth";

test.describe("Scan page", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedUser(page);
    await page.goto("/");
    await expect(page.getByTestId("scan-page")).toBeVisible();
  });

  test("shows three entry tiles in idle state", async ({ page }) => {
    await expect(page.locator(".scan-status__tileLabel").nth(0)).toHaveText("Scan label");
    await expect(page.locator(".scan-status__tileLabel").nth(1)).toHaveText("Log drink");
    await expect(page.locator(".scan-status__tileLabel").nth(2)).toHaveText("Paste URL");
  });

  test("Log drink opens drink builder", async ({ page }) => {
    await page.locator("text=Log drink").click();
    await expect(page.locator(".drink-builder")).toBeVisible({ timeout: 3000 });
  });

  test("Paste URL opens URL input", async ({ page }) => {
    await page.locator("text=Paste URL").click();
    await expect(page.locator(".scan-status__urlInput")).toBeVisible();
    await expect(page.locator(".scan-status__urlInput")).toHaveAttribute("placeholder", "https://...");
  });

  test("URL input has submit and cancel buttons", async ({ page }) => {
    await page.locator("text=Paste URL").click();
    await expect(page.locator(".scan-status__addBtn")).toBeVisible();
    await expect(page.locator(".scan-status__dismissBtn")).toBeVisible();
  });

  test("URL cancel returns to idle", async ({ page }) => {
    await page.locator("text=Paste URL").click();
    await page.locator(".scan-status__dismissBtn").click();
    await expect(page.locator(".scan-status__tileLabel").first()).toBeVisible();
  });
});
