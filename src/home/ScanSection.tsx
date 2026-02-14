import { useState } from "react";
import type { InteractionResult } from "./stubs";
import { STUB_INTERACTION } from "./stubs";
import "./ScanSection.css";

/* TODO: Replace stub with real camera / barcode scan + AI reasoning. */
function stubScan(): Promise<InteractionResult> {
  return new Promise((res) => setTimeout(() => res(STUB_INTERACTION), 800));
}

const KIND_LABELS: Record<InteractionResult["kind"], string> = {
  interaction_detected: "Interaction detected",
  amplification_likely: "Amplification likely",
  timing_conflict: "Timing conflict",
  no_notable_interaction: "No notable interaction found",
};

const KIND_CLASSES: Record<InteractionResult["kind"], string> = {
  interaction_detected: "badge--warn",
  amplification_likely: "badge--warn",
  timing_conflict: "badge--caution",
  no_notable_interaction: "badge--clear",
};

export function ScanSection() {
  const [result, setResult] = useState<InteractionResult | null>(null);
  const [scanning, setScanning] = useState(false);

  async function handleScan() {
    setScanning(true);
    setResult(null);
    const r = await stubScan();
    setResult(r);
    setScanning(false);
  }

  return (
    <section className="scan-section" aria-label="Scan for interactions">
      <h2 className="scan-section__title">Avoiding Harm</h2>

      <button
        className="scan-section__cta"
        onClick={handleScan}
        disabled={scanning}
      >
        <span className="scan-section__icon" aria-hidden="true">
          {/* camera icon (inline SVG keeps deps at zero) */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </span>
        {scanning ? "Scanning…" : "Scan to see how this impacts your system"}
      </button>

      {result && (
        <div className="scan-section__result">
          <span className={`scan-section__badge ${KIND_CLASSES[result.kind]}`}>
            {KIND_LABELS[result.kind]}
          </span>
          <p className="scan-section__summary">{result.summary}</p>
        </div>
      )}
    </section>
  );
}
