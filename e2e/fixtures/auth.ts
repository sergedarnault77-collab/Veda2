import { type Page } from "@playwright/test";

/**
 * Seed localStorage with a fully onboarded test user so tests
 * can skip the registration / profile / plan screens.
 */
export async function seedAuthenticatedUser(page: Page) {
  await page.addInitScript(() => {
    const user = {
      firstName: "Test",
      lastName: "User",
      email: "test@veda.local",
      country: "US",
      city: "San Francisco",
      plan: "ai",
      sex: "male",
      heightCm: 180,
      weightKg: 75,
      ageRange: "26-35",
      profileComplete: true,
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem("veda.user.v1", JSON.stringify(user));
  });
}
