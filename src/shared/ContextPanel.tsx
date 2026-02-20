import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import "./ContextPanel.css";

export interface ExplainSignal {
  kind: string;
  label: string;
  detail: string;
  sources?: string[];
  nutrients?: Array<{ name: string; amountToday: number; unit: string }>;
}

interface ExplainResult {
  whatWasDetected: string[];
  whyItMatters: string[];
  whatPeopleDo: string[];
  disclaimer: string;
}

interface Props {
  signal: ExplainSignal;
  onClose: () => void;
}

export default function ContextPanel({ signal, onClose }: Props) {
  const [result, setResult] = useState<ExplainResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fallbackResult = {
      whatWasDetected: [signal.detail || `${signal.label} was flagged.`],
      whyItMatters: ["Context depends on dose, timing, and individual factors."],
      whatPeopleDo: ["Some people review overlapping sources when flagged."],
      disclaimer:
        "This is not medical advice. Veda does not diagnose or recommend treatment. For personal health decisions, consult a professional.",
    };

    apiFetch("/api/explain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signal }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.ok) {
          setResult({
            whatWasDetected: json.whatWasDetected || [],
            whyItMatters: json.whyItMatters || [],
            whatPeopleDo: json.whatPeopleDo || [],
            disclaimer: json.disclaimer || "",
          });
        } else {
          setResult(fallbackResult);
        }
      })
      .catch(() => {
        if (!cancelled) setResult(fallbackResult);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [signal]);

  return (
    <div className="ctx-backdrop" onClick={onClose}>
      <div className="ctx-panel" onClick={(e) => e.stopPropagation()}>
        <button className="ctx-panel__close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <h3 className="ctx-panel__heading">What this means</h3>
        <div className="ctx-panel__signal-label">{signal.label}</div>

        {loading ? (
          <div className="ctx-panel__loading">
            <div className="ctx-panel__spinner" />
            Analyzing context…
          </div>
        ) : result ? (
          <div className="ctx-panel__sections">
            {result.whatWasDetected.length > 0 && (
              <section className="ctx-section">
                <h4 className="ctx-section__title">What was detected</h4>
                <ul className="ctx-section__list">
                  {result.whatWasDetected.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </section>
            )}

            {result.whyItMatters.length > 0 && (
              <section className="ctx-section">
                <h4 className="ctx-section__title">Why this matters</h4>
                <ul className="ctx-section__list">
                  {result.whyItMatters.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </section>
            )}

            {result.whatPeopleDo.length > 0 && (
              <section className="ctx-section">
                <h4 className="ctx-section__title">What people typically do</h4>
                <ul className="ctx-section__list">
                  {result.whatPeopleDo.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </section>
            )}

            {result.disclaimer && (
              <div className="ctx-panel__disclaimer">{result.disclaimer}</div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
