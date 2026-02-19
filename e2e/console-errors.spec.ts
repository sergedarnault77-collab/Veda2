import { test, expect } from "@playwright/test";
import { seedAuthenticatedUser } from "./fixtures/auth";

const IGNORED_PATTERNS = [
  /supabase/i,
  /placeholder\.supabase/i,
  /Failed to register a ServiceWorker/i,
  /service.worker/i,
  /favicon/i,
  /manifest/i,
  /ERR_CONNECTION_REFUSED/i,
  /net::ERR_/i,
  /\[Supabase\]/i,
  /404 \(Not Found\)/i,
  /Failed to load resource/i,
];

function isIgnored(msg: string): boolean {
  return IGNORED_PATTERNS.some((p) => p.test(msg));
}

test.describe("Console error regression", () => {
  test("no unexpected console errors on register screen", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !isIgnored(msg.text())) {
        errors.push(msg.text());
      }
    });

    await page.goto("/");
    await expect(page.locator(".register__title")).toBeVisible();
    await page.waitForTimeout(2000);

    expect(errors).toEqual([]);
  });

  test("no unexpected console errors on main app load", async ({ page }) => {
    await seedAuthenticatedUser(page);
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !isIgnored(msg.text())) {
        errors.push(msg.text());
      }
    });

    await page.goto("/");
    await expect(page.locator(".app-nav")).toBeVisible();
    await page.waitForTimeout(2000);

    expect(errors).toEqual([]);
  });

  test("no unexpected errors when navigating all tabs", async ({ page }) => {
    await seedAuthenticatedUser(page);
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !isIgnored(msg.text())) {
        errors.push(msg.text());
      }
    });

    await page.goto("/");
    await expect(page.locator(".app-nav")).toBeVisible();

    for (const tab of ["Dashboard", "Supps", "Meds", "Scan"]) {
      await page.getByRole("button", { name: tab }).click();
      await page.waitForTimeout(500);
    }

    await page.waitForTimeout(1000);
    expect(errors).toEqual([]);
  });

  test("no unhandled JS exceptions", async ({ page }) => {
    await seedAuthenticatedUser(page);
    const exceptions: string[] = [];
    page.on("pageerror", (error) => {
      if (!isIgnored(error.message)) {
        exceptions.push(error.message);
      }
    });

    await page.goto("/");
    await expect(page.locator(".app-nav")).toBeVisible();

    for (const tab of ["Dashboard", "Supps", "Meds", "Scan"]) {
      await page.getByRole("button", { name: tab }).click();
      await page.waitForTimeout(500);
    }

    expect(exceptions).toEqual([]);
  });
});
