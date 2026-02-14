import { useMemo, useState } from "react";
import { compressImageDataUrl } from "../lib/image";
import "./ScanSection.css";

type ScanStep = "idle" | "front" | "ingredients" | "done";

export default function ScanSection() {
  const [step, setStep] = useState<ScanStep>("idle");
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [ingredientsImage, setIngredientsImage] = useState<string | null>(null);
  const [productName, setProductName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const canScanIngredients = !!frontImage && !loading;

  /* ── Build chip groups from new response shape ── */

  const entitiesByCategory = useMemo(() => {
    if (!result) return [];
    const groups: { label: string; items: string[] }[] = [];

    // Sweeteners — authoritative source is additives.sweeteners
    const sweeteners: string[] = Array.isArray(result.additives?.sweeteners)
      ? result.additives.sweeteners.map(String)
      : [];
    if (sweeteners.length) groups.push({ label: "Sweeteners", items: sweeteners });

    // Stimulants — from entities + caffeine_mg fallback
    const stimulants = (Array.isArray(result.detectedEntities) ? result.detectedEntities : [])
      .filter((e: any) => e.category === "Stimulants")
      .map((e: any) => String(e.name));
    if (
      result.nutritionFacts?.caffeine_mg != null &&
      !stimulants.some((s: string) => s.toLowerCase() === "caffeine")
    ) {
      stimulants.push("Caffeine");
    }
    if (stimulants.length) groups.push({ label: "Stimulants", items: stimulants });

    // Sugars
    const sugars = (Array.isArray(result.detectedEntities) ? result.detectedEntities : [])
      .filter((e: any) => e.category === "Sugars")
      .map((e: any) => String(e.name));
    if (sugars.length) groups.push({ label: "Sugars", items: sugars });

    // Vitamins — only evidence-backed (server already filtered, but guard anyway)
    const vitamins = (Array.isArray(result.detectedEntities) ? result.detectedEntities : [])
      .filter((e: any) => e.category === "Vitamins" && Array.isArray(e.evidence) && e.evidence.length > 0)
      .map((e: any) => String(e.name));
    if (vitamins.length) groups.push({ label: "Vitamins", items: vitamins });

    // Minerals — only evidence-backed
    const minerals = (Array.isArray(result.detectedEntities) ? result.detectedEntities : [])
      .filter((e: any) => e.category === "Minerals" && Array.isArray(e.evidence) && e.evidence.length > 0)
      .map((e: any) => String(e.name));
    if (minerals.length) groups.push({ label: "Minerals", items: minerals });

    // Other
    const other = (Array.isArray(result.detectedEntities) ? result.detectedEntities : [])
      .filter((e: any) => e.category === "Other")
      .map((e: any) => String(e.name));
    if (other.length) groups.push({ label: "Other", items: other });

    return groups;
  }, [result]);

  /* ── "Detected:" summary line — prioritises sweeteners > caffeine > sugar > calories ── */

  const summaryLine = useMemo(() => {
    if (!result) return "";
    const parts: string[] = [];

    const sw: string[] = Array.isArray(result.additives?.sweeteners) ? result.additives.sweeteners : [];
    if (sw.length === 1) parts.push(`sweetener (${sw[0]})`);
    else if (sw.length > 1) parts.push(`sweeteners (${sw.length}): ${sw.join(", ")}`);

    const caffMg = result.nutritionFacts?.caffeine_mg;
    const hasCaffeineEntity = (Array.isArray(result.detectedEntities) ? result.detectedEntities : []).some(
      (e: any) => String(e.name).toLowerCase() === "caffeine",
    );
    if (caffMg != null) parts.push(`caffeine ${caffMg} mg`);
    else if (hasCaffeineEntity) parts.push("caffeine (approx)");

    const sugarG = result.nutritionFacts?.sugar_g;
    if (sugarG != null) parts.push(sugarG === 0 ? "sugar 0 g" : `sugar ${sugarG} g`);

    const cal = result.nutritionFacts?.calories;
    if (cal != null) parts.push(cal === 0 ? "0 cal" : `${cal} cal`);

    return parts.length ? parts.join(" · ") : "";
  }, [result]);

  /* ── Kind sub-label ── */

  const kindLabel = useMemo(() => {
    if (!result?.kind) return "";
    const map: Record<string, string> = {
      food_drink: "Food / Drink",
      supplement: "Supplement",
      medication: "Medication",
    };
    return map[result.kind] || "";
  }, [result]);

  /* ── Handlers ── */

  async function handleCapture(file: File, kind: "front" | "ingredients") {
    setError(null);
    const reader = new FileReader();
    const dataUrl: string = await new Promise((resolve, reject) => {
      reader.onerror = () => reject(new Error("Failed to read image"));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });

    const compressed = await compressImageDataUrl(dataUrl, {
      maxW: kind === "front" ? 900 : 1200,
      maxH: kind === "front" ? 900 : 1400,
      quality: kind === "front" ? 0.72 : 0.78,
      mimeType: "image/jpeg",
    });

    if (kind === "front") {
      setFrontImage(compressed);
      setStep("front");
      setIngredientsImage(null);
      setResult(null);
      setProductName("");
    } else {
      setIngredientsImage(compressed);
      setStep("ingredients");
    }
  }

  async function runAnalysis() {
    if (!frontImage || !ingredientsImage) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          frontImageDataUrl: frontImage,
          ingredientsImageDataUrl: ingredientsImage,
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || `HTTP ${r.status}`);
      setResult(json);
      setProductName(
        typeof json?.productName === "string" && json.productName.trim()
          ? json.productName
          : "(unnamed item)",
      );
      setStep("done");
    } catch (e: any) {
      setError(String(e?.message || e));
      setResult({
        ok: true,
        productName: null,
        kind: "unknown",
        detectedEntities: [],
        nutritionFacts: { calories: null, sugar_g: null, caffeine_mg: null },
        additives: { sweeteners: [], preservatives: [], acids: [] },
        signals: [
          {
            severity: "low",
            headline: "NO NOTABLE INTERACTION PATTERN FOUND",
            explanation:
              "I couldn't read enough label text to classify this item reliably. " +
              "This is interpretive and depends on dose, timing, and individual variability.",
            related: [],
          },
        ],
        meta: { mode: "stub", notes: ["client-side fallback"] },
      });
      setProductName("(unnamed item)");
      setStep("done");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep("idle");
    setFrontImage(null);
    setIngredientsImage(null);
    setResult(null);
    setError(null);
    setProductName("");
  }

  /* ── Render ── */

  const modeLabel =
    result?.meta?.mode === "openai" ? "Read from label" : "Couldn't read label reliably";
  const subText = kindLabel ? `${modeLabel} · ${kindLabel}` : modeLabel;

  return (
    <section className="scan-section">
      <div className="scan-section__card">
        <div className="scan-section__title">Scan to see how this impacts your system</div>

        <div className="scan-section__ctaRow">
          <label className="scan-section__btn scan-section__btn--primary">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                e.target.value = "";
                handleCapture(f, "front");
              }}
            />
            {frontImage ? "Re-scan product front" : "Scan product front"}
          </label>

          <label
            className={
              "scan-section__btn " +
              (canScanIngredients ? "scan-section__btn--accent" : "scan-section__btn--disabled")
            }
            title={canScanIngredients ? "" : "Scan the front first"}
          >
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={!canScanIngredients}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                e.target.value = "";
                handleCapture(f, "ingredients");
              }}
            />
            {ingredientsImage ? "Re-scan ingredients label" : "Scan ingredients label"}
          </label>
        </div>

        <div className="scan-section__hint">
          Most interaction patterns are identified from the ingredients label on the back.
        </div>

        <div className="scan-section__status">
          <div>Front captured {frontImage ? "✅" : "—"}</div>
          <div>Ingredients captured {ingredientsImage ? "✅" : "—"}</div>
        </div>

        {frontImage && ingredientsImage && step !== "done" && (
          <button
            className="scan-section__btn scan-section__btn--run"
            disabled={loading}
            onClick={runAnalysis}
          >
            {loading ? "Reading ingredients..." : "Analyze"}
          </button>
        )}

        {error && <div className="scan-section__error">{error}</div>}

        {step === "done" && result && (
          <div className="scan-section__result">
            {/* ── Scanned header ── */}
            <div className="scan-section__scannedHeader">
              <div className="scan-section__scannedCheck">✅</div>
              <div className="scan-section__scannedMeta">
                <div className="scan-section__scannedTitle">
                  <input
                    className="scan-section__nameInput"
                    value={productName}
                    placeholder="(unnamed item)"
                    onChange={(e) => setProductName(e.target.value)}
                  />
                </div>
                <div className="scan-section__scannedSub">{subText}</div>
              </div>
              <details className="scan-section__photosToggle">
                <summary>Tap to view photos</summary>
                <div className="scan-section__photos">
                  {frontImage && <img src={frontImage} alt="front" />}
                  {ingredientsImage && <img src={ingredientsImage} alt="ingredients" />}
                </div>
              </details>
            </div>

            {/* ── "Detected:" summary ── */}
            {summaryLine && (
              <div className="scan-section__detectedLine">
                <strong>Detected:</strong> {summaryLine}
              </div>
            )}

            {/* ── Chip groups ── */}
            {entitiesByCategory.length > 0 && (
              <div className="scan-section__entities">
                {entitiesByCategory.map((c) => (
                  <div key={c.label} className="scan-section__entityGroup">
                    <div className="scan-section__entityLabel">{c.label}</div>
                    <div className="scan-section__entityRow">
                      {c.items.map((e) => (
                        <span className="scan-section__entity" key={c.label + ":" + e}>
                          {e}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Signal cards (severity-based) ── */}
            {Array.isArray(result.signals) &&
              result.signals.map((s: any, idx: number) => (
                <div className="scan-section__signal" key={idx}>
                  <div
                    className={
                      "scan-section__badge scan-section__badge--" + String(s.severity || "low")
                    }
                  >
                    {String(s.headline || "").toUpperCase()}
                  </div>
                  <div className="scan-section__explain">{String(s.explanation || "")}</div>
                  {Array.isArray(s.related) && s.related.length > 0 && (
                    <div className="scan-section__related">Related: {s.related.join(", ")}</div>
                  )}
                </div>
              ))}

            <button className="scan-section__btn scan-section__btn--secondary" onClick={reset}>
              Scan another item
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
