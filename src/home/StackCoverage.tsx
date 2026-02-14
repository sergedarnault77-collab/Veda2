import { useState, useMemo } from "react";
import { STUB_SUPPLEMENTS, DAILY_REFERENCE } from "./stubs";
import type { Supplement } from "./stubs";
import "./StackCoverage.css";

function coverageColor(pct: number): string {
  if (pct < 25) return "var(--veda-red)";
  if (pct < 75) return "var(--veda-orange)";
  if (pct <= 100) return "var(--veda-green)";
  return "var(--veda-magenta)"; // >100 % — signals redundancy, not danger
}

export function StackCoverage() {
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setConfirmed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /* Aggregate nutrients only from confirmed supplements */
  const totals = useMemo(() => {
    const agg: Record<string, number> = {};
    STUB_SUPPLEMENTS.forEach((s: Supplement) => {
      if (!confirmed.has(s.id)) return;
      for (const [nutrient, amount] of Object.entries(s.nutrients)) {
        agg[nutrient] = (agg[nutrient] ?? 0) + amount;
      }
    });
    return agg;
  }, [confirmed]);

  const noneConfirmed = confirmed.size === 0;

  return (
    <section className="coverage" aria-label="Stack coverage today">
      <h3 className="coverage__title">Stack coverage (today)</h3>

      {/* Confirmation chips */}
      <div className="coverage__chips">
        {STUB_SUPPLEMENTS.map((s) => {
          const active = confirmed.has(s.id);
          return (
            <button
              key={s.id}
              className={`coverage__chip ${active ? "coverage__chip--active" : ""}`}
              onClick={() => toggle(s.id)}
              aria-pressed={active}
            >
              {active ? "✓" : "○"} Taken today — {s.name}
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {noneConfirmed && (
        <p className="coverage__empty">
          Tap supplements you've taken to see today's totals
        </p>
      )}

      {/* Nutrient bars */}
      {!noneConfirmed && (
        <ul className="coverage__list">
          {Object.entries(totals).map(([nutrient, amount]) => {
            const ref = DAILY_REFERENCE[nutrient];
            const pct = ref ? Math.round((amount / ref) * 100) : 0;
            return (
              <li key={nutrient} className="coverage__row">
                <div className="coverage__row-header">
                  <span className="coverage__nutrient">{nutrient}</span>
                  <span className="coverage__pct" style={{ color: coverageColor(pct) }}>
                    {pct}%
                  </span>
                </div>
                <div className="coverage__track">
                  <div
                    className="coverage__fill"
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      background: coverageColor(pct),
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
