import { useState, useMemo, useCallback, useEffect } from "react";
import { loadLS, saveLS } from "../lib/persist";
import { loadUser } from "../lib/auth";
import {
  computeDailyNutrients,
  ageRangeToAgeBucket,
  bioSexToSex,
  nutrientRowsToIntakeLines,
  hasEnoughDietAnswers,
} from "../lib/nutrition";
import type { NutrientComputed, IntakeLine, DietAnswers, FoodCoverage } from "../lib/nutrition";
import type { ItemInsights } from "../shared/AddScannedItemModal";
import "./StackCoverage.css";

const SUPPS_KEY = "veda.supps.v1";
const TAKEN_KEY = "veda.supps.taken.v1";
const DIET_KEY = "veda.diet.answers.v1";

type TakenStore = { date: string; flags: Record<string, boolean> };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function loadTakenToday(): Record<string, boolean> {
  const raw = loadLS<TakenStore | Record<string, boolean> | null>(TAKEN_KEY, null);
  if (!raw) return {};
  if (typeof (raw as TakenStore).date === "string") {
    const store = raw as TakenStore;
    if (store.date === todayStr()) return store.flags;
    return {};
  }
  return raw as Record<string, boolean>;
}

function saveTakenToday(flags: Record<string, boolean>) {
  const store: TakenStore = { date: todayStr(), flags };
  saveLS(TAKEN_KEY, store);
}

type SavedSupp = {
  id: string;
  displayName: string;
  nutrients: Array<{ nutrientId: string; name: string; unit: string; amountToday: number; dailyReference: number | null }>;
  ingredientsList?: string[];
  labelTranscription?: string | null;
};

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

/* ── Color helpers ── */

function barColor(n: NutrientComputed): string {
  if (n.flags.exceedsUl) return "var(--veda-red, #e74c3c)";
  if (n.flags.approachingUl) return "var(--veda-orange, #FF8C1A)";
  return "var(--veda-accent, #2E5BFF)";
}

function riskColor(risk: string) {
  if (risk === "high") return "var(--veda-red, #f06292)";
  if (risk === "medium") return "var(--veda-orange, #FF8C1A)";
  return "var(--veda-accent, #2E5BFF)";
}

const FOOD_COVERAGE_LABELS: Record<FoodCoverage, { text: string; cls: string }> = {
  likely_covered_by_food: { text: "Food likely covers this", cls: "coverage__food--ok" },
  maybe_covered: { text: "Partially from food", cls: "coverage__food--maybe" },
  unknown: { text: "", cls: "" },
  hard_to_cover_from_food: { text: "Harder from food", cls: "coverage__food--hard" },
};

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

  const takenSupps = useMemo(() => supps.filter((s) => taken[s.id]), [supps, taken]);
  const anyTaken = takenSupps.length > 0;

  /* Build IntakeLine[] and run the nutrition engine */
  const computedNutrients = useMemo(() => {
    if (!anyTaken) return [];

    const user = loadUser();
    const sex = bioSexToSex(user?.sex ?? null);
    const ageBucket = ageRangeToAgeBucket(user?.ageRange ?? null);
    const dietAnswers = loadLS<DietAnswers | null>(DIET_KEY, null) ?? undefined;

    const lines: IntakeLine[] = [];
    for (const s of takenSupps) {
      lines.push(...nutrientRowsToIntakeLines(s.nutrients, "supplement"));
    }

    return computeDailyNutrients({ sex, ageBucket }, lines, dietAnswers);
  }, [anyTaken, takenSupps]);

  const hasDiet = useMemo(() => {
    const answers = loadLS<DietAnswers | null>(DIET_KEY, null);
    return hasEnoughDietAnswers(answers ?? undefined);
  }, []);

  /* Only show nutrients that the user actually takes (supplementTotal > 0) */
  const visibleNutrients = useMemo(
    () => computedNutrients.filter((n) => n.supplementTotal > 0),
    [computedNutrients],
  );

  /* Check for UL alerts across all nutrients (including zero-supplement ones won't trigger) */
  const ulAlerts = useMemo(
    () => computedNutrients.filter((n) => n.flags.exceedsUl || n.flags.approachingUl),
    [computedNutrients],
  );

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

  return (
    <section className="coverage" aria-label="Today's Supplement Balance">
      <h3 className="coverage__title">Today's Supplement Balance</h3>

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

      {/* UL alert banner */}
      {ulAlerts.length > 0 && (
        <div className="coverage__ul-alerts">
          {ulAlerts.map((n) => (
            <div
              key={n.nutrientId}
              className={`coverage__ul-alert ${n.flags.exceedsUl ? "coverage__ul-alert--exceed" : "coverage__ul-alert--approaching"}`}
            >
              <span className="coverage__ul-alert-icon">
                {n.flags.exceedsUl ? "⚠" : "↑"}
              </span>
              <span className="coverage__ul-alert-text">
                {n.label}: {Math.round(n.supplementTotal)} {n.unit} from supplements
                {n.ul ? ` (UL: ${n.ul} ${n.unit})` : ""}
                {n.flags.exceedsUl ? " — exceeds upper limit" : " — approaching upper limit"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Nutrient contribution bars */}
      {anyTaken && visibleNutrients.length > 0 && (
        <ul className="coverage__list">
          {visibleNutrients.map((n) => {
            const pct = n.percentOfTargetFromSupps != null
              ? Math.round(n.percentOfTargetFromSupps * 100)
              : null;
            const foodLabel = FOOD_COVERAGE_LABELS[n.foodCoverage];
            const showFoodTag = hasDiet && n.foodCoverage !== "unknown" && pct != null && pct < 100;

            return (
              <li key={n.nutrientId} className="coverage__row">
                <div className="coverage__row-header">
                  <span className="coverage__nutrient">
                    {n.label}
                    {n.flags.redundantStacking && (
                      <span className="coverage__stacking-badge" title="Found in multiple products">
                        2+
                      </span>
                    )}
                  </span>
                  <span className="coverage__amount">
                    {Math.round(n.supplementTotal * 10) / 10} {n.unit}
                  </span>
                  {pct != null ? (
                    <span className="coverage__pct" style={{ color: barColor(n) }}>
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
                        background: barColor(n),
                      }}
                    />
                  </div>
                )}
                <div className="coverage__row-meta">
                  <span className="coverage__source-label">From supplements</span>
                  {showFoodTag && foodLabel.text && (
                    <span className={`coverage__food-tag ${foodLabel.cls}`}>
                      {foodLabel.text}
                    </span>
                  )}
                </div>
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
    </section>
  );
}
