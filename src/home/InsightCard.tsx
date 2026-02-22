import { useState } from "react";
import type { HomeInsight, InsightSeverity } from "../types/insights";
import MeaningBlock from "./MeaningBlock";

function severityLabel(sev: InsightSeverity) {
  switch (sev) {
    case "ok": return "All good";
    case "info": return "Good to know";
    case "caution": return "Be mindful";
    case "attention": return "Pay attention";
  }
}

function cardClass(sev: InsightSeverity) {
  if (sev === "caution") return "insight-card insight-card--caution";
  if (sev === "attention") return "insight-card insight-card--attention";
  return "insight-card";
}

export default function InsightCard({ insight }: { insight: HomeInsight }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cardClass(insight.severity)}>
      <button
        type="button"
        className="insight-card__toggle"
        onClick={() => setOpen(!open)}
      >
        <div>
          <div className="insight-card__title">{insight.title}</div>
          <div className="insight-card__severity">{severityLabel(insight.severity)}</div>

          {insight.delta && (
            <div className="insight-card__delta">
              <strong>Compared to current:</strong>{" "}
              {insight.delta.newSignals} new signal{insight.delta.newSignals === 1 ? "" : "s"}
            </div>
          )}
        </div>

        <span className="insight-card__chevron">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="insight-card__body">
          {insight.delta?.summaryLines?.length ? (
            <div className="insight-block">
              <div className="insight-block__label">What changed</div>
              <ul className="insight-block__list">
                {insight.delta.summaryLines.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          ) : null}

          <div className="insight-block">
            <div className="insight-block__label">What we see</div>
            <ul className="insight-block__list">
              {insight.step.whatWeSee.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </div>

          <div className="insight-block">
            <div className="insight-block__label">Why it matters</div>
            <ul className="insight-block__list">
              {insight.step.whyItMatters.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </div>

          <div className="insight-block">
            <div className="insight-block__label">What this means</div>
            <MeaningBlock meaning={insight.step.meaning} />
          </div>

          {insight.step.consider?.length ? (
            <div className="insight-block">
              <div className="insight-block__label">What to consider</div>
              <ul className="insight-block__list">
                {insight.step.consider.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
