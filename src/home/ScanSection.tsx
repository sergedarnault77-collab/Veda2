import { useState } from "react";
import type { ScanStage, Signal, AnalyzeResponse } from "./stubs";
import { STUB_ANALYZE_RESPONSE } from "./stubs";
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

export function ScanSection() {
  const [stage, setStage] = useState<ScanStage>("idle");
  const [signals, setSignals] = useState<Signal[]>([]);
  const [entities, setEntities] = useState<string[]>([]);
  const [analysing, setAnalysing] = useState(false);

  async function handleIngredients() {
    setStage("ingredients");
    setAnalysing(true);
    // TODO: Replace placeholder text with real OCR / camera output.
    const data = await analyzeLabel("magnesium glycinate 400mg, vitamin d 5000iu");
    setSignals(data.signals);
    setEntities(data.normalized.detectedEntities);
    setAnalysing(false);
  }

  return (
    <section className="scan-section" aria-label="Scan for interactions">
      <h2 className="scan-section__title">Avoiding Harm</h2>

      <p className="scan-section__headline">
        Scan to see how this impacts your system
      </p>

      <div className="scanActions">
        <button
          className="scanBtn"
          onClick={() => {
            setSignals([]);
            setEntities([]);
            setStage("front");
          }}
        >
          Scan product front
        </button>

        <button
          className="scanBtn primary"
          disabled={stage === "idle" || analysing}
          onClick={handleIngredients}
          title={stage === "idle" ? "Scan the front first" : undefined}
        >
          {analysing ? "Reading ingredients…" : "Scan ingredients label"}
        </button>

        <p className="scanHint">
          Most interaction patterns are identified from the ingredients label on
          the back.
        </p>
      </div>

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
