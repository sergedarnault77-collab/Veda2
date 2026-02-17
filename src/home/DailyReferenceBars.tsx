import { useState } from "react";
import { STUB_EXPOSURE } from "./stubs";
import "./DailyReferenceBars.css";

export function DailyReferenceBars() {
  const [showTooltip, setShowTooltip] = useState(false);

  /* Arbitrary visual max per metric for bar width. Not a goal — just a scale. */
  const visualMax: Record<string, number> = {
    "Added sugars (today)": 50,
    "Sweetener types detected": 10,
    "Calories from scanned items": 1000,
    "Caffeine exposure": 400,
  };

  return (
    <section className="exposure" aria-label="Daily exposure summary">
      {/* Status header */}
      <div className="exposure__signal">Overall signal: Balanced</div>
      <div className="exposure__interpretation">No unusual stacking detected today</div>

      <div className="exposure__header">
        <h3 className="exposure__title">What to notice today</h3>
        <button
          className="exposure__info"
          aria-label="More info"
          onClick={() => setShowTooltip((v) => !v)}
        >
          i
        </button>
      </div>

      {showTooltip && (
        <p className="exposure__tooltip">
          This reflects only products you scanned — not everything you consumed.
        </p>
      )}

      <ul className="exposure__list">
        {STUB_EXPOSURE.map((e) => {
          const max = visualMax[e.label] ?? 100;
          const pct = Math.min((e.value / max) * 100, 100);
          return (
            <li key={e.label} className="exposure__item">
              <div className="exposure__label-row">
                <span className="exposure__label">{e.label}</span>
                <span className="exposure__value">
                  {e.value} {e.unit}
                </span>
              </div>
              <div className="exposure__track">
                <div
                  className="exposure__fill"
                  style={{ width: `${pct}%`, background: e.color }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="exposure__scope">Scanned items only — not full daily intake.</div>
    </section>
  );
}
