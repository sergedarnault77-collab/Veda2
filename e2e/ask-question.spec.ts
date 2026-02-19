import { test, expect } from "@playwright/test";
import { seedAuthenticatedUser } from "./fixtures/auth";

test.describe("Ask a question", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedUser(page);
    await page.goto("/");
    await expect(page.getByTestId("scan-page")).toBeVisible();
  });

  test("question trigger button is visible on idle scan page", async ({ page }) => {
    const trigger = page.getByTestId("ask-button");
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText("question");
  });

  test("clicking trigger expands the input", async ({ page }) => {
    await page.getByTestId("ask-button").click();
    await expect(page.getByTestId("ask-input")).toBeVisible();
    await expect(page.getByTestId("ask-submit")).toBeVisible();
  });

  test("send button is disabled when input is empty", async ({ page }) => {
    await page.getByTestId("ask-button").click();
    await expect(page.getByTestId("ask-submit")).toBeDisabled();
  });

  test("typing enables the send button", async ({ page }) => {
    await page.getByTestId("ask-button").click();
    await page.getByTestId("ask-input").fill("Is vitamin D safe to take daily?");
    await expect(page.getByTestId("ask-submit")).toBeEnabled();
  });

  test("submitting a question shows an answer", async ({ page }) => {
    test.setTimeout(30_000);
    await page.getByTestId("ask-button").click();
    await page.getByTestId("ask-input").fill("Is vitamin D safe to take daily?");
    await page.getByTestId("ask-submit").click();

    const answer = page.getByTestId("ask-answer");
    const error = page.locator(".ask-scan__error");
    await expect(answer.or(error)).toBeVisible({ timeout: 20_000 });
  });
});
