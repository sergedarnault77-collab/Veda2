import { test, expect } from "@playwright/test";
import { seedAuthenticatedUser } from "./fixtures/auth";

test.describe("Smoke tests", () => {
  test("unauthenticated user sees the register screen", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".register__title")).toBeVisible();
    await expect(page.locator("button.register__cta")).toBeVisible();
  });

  test("unauthenticated user can switch to login screen", async ({ page }) => {
    await page.goto("/");
    await page.locator(".register__loginLink").click();
    await expect(page.locator(".login__title")).toBeVisible();
    await expect(page.locator("button.login__cta")).toBeVisible();
  });

  test("authenticated user sees the main app shell", async ({ page }) => {
    await seedAuthenticatedUser(page);
    await page.goto("/");

    const nav = page.locator("nav.app-nav");
    await expect(nav).toBeVisible();
    await expect(page.getByTestId("nav-scan")).toBeVisible();
    await expect(nav.locator("button", { hasText: "Dashboard" })).toBeVisible();
    await expect(nav.locator("button", { hasText: "Supps" })).toBeVisible();
    await expect(nav.locator("button", { hasText: "Meds" })).toBeVisible();
  });

  test("app title and logo are visible", async ({ page }) => {
    await seedAuthenticatedUser(page);
    await page.goto("/");
    await expect(page.locator(".app-nav__logo")).toHaveText("Veda");
  });

  test("privacy policy is accessible via hash", async ({ page }) => {
    await page.goto("/#privacy");
    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible({ timeout: 5000 });
  });

  test("terms of service is accessible via hash", async ({ page }) => {
    await page.goto("/#terms");
    await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible({ timeout: 5000 });
  });
});
