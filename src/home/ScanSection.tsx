import { useMemo, useRef, useState } from "react";
import { compressImageDataUrl } from "../lib/image";
import { withMinDelay } from "../lib/minDelay";
import LoadingBanner from "../shared/LoadingBanner";
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

  const ingredientsInputRef = useRef<HTMLInputElement>(null);

  const canScanIngredients = !!frontImage && !loading;

  /* ── Build chip groups from normalized.categories ── */

  const entitiesByCategory = useMemo(() => {
    const cats: Record<string, string[]> = result?.normalized?.categories || {};
    const groups: { label: string; items: string[] }[] = [];
    const order = ["Sweeteners", "Stimulants", "Sugars", "Vitamins", "Minerals", "Supplements", "Other"];
    for (const k of order) {
      const arr = Array.isArray(cats[k]) ? cats[k] : [];
      if (arr.length) groups.push({ label: k, items: arr.map(String) });
    }
    if (
      !groups.length &&
      Array.isArray(result?.normalized?.detectedEntities) &&
      result.normalized.detectedEntities.length
    ) {
      groups.push({ label: "Detected", items: result.normalized.detectedEntities.map(String) });
    }
    return groups;
  }, [result]);

  /* ── "Detected:" summary line ── */

  const summaryLine = useMemo(() => {
    const cats: Record<string, string[]> = result?.normalized?.categories || {};
    const parts: string[] = [];

    const sw = Array.isArray(cats.Sweeteners) ? cats.Sweeteners : [];
    if (sw.length === 1) parts.push(`sweetener (${sw[0]})`);
    else if (sw.length > 1) parts.push(`sweeteners (${sw.length}): ${sw.join(", ")}`);

    const stim = Array.isArray(cats.Stimulants) ? cats.Stimulants : [];
    if (stim.some((s) => s.toLowerCase().includes("caffeine"))) {
      parts.push("caffeine");
    } else if (stim.length) {
      parts.push(stim.join(", ").toLowerCase());
    }

    const sugars = Array.isArray(cats.Sugars) ? cats.Sugars : [];
    if (sugars.length) parts.push(sugars.join(", "));

    const cal = Array.isArray(cats.Calories) ? cats.Calories : [];
    if (cal.length) parts.push(cal.join(", "));

    return parts.length ? parts.join(" \u00b7 ") : "";
  }, [result]);

  /* ── Rescan hint ── */
  const needsRescan = result?.meta?.needsRescan === true;
  const rescanHint =
    result?.meta?.rescanHint ||
    "Take a closer photo of the ingredients label.";

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
      const json = await withMinDelay(
        fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            frontImageDataUrl: frontImage,
            ingredientsImageDataUrl: ingredientsImage,
          }),
        }).then(async (r) => {
          const j = await r.json();
          if (!j.ok) throw new Error(j?.error || `HTTP ${r.status}`);
          return j;
        }),
        700,
      );
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
        normalized: { detectedEntities: [], categories: {} },
        signals: [
          {
            type: "no_read",
            severity: "low",
            headline: "Couldn't read label reliably",
            explanation:
              "I couldn't read enough label text to classify this item reliably. " +
              "This is interpretive and depends on dose, timing, and individual variability.",
            confidence: 0.1,
            relatedEntities: [],
          },
        ],
        meta: {
          mode: "stub",
          reason: "client-side fallback",
          transcriptionConfidence: 0,
          needsRescan: true,
          rescanHint: "Couldn't read the label reliably. Take a closer photo of the ingredients/nutrition panel.",
        },
      });
      setProductName("(unnamed item)");
      setStep("done");
    } finally {
      setLoading(false);
    }
  }

  function triggerRescanIngredients() {
    ingredientsInputRef.current?.click();
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
              ref={ingredientsInputRef}
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
          <div>Front captured {frontImage ? "\u2705" : "\u2014"}</div>
          <div>Ingredients captured {ingredientsImage ? "\u2705" : "\u2014"}</div>
        </div>

        {/* Loading state */}
        {loading && (
          <LoadingBanner
            title="Reading label\u2026"
            subtitle="Extracting ingredients and nutrients"
            tone="info"
          />
        )}

        {frontImage && ingredientsImage && step !== "done" && !loading && (
          <button
            className="scan-section__btn scan-section__btn--run"
            onClick={runAnalysis}
          >
            Analyze
          </button>
        )}

        {error && <div className="scan-section__error">{error}</div>}

        {step === "done" && result && (
          <div className="scan-section__result">

            {/* Rescan banner */}
            {needsRescan && (
              <>
                <LoadingBanner
                  tone="warn"
                  title="Photo is hard to read"
                  subtitle={rescanHint}
                />
                <button
                  className="scan-section__btn scan-section__btn--rescan"
                  onClick={triggerRescanIngredients}
                >
                  Re-scan ingredients label
                </button>
              </>
            )}

            {/* ── Scanned header ── */}
            <div className="scan-section__scannedHeader">
              <div className="scan-section__scannedCheck">{needsRescan ? "\u26a0\ufe0f" : "\u2705"}</div>
              <div className="scan-section__scannedMeta">
                <div className="scan-section__scannedTitle">
                  <input
                    className="scan-section__nameInput"
                    value={productName}
                    placeholder="(unnamed item)"
                    onChange={(e) => setProductName(e.target.value)}
                  />
                </div>
                <div className="scan-section__scannedSub">{modeLabel}</div>
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
                  {Array.isArray(s.relatedEntities) && s.relatedEntities.length > 0 && (
                    <div className="scan-section__related">
                      Related: {s.relatedEntities.join(", ")}
                    </div>
                  )}
                </div>
              ))}

            <button className="scan-section__btn scan-section__btn--secondary" onClick={reset}>
              Scan another item
            </button>

            {/* Debug: show why we fell back to stub */}
            {result?.meta && (
              <div className="scan-section__debug">
                mode={result.meta.mode} · conf={result.meta.transcriptionConfidence ?? "n/a"} · rescan={String(result.meta.needsRescan)} · reason={result.meta.reason || "n/a"}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
