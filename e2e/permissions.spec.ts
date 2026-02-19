import { test, expect } from "@playwright/test";
import { seedAuthenticatedUser } from "./fixtures/auth";

test.describe("Permissions — no camera/photo prompts on load", () => {
  test("no permission requests on register screen", async ({ context, page }) => {
    const permissionRequests: string[] = [];
    context.on("page", (p) => {
      p.on("dialog", (d) => {
        permissionRequests.push(d.message());
        d.dismiss();
      });
    });

    await page.goto("/");
    await expect(page.locator(".register__title")).toBeVisible();
    await page.waitForTimeout(2000);

    expect(permissionRequests).toEqual([]);
  });

  test("no permission requests on authenticated app load", async ({ context, page }) => {
    const permissionRequests: string[] = [];
    context.on("page", (p) => {
      p.on("dialog", (d) => {
        permissionRequests.push(d.message());
        d.dismiss();
      });
    });

    await seedAuthenticatedUser(page);
    await page.goto("/");
    await expect(page.getByTestId("scan-page")).toBeVisible();
    await page.waitForTimeout(2000);

    expect(permissionRequests).toEqual([]);
  });

  test("no permission requests when navigating all tabs", async ({ context, page }) => {
    const permissionRequests: string[] = [];
    context.on("page", (p) => {
      p.on("dialog", (d) => {
        permissionRequests.push(d.message());
        d.dismiss();
      });
    });

    await seedAuthenticatedUser(page);
    await page.goto("/");
    await expect(page.getByTestId("scan-page")).toBeVisible();

    for (const tab of ["Dashboard", "Supps", "Meds", "Scan"]) {
      await page.locator("nav.app-nav").locator("button", { hasText: tab }).click();
      await page.waitForTimeout(500);
    }

    expect(permissionRequests).toEqual([]);
  });

  test("no file chooser is triggered automatically on load", async ({ page }) => {
    await seedAuthenticatedUser(page);

    let fileChooserFired = false;
    page.on("filechooser", () => { fileChooserFired = true; });

    await page.goto("/");
    await expect(page.getByTestId("scan-page")).toBeVisible();
    await page.waitForTimeout(2000);

    expect(fileChooserFired).toBe(false);
  });
});
