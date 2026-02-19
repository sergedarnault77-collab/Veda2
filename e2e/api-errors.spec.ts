import { test, expect } from "@playwright/test";
import { seedAuthenticatedUser } from "./fixtures/auth";

test.describe("API error handling", () => {
  test("ask-a-question handles 500 gracefully", async ({ page }) => {
    await seedAuthenticatedUser(page);

    await page.route("**/api/ask-scan", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: '{"ok":false,"error":"Internal Server Error"}' })
    );

    await page.goto("/");
    await expect(page.getByTestId("scan-page")).toBeVisible();

    await page.getByTestId("ask-button").click();
    await page.getByTestId("ask-input").fill("Is this safe?");
    await page.getByTestId("ask-submit").click();

    const error = page.locator(".ask-scan__error");
    await expect(error).toBeVisible({ timeout: 10_000 });
    await expect(error).toContainText(/wrong|error|failed/i);

    // Page should not crash — nav should still be visible
    await expect(page.locator("nav.app-nav")).toBeVisible();
  });

  test("ask-a-question handles network timeout gracefully", async ({ page }) => {
    test.setTimeout(45_000);
    await seedAuthenticatedUser(page);

    await page.route("**/api/ask-scan", (route) =>
      // Never respond — simulates a timeout
      new Promise(() => {})
    );

    await page.goto("/");
    await expect(page.getByTestId("scan-page")).toBeVisible();

    await page.getByTestId("ask-button").click();
    await page.getByTestId("ask-input").fill("Is this safe?");
    await page.getByTestId("ask-submit").click();

    // The app's 30s AbortController timeout should fire
    const error = page.locator(".ask-scan__error");
    await expect(error).toBeVisible({ timeout: 35_000 });
    await expect(error).toContainText(/timed out|timeout|failed|try again/i);

    await expect(page.locator("nav.app-nav")).toBeVisible();
  });

  test("analyze endpoint 500 does not crash the app", async ({ page }) => {
    await seedAuthenticatedUser(page);

    await page.route("**/api/analyze", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: '{"ok":false,"error":"Server Error"}' })
    );

    await page.goto("/");
    await expect(page.getByTestId("scan-page")).toBeVisible();

    // The scan page should remain functional
    await expect(page.locator(".scan-status__tileLabel").first()).toBeVisible();
    await expect(page.locator("nav.app-nav")).toBeVisible();
  });
});
