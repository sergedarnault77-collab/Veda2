import { test, expect } from "@playwright/test";
import { seedAuthenticatedUser } from "./fixtures/auth";

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedUser(page);
    await page.goto("/");
    await expect(page.locator("nav.app-nav")).toBeVisible();
  });

  test("Scan tab is active by default", async ({ page }) => {
    await expect(page.locator("nav.app-nav button.app-nav__btn--active")).toHaveText("Scan");
  });

  test("navigate to Dashboard tab", async ({ page }) => {
    await page.locator("nav.app-nav").locator("button", { hasText: "Dashboard" }).click();
    await expect(page.locator("nav.app-nav button.app-nav__btn--active")).toHaveText("Dashboard");
  });

  test("navigate to Supps tab", async ({ page }) => {
    await page.locator("nav.app-nav").locator("button", { hasText: "Supps" }).click();
    await expect(page.locator("nav.app-nav button.app-nav__btn--active")).toHaveText("Supps");
    await expect(page.getByRole("heading", { name: "Your supplements" })).toBeVisible();
  });

  test("navigate to Meds tab", async ({ page }) => {
    await page.locator("nav.app-nav").locator("button", { hasText: "Meds" }).click();
    await expect(page.locator("nav.app-nav button.app-nav__btn--active")).toHaveText("Meds");
    await expect(page.getByRole("heading", { name: "Your medications" })).toBeVisible();
  });

  test("navigate back to Scan tab", async ({ page }) => {
    await page.locator("nav.app-nav").locator("button", { hasText: "Dashboard" }).click();
    await page.getByTestId("nav-scan").click();
    await expect(page.locator("nav.app-nav button.app-nav__btn--active")).toHaveText("Scan");
  });

  test("account button is visible", async ({ page }) => {
    await expect(page.locator("[aria-label='Account']")).toBeVisible();
  });
});
