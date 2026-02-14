import { useRef, useState } from "react";
import type { Signal, AnalyzeResponse } from "./stubs";
import { STUB_ANALYZE_RESPONSE } from "./stubs";
import { fileToDataUrl } from "../lib/persist";
import "./ScanSection.css";

/** Call /api/analyze; fall back to stub data in local dev. */
async function analyzeLabel(inputText: string): Promise<AnalyzeResponse> {
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputText }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as AnalyzeResponse;
  } catch {
    // TODO: Remove fallback once Vercel deployment is live.
    return {
      ...STUB_ANALYZE_RESPONSE,
      meta: { mode: "stub", timestampISO: new Date().toISOString() },
    };
  }
}

const SEVERITY_CLASS: Record<Signal["severity"], string> = {
  likely: "badge--warn",
  possible: "badge--caution",
  info: "badge--clear",
};

export default function ScanSection() {
  // ── Camera capture state ──
  const [frontImageUrl, setFrontImageUrl] = useState<string | null>(null);
  const [ingredientsImageUrl, setIngredientsImageUrl] = useState<string | null>(null);

  const frontInputRef = useRef<HTMLInputElement | null>(null);
  const ingredientsInputRef = useRef<HTMLInputElement | null>(null);

  // ── Text-based analyze state (kept separate until OCR is wired) ──
  const [signals, setSignals] = useState<Signal[]>([]);
  const [entities, setEntities] = useState<string[]>([]);
  const [analysing, setAnalysing] = useState(false);

  async function onPickFrontFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setFrontImageUrl(dataUrl);
    e.target.value = "";
  }

  async function onPickIngredientsFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setIngredientsImageUrl(dataUrl);
    e.target.value = "";
    // TODO: Once OCR is wired, extract text from image and call analyzeLabel().
  }

  /** Temporary: text-based analyze (until OCR replaces it). */
  async function handleManualAnalyze() {
    setAnalysing(true);
    const data = await analyzeLabel("magnesium glycinate 400mg, vitamin d 5000iu");
    setSignals(data.signals);
    setEntities(data.normalized.detectedEntities);
    setAnalysing(false);
  }

  const canScanIngredients = !!frontImageUrl;

  return (
    <section className="scan-section" aria-label="Scan for interactions">
      {/* Hidden camera inputs */}
      <input
        ref={frontInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={onPickFrontFile}
      />
      <input
        ref={ingredientsInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={onPickIngredientsFile}
      />

      <div className="scan-section__header">
        <h2>Avoiding harm</h2>
        <p className="scan-section__sub">
          Most interaction patterns are identified from the ingredients label on
          the back.
        </p>
      </div>

      <div className="scan-section__actions">
        <button
          className="scan-section__btn"
          onClick={() => frontInputRef.current?.click()}
        >
          Scan product front
        </button>

        <button
          className={`scan-section__btn ${canScanIngredients ? "is-primary" : "is-disabled"}`}
          disabled={!canScanIngredients}
          onClick={() => ingredientsInputRef.current?.click()}
          title={!canScanIngredients ? "Scan the front first" : ""}
        >
          Scan ingredients label
        </button>
      </div>

      <div className="scan-section__status">
        <div>{frontImageUrl ? "Front captured ✅" : "Front: not captured yet"}</div>
        <div>{ingredientsImageUrl ? "Ingredients captured ✅" : "Ingredients: not captured yet"}</div>
      </div>

      {/* Tiny previews so you can verify on phone */}
      <div className="scan-section__previews">
        {frontImageUrl && (
          <img src={frontImageUrl} alt="Front preview" style={{ width: 120, borderRadius: 12 }} />
        )}
        {ingredientsImageUrl && (
          <img src={ingredientsImageUrl} alt="Ingredients preview" style={{ width: 120, borderRadius: 12 }} />
        )}
      </div>

      {/* IMPORTANT: do not run /api/analyze yet from photos (needs OCR).
          Temporary manual trigger for the text-based flow. */}
      {ingredientsImageUrl && signals.length === 0 && (
        <button
          className="scan-section__btn is-primary"
          style={{ marginTop: 12, width: "100%" }}
          onClick={handleManualAnalyze}
          disabled={analysing}
        >
          {analysing ? "Analysing…" : "Run analysis (stub)"}
        </button>
      )}

      {/* Detected entities */}
      {entities.length > 0 && (
        <div className="scan-section__entities">
          {entities.map((e) => (
            <span key={e} className="scan-section__entity">{e}</span>
          ))}
        </div>
      )}

      {/* Signals from /api/analyze */}
      {signals.length > 0 && (
        <div className="scan-section__signals">
          {signals.map((s, i) => (
            <div key={i} className="scan-section__result">
              <span className={`scan-section__badge ${SEVERITY_CLASS[s.severity]}`}>
                {s.headline}
              </span>
              <p className="scan-section__summary">{s.explanation}</p>
              {s.related && s.related.length > 0 && (
                <p className="scan-section__related">
                  Related: {s.related.join(", ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
