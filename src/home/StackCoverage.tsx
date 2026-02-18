import { useState, useMemo, useCallback, useEffect } from "react";
import type { NutrientRow } from "./stubs";
import { loadLS, saveLS } from "../lib/persist";
import type { ItemInsights } from "../shared/AddScannedItemModal";
import "./StackCoverage.css";

const SUPPS_KEY = "veda.supps.v1";
const TAKEN_KEY = "veda.supps.taken.v1";

type TakenStore = { date: string; flags: Record<string, boolean> };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function loadTakenToday(): Record<string, boolean> {
  const raw = loadLS<TakenStore | Record<string, boolean> | null>(TAKEN_KEY, null);
  if (!raw) return {};
  // New format with date
  if (typeof (raw as TakenStore).date === "string") {
    const store = raw as TakenStore;
    if (store.date === todayStr()) return store.flags;
    return {};
  }
  // Legacy format (no date) — treat as today for migration
  return raw as Record<string, boolean>;
}

function saveTakenToday(flags: Record<string, boolean>) {
  const store: TakenStore = { date: todayStr(), flags };
  saveLS(TAKEN_KEY, store);
}

/** Minimal shape we need from a saved supplement. */
type SavedSupp = {
  id: string;
  displayName: string;
  nutrients: NutrientRow[];
  ingredientsList?: string[];
  labelTranscription?: string | null;
};

function coverageColor(pct: number): string {
  if (pct < 25) return "var(--veda-red)";
  if (pct < 75) return "var(--veda-orange)";
  if (pct <= 100) return "var(--veda-green)";
  return "var(--veda-magenta)";
}

function riskColor(risk: string) {
  if (risk === "high") return "var(--veda-red, #e74c3c)";
  if (risk === "medium") return "var(--veda-orange, #e67e22)";
  return "var(--veda-green, #2ecc71)";
}

function loadSupps(): SavedSupp[] {
  const raw = loadLS<any[]>(SUPPS_KEY, []);
  return raw
    .filter((s) => s && typeof s.id === "string")
    .map((s) => ({
      id: s.id,
      displayName: s.displayName || "Unnamed",
      nutrients: Array.isArray(s.nutrients) ? s.nutrients : [],
      ingredientsList: Array.isArray(s.ingredientsList) ? s.ingredientsList : [],
      labelTranscription: s.labelTranscription ?? null,
    }));
}

export function StackCoverage() {
  const [supps, setSupps] = useState<SavedSupp[]>(() => loadSupps());

  const [taken, setTaken] = useState<Record<string, boolean>>(() =>
    loadTakenToday()
  );

  const [stackInsight, setStackInsight] = useState<ItemInsights | null>(null);

  useEffect(() => {
    const refresh = () => {
      setSupps(loadSupps());
      setTaken(loadTakenToday());
    };
    window.addEventListener("veda:synced", refresh);
    window.addEventListener("veda:supps-updated", refresh);
    return () => {
      window.removeEventListener("veda:synced", refresh);
      window.removeEventListener("veda:supps-updated", refresh);
    };
  }, []);

  const toggle = useCallback((id: string) => {
    setTaken((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveTakenToday(next);
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

  const takenSupps = useMemo(
    () => supps.filter((s) => taken[s.id]),
    [supps, taken]
  );

  const anyTaken = takenSupps.length > 0;

  // Fetch stack-level insight when taken supplements change
  useEffect(() => {
    if (!anyTaken) {
      setStackInsight(null);
      return;
    }
    let cancelled = false;
    const items = takenSupps.map((s) => ({
      id: s.id,
      displayName: s.displayName,
      nutrients: s.nutrients,
      ingredientsList: s.ingredientsList ?? [],
      labelTranscription: s.labelTranscription ?? null,
    }));

    fetch("/api/advise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json?.ok) return;
        setStackInsight({
          summary: json.summary || "",
          overlaps: Array.isArray(json.overlaps) ? json.overlaps : [],
          notes: Array.isArray(json.notes) ? json.notes : [],
        });
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [anyTaken, takenSupps]);

  const hasContent = supps.length > 0 && anyTaken;

  return (
    <section className="coverage" aria-label="Today's Supplement Balance">
      <details className="coverage__details" open={hasContent}>
        <summary className="coverage__summary">
          <h3 className="coverage__title">Today's Supplement Balance</h3>
        </summary>

      {supps.length === 0 && (
        <p className="coverage__empty">
          Supplement coverage appears here once added.
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
          Tap supplements you've taken to see today's coverage
        </p>
      )}

      {/* Nutrient bars */}
      {anyTaken && (
        <ul className="coverage__list">
          {rows.map((row) => {
            const pct = (row.dailyReference != null && row.dailyReference > 0)
              ? Math.round((row.amountToday / row.dailyReference) * 100)
              : null;
            return (
              <li key={row.nutrientId} className="coverage__row">
                <div className="coverage__row-header">
                  <span className="coverage__nutrient">{row.name}</span>
                  <span className="coverage__amount">
                    {row.amountToday} {row.unit}
                  </span>
                  {pct != null ? (
                    <span className="coverage__pct" style={{ color: coverageColor(pct) }}>
                      {pct}%
                    </span>
                  ) : (
                    <span className="coverage__pct" style={{ opacity: 0.5 }}>—</span>
                  )}
                </div>
                {pct != null && (
                  <div className="coverage__track">
                    <div
                      className="coverage__fill"
                      style={{
                        width: `${Math.min(pct, 100)}%`,
                        background: coverageColor(pct),
                      }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Stack insight */}
      {stackInsight && (stackInsight.summary || stackInsight.overlaps.length > 0) && (
        <div className="coverage__insight">
          <div className="coverage__insight-title">Stack insight</div>
          {stackInsight.summary && (
            <div className="coverage__insight-summary">{stackInsight.summary}</div>
          )}
          {stackInsight.overlaps.slice(0, 2).map((o, i) => (
            <div className="coverage__insight-overlap" key={`${o.key}-${i}`}>
              <span
                className="coverage__insight-badge"
                style={{ background: riskColor(o.risk), opacity: 0.85 }}
              >
                {o.risk}
              </span>
              <span className="coverage__insight-what">{o.what}</span>
            </div>
          ))}
        </div>
      )}
      </details>
    </section>
  );
}
