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

function loadTakenToday(suppIds?: string[]): Record<string, boolean> {
  const raw = loadLS<TakenStore | Record<string, boolean> | null>(TAKEN_KEY, null);
  if (raw && typeof (raw as TakenStore).date === "string") {
    const store = raw as TakenStore;
    if (store.date === todayStr()) return store.flags;
  }
  // New day (or first load): default all supplements to taken
  if (suppIds && suppIds.length > 0) {
    const flags: Record<string, boolean> = {};
    for (const id of suppIds) flags[id] = true;
    return flags;
  }
  return {};
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

  const [taken, setTaken] = useState<Record<string, boolean>>(() => {
    const s = loadSupps();
    return loadTakenToday(s.map((x) => x.id));
  });

  const [stackInsight, setStackInsight] = useState<ItemInsights | null>(null);
  const [expandedUl, setExpandedUl] = useState<string | null>(null);
  const [ulExplanation, setUlExplanation] = useState<Record<string, string>>({});
  const [ulLoading, setUlLoading] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      const freshSupps = loadSupps();
      setSupps(freshSupps);
      setTaken((prev) => {
        const freshIds = freshSupps.map((x) => x.id);
        const stored = loadTakenToday(freshIds);
        // Merge: keep explicit user choices, default new supps to true
        const merged: Record<string, boolean> = {};
        for (const id of freshIds) {
          merged[id] = id in stored ? stored[id] : (id in prev ? prev[id] : true);
        }
        return merged;
      });
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

  const explainUl = useCallback((nutrientId: string, label: string, amount: number, unit: string, ul: number | null) => {
    if (expandedUl === nutrientId) {
      setExpandedUl(null);
      return;
    }
    setExpandedUl(nutrientId);
    if (ulExplanation[nutrientId]) return;

    setUlLoading(nutrientId);
    const suppNames = takenSupps.map((s) => s.displayName).join(", ");
    const question = `I'm taking ${Math.round(amount)} ${unit} of ${label} daily from these supplements: ${suppNames}. ` +
      (ul ? `The tolerable upper intake level (UL) is ${ul} ${unit}. ` : "") +
      `What are the risks of exceeding this level? What symptoms should I watch for? Should I reduce or split my dose?`;

    fetch("/api/ask-scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, productName: label, nutrients: [], interactions: [] }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        let answer: string;
        const raw = json?.answer;
        if (typeof raw === "string") {
          answer = raw;
        } else if (raw && typeof raw === "object") {
          const parts: string[] = [];
          if (raw.shortAnswer) parts.push(String(raw.shortAnswer));
          if (raw.explanation) parts.push(String(raw.explanation));
          if (raw.whyFlagged) parts.push(String(raw.whyFlagged));
          if (raw.practicalNotes) parts.push(String(raw.practicalNotes));
          answer = parts.join("\n\n") || "No details available.";
        } else if (typeof json?.text === "string") {
          answer = json.text;
        } else {
          answer = "Could not generate an explanation. Try again later.";
        }
        setUlExplanation((prev) => ({ ...prev, [nutrientId]: answer }));
      })
      .catch(() => {
        setUlExplanation((prev) => ({ ...prev, [nutrientId]: "Request failed — check your connection and try again." }));
      })
      .finally(() => setUlLoading(null));
  }, [expandedUl, ulExplanation, takenSupps]);
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
                {active ? "✓" : "○"} {s.displayName}
              </button>
            );
          })}
        </div>
      )}

      {/* Empty state — only shows if user unchecked everything */}
      {supps.length > 0 && !anyTaken && (
        <p className="coverage__empty">
          All supplements unchecked — tap to re-enable
        </p>
      )}

      {/* UL alert banner */}
      {ulAlerts.length > 0 && (
        <div className="coverage__ul-alerts">
          {ulAlerts.map((n) => {
            const isOpen = expandedUl === n.nutrientId;
            const explanation = ulExplanation[n.nutrientId];
            const loading = ulLoading === n.nutrientId;
            return (
              <div key={n.nutrientId}>
                <button
                  className={`coverage__ul-alert coverage__ul-alert--clickable ${n.flags.exceedsUl ? "coverage__ul-alert--exceed" : "coverage__ul-alert--approaching"}`}
                  onClick={() => explainUl(n.nutrientId, n.label, n.supplementTotal, n.unit, n.ul ?? null)}
                >
                  <span className="coverage__ul-alert-icon">
                    {n.flags.exceedsUl ? "⚠" : "↑"}
                  </span>
                  <span className="coverage__ul-alert-text">
                    {n.label}: {Math.round(n.supplementTotal)} {n.unit} from supplements
                    {n.ul ? ` (UL: ${n.ul} ${n.unit})` : ""}
                    {n.flags.exceedsUl ? " — exceeds upper limit" : " — approaching upper limit"}
                  </span>
                  <span className="coverage__ul-alert-chevron">{isOpen ? "▾" : "›"}</span>
                </button>
                {isOpen && (
                  <div className="coverage__ul-detail">
                    {loading ? (
                      <div className="coverage__ul-detail-loading">Analyzing risks and recommendations…</div>
                    ) : explanation ? (
                      <>
                        <div className="coverage__ul-detail-text">{explanation}</div>
                        <div className="coverage__ul-detail-disclaimer">General information — not medical advice.</div>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
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
