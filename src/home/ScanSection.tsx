import { useMemo, useState } from "react";
import { compressImageDataUrl } from "@/lib/image";
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

  const entitiesByCategory = useMemo(() => {
    const cats = result?.normalized?.categories || {};
    const out: { label: string; items: string[] }[] = [];
    const order = ["Sweeteners", "Stimulants", "Sugars", "Vitamins", "Minerals", "Other"];
    for (const k of order) {
      const arr = Array.isArray(cats[k]) ? cats[k] : [];
      if (arr.length) out.push({ label: k, items: arr.map(String) });
    }
    // fallback: if only detectedEntities exists (stub mode)
    if (!out.length && Array.isArray(result?.normalized?.detectedEntities) && result.normalized.detectedEntities.length) {
      out.push({ label: "Detected", items: result.normalized.detectedEntities.map(String) });
    }
    return out;
  }, [result]);

  async function handleCapture(file: File, kind: "front" | "ingredients") {
    setError(null);
    const reader = new FileReader();
    const dataUrl: string = await new Promise((resolve, reject) => {
      reader.onerror = () => reject(new Error("Failed to read image"));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });

    // compress to avoid 413 and speed up uploads
    const compressed = await compressImageDataUrl(dataUrl, {
      maxW: kind === "front" ? 900 : 1200,
      maxH: kind === "front" ? 900 : 1400,
      quality: kind === "front" ? 0.72 : 0.78,
      mimeType: "image/jpeg",
    });

    if (kind === "front") {
      setFrontImage(compressed);
      setStep("front");
      // reset downstream state
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
      if (!r.ok) {
        throw new Error(json?.error || `HTTP ${r.status}`);
      }
      setResult(json);
      if (typeof json?.productName === "string") setProductName(json.productName);
      setStep("done");
    } catch (e: any) {
      setError(String(e?.message || e));
      setResult({
        ok: true,
        productName: null,
        normalized: { detectedEntities: [], categories: {} },
        signals: [
          {
            type: "no_notable_interaction",
            severity: "low",
            confidence: "low",
            headline: "NO NOTABLE INTERACTION PATTERN FOUND",
            explanation:
              "I couldn't read enough label text to classify this item reliably. This is interpretive and depends on dose, timing, and individual variability.",
            related: [],
          },
        ],
        meta: { mode: "stub" },
      });
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
              "scan-section__btn " + (canScanIngredients ? "scan-section__btn--accent" : "scan-section__btn--disabled")
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

        <div className="scan-section__hint">Most interaction patterns are identified from the ingredients label on the back.</div>

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
            <div className="scan-section__scannedHeader">
              <div className="scan-section__scannedCheck">✅</div>
              <div className="scan-section__scannedMeta">
                <div className="scan-section__scannedTitle">
                  <input
                    className="scan-section__nameInput"
                    value={productName || ""}
                    placeholder="Scanned item"
                    onChange={(e) => setProductName(e.target.value)}
                  />
                </div>
                <div className="scan-section__scannedSub">
                  {result?.meta?.mode === "openai" ? "Read from label" : "Couldn't read label reliably"}
                </div>
              </div>
              <details className="scan-section__photosToggle">
                <summary>Tap to view photos</summary>
                <div className="scan-section__photos">
                  {frontImage && <img src={frontImage} alt="front" />}
                  {ingredientsImage && <img src={ingredientsImage} alt="ingredients" />}
                </div>
              </details>
            </div>

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

            {Array.isArray(result.signals) &&
              result.signals.map((s: any, idx: number) => (
                <div className="scan-section__signal" key={idx}>
                  <div className={"scan-section__badge scan-section__badge--" + String(s.type || "")}>
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
