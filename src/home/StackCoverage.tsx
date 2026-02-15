import { useState, useMemo, useCallback } from "react";
import type { NutrientRow } from "./stubs";
import { loadLS, saveLS } from "../lib/persist";
import "./StackCoverage.css";

const SUPPS_KEY = "veda.supps.v1";
const TAKEN_KEY = "veda.supps.taken.v1";

/** Minimal shape we need from a saved supplement. */
type SavedSupp = {
  id: string;
  displayName: string;
  nutrients: NutrientRow[];
};

function coverageColor(pct: number): string {
  if (pct < 25) return "var(--veda-red)";
  if (pct < 75) return "var(--veda-orange)";
  if (pct <= 100) return "var(--veda-green)";
  return "var(--veda-magenta)"; // >100 % — signals redundancy, not danger
}

export function StackCoverage() {
  const [supps] = useState<SavedSupp[]>(() => {
    const raw = loadLS<any[]>(SUPPS_KEY, []);
    // Ensure each entry has the fields we need
    return raw
      .filter((s) => s && typeof s.id === "string")
      .map((s) => ({
        id: s.id,
        displayName: s.displayName || "Unnamed",
        nutrients: Array.isArray(s.nutrients) ? s.nutrients : [],
      }));
  });

  const [taken, setTaken] = useState<Record<string, boolean>>(() =>
    loadLS<Record<string, boolean>>(TAKEN_KEY, {})
  );

  const toggle = useCallback((id: string) => {
    setTaken((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveLS(TAKEN_KEY, next);
      return next;
    });
  }, []);

  /* Aggregate NutrientRows across taken supplements */
  const rows = useMemo(() => {
    const map = new Map<string, NutrientRow>();
    for (const supp of supps) {
      if (!taken[supp.id]) continue;
      for (const n of supp.nutrients) {
        if (!n || !n.nutrientId) continue;
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
  }, [supps, taken]);

  const anyTaken = supps.some((s) => taken[s.id]);

  return (
    <section className="coverage" aria-label="Stack coverage today">
      <h3 className="coverage__title">Stack coverage (today)</h3>

      {supps.length === 0 && (
        <p className="coverage__empty">
          Add supplements in the Supplements tab to see coverage here.
        </p>
      )}

      {/* Confirmation chips */}
      {supps.length > 0 && (
        <div className="coverage__chips">
          {supps.map((s) => {
            const active = !!taken[s.id];
            return (
              <button
                key={s.id}
                className={`coverage__chip ${active ? "coverage__chip--active" : ""}`}
                onClick={() => toggle(s.id)}
                aria-pressed={active}
              >
                {active ? "✓" : "○"} Taken today — {s.displayName}
              </button>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {supps.length > 0 && !anyTaken && (
        <p className="coverage__empty">
          Tap supplements you've taken to see today's totals
        </p>
      )}

      {/* Nutrient bars */}
      {anyTaken && (
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
