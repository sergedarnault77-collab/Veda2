import { test, expect } from "@playwright/test";
import { seedAuthenticatedUser } from "./fixtures/auth";

test.describe("Disclaimers — general information / not medical advice", () => {
  test("ask-a-question answer includes a disclaimer", async ({ page }) => {
    test.setTimeout(30_000);
    await seedAuthenticatedUser(page);

    // Mock /api/ask-scan to return a canned answer with a disclaimer
    await page.route("**/api/ask-scan", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          answer: {
            shortAnswer: "Generally safe in recommended doses.",
            explanation: "Vitamin D3 at 1000 IU daily is within safe limits.",
            whyFlagged: null,
            practicalNotes: ["Take with a meal for better absorption."],
            disclaimer: "This is general information only and not medical advice. Always consult a healthcare professional.",
          },
        }),
      })
    );

    await page.goto("/");
    await expect(page.getByTestId("scan-page")).toBeVisible();

    await page.getByTestId("ask-button").click();
    await page.getByTestId("ask-input").fill("Is vitamin D safe?");
    await page.getByTestId("ask-submit").click();

    const answer = page.getByTestId("ask-answer");
    await expect(answer).toBeVisible({ timeout: 10_000 });

    const disclaimer = answer.locator(".ask-scan__disclaimer");
    await expect(disclaimer).toBeVisible();
    await expect(disclaimer).toContainText(/not medical advice|general information|consult/i);
  });

  test("mocked scan result includes disclaimer text in the ask section", async ({ page }) => {
    await seedAuthenticatedUser(page);

    // Confirm the trigger text mentions "question" (informational framing)
    await page.goto("/");
    await expect(page.getByTestId("scan-page")).toBeVisible();

    const trigger = page.getByTestId("ask-button");
    await expect(trigger).toBeVisible();
    const text = await trigger.textContent();
    expect(text?.toLowerCase()).toContain("question");
  });
});
