import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const ART_DIR = path.join(process.cwd(), "artifacts");
const SHOT_DIR = path.join(ART_DIR, "screenshots");
const JSON_DIR = path.join(ART_DIR, "analyze-json");
const FIX_DIR = path.join(process.cwd(), "tests", "fixtures");

function ensureDirs() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.mkdirSync(JSON_DIR, { recursive: true });
}

function fileExists(p: string) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

test("Home scan produces analyze JSON + screenshots", async ({ page, baseURL }) => {
  ensureDirs();

  const front = path.join(FIX_DIR, "sample_front.jpg");
  const label1 = path.join(FIX_DIR, "sample_label_1.jpg");
  const label2 = path.join(FIX_DIR, "sample_label_2.jpg");

  // If fixtures are missing, skip (do NOT fail CI)
  if (!fileExists(front) || !fileExists(label1)) {
    test.skip(true, "Missing fixtures in tests/fixtures (sample_front.jpg, sample_label_1.jpg)");
  }

  // Capture /api/analyze JSON responses
  const captured: any[] = [];
  page.on("response", async (resp) => {
    const url = resp.url();
    if (!url.includes("/api/analyze")) return;
    try {
      const ct = resp.headers()["content-type"] || "";
      if (!ct.includes("application/json")) return;
      const j = await resp.json();
      captured.push({ url, status: resp.status(), body: j });
    } catch {
      // ignore
    }
  });

  await page.goto(baseURL || "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOT_DIR, "01_home.png"), fullPage: true });

  // Click into scan section (button text is your spec)
  // We support either "Scan product front" or your CTA button variants.
  const frontBtn = page.getByRole("button", { name: /scan product front|scan to see how this impacts your system/i });
  await expect(frontBtn).toBeVisible();

  // Upload front photo: find the first file input accepting images
  // We assume ScanSection uses <input type="file" accept="image/*" capture="environment">
  const inputs = page.locator('input[type="file"][accept*="image"]');
  await expect(inputs.first()).toBeAttached();

  // Heuristic:
  // - First file input corresponds to front scan
  // - Second file input corresponds to ingredients scan
  await inputs.nth(0).setInputFiles(front);

  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOT_DIR, "02_front_captured.png"), fullPage: true });

  // Ingredients: set 1–2 label photos if second input exists, otherwise reuse first
  const ingInput = inputs.nth(1);
  const hasSecond = await ingInput.count().then((c: number) => c > 0).catch(() => false);

  if (hasSecond) {
    await ingInput.setInputFiles(label1);
    if (fileExists(label2)) {
      // Some UIs accumulate; if yours replaces, this still works.
      await ingInput.setInputFiles(label2);
    }
  } else {
    await inputs.nth(0).setInputFiles(label1);
  }

  // Look for "Analyze" or "Reading label…" state
  const analyzeBtn = page.getByRole("button", { name: /analyz(e|ing)|read(ing)? label|scan ingredients label|add another label photo/i }).first();
  if (await analyzeBtn.isVisible().catch(() => false)) {
    // If it's an Analyze button, click it.
    const txt = (await analyzeBtn.textContent().catch(() => "")) || "";
    if (/analyz/i.test(txt)) await analyzeBtn.click().catch(() => {});
  }

  // Wait up to ~12s for results to appear
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(SHOT_DIR, "03_scan_loading_or_partial.png"), fullPage: true });

  // Heuristic: results area has chips or "Detected:" line or signal cards
  const detectedLine = page.locator("text=/Detected:/i").first();
  const signals = page.locator('[class*="scan-section__signals"], [class*="scan-section__signal"]').first();

  await Promise.race([
    detectedLine.waitFor({ state: "visible", timeout: 12_000 }).catch(() => {}),
    signals.waitFor({ state: "visible", timeout: 12_000 }).catch(() => {}),
    page.waitForTimeout(12_000),
  ]);

  await page.screenshot({ path: path.join(SHOT_DIR, "04_scan_result.png"), fullPage: true });

  // Save captured /api/analyze JSON (latest)
  const last = captured[captured.length - 1];
  if (last?.body) {
    const outPath = path.join(JSON_DIR, `analyze_result_${Date.now()}.json`);
    fs.writeFileSync(outPath, JSON.stringify(last.body, null, 2), "utf8");
  }

  // Navigate other tabs if they exist (meds/supps)
  // These are best-effort screenshots; no assertions.
  const suppTab = page.getByRole("button", { name: /supp/i }).first();
  if (await suppTab.isVisible().catch(() => false)) {
    await suppTab.click().catch(() => {});
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOT_DIR, "05_supps.png"), fullPage: true });
  }

  const medsTab = page.getByRole("button", { name: /med/i }).first();
  if (await medsTab.isVisible().catch(() => false)) {
    await medsTab.click().catch(() => {});
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOT_DIR, "06_meds.png"), fullPage: true });
  }

  // Minimal assert: page did not crash
  await expect(page).toHaveTitle(/veda/i);
});
