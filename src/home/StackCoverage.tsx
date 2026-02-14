import { useState, useMemo } from "react";
import { STUB_SUPPLEMENTS } from "./stubs";
import type { NutrientRow } from "./stubs";
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

  /* Aggregate NutrientRows across confirmed supplements */
  const rows = useMemo(() => {
    const map = new Map<string, NutrientRow>();
    for (const supp of STUB_SUPPLEMENTS) {
      if (!confirmed.has(supp.id)) continue;
      for (const n of supp.nutrients) {
        const existing = map.get(n.nutrientId);
        if (existing) {
          map.set(n.nutrientId, {
            ...existing,
            amountToday: existing.amountToday + n.amountToday,
          });
        } else {
          map.set(n.nutrientId, { ...n });
        }
      }
    }
    return Array.from(map.values());
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
          {rows.map((row) => {
            const pct = row.dailyReference > 0
              ? Math.round((row.amountToday / row.dailyReference) * 100)
              : 0;
            return (
              <li key={row.nutrientId} className="coverage__row">
                <div className="coverage__row-header">
                  <span className="coverage__nutrient">{row.name}</span>
                  <span className="coverage__amount">
                    {row.amountToday} {row.unit}
                  </span>
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
