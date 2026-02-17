import { useMemo, useState } from "react";
import type { NutrientRow } from "./stubs";
import { loadLS } from "../lib/persist";
import ContextPanel from "../shared/ContextPanel";
import type { ExplainSignal } from "../shared/ContextPanel";
import "./StackSignal.css";

const SUPPS_KEY = "veda.supps.v1";
const MEDS_KEY = "veda.meds.v1";
const TAKEN_KEY = "veda.supps.taken.v1";

function loadTakenFlags(): Record<string, boolean> {
  const raw = (typeof window !== "undefined") ? localStorage.getItem(TAKEN_KEY) : null;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.date === "string") {
      if (parsed.date === new Date().toISOString().slice(0, 10)) return parsed.flags || {};
      return {};
    }
    return parsed;
  } catch { return {}; }
}

type SignalState = "balanced" | "redundant" | "excessive" | "interaction";

interface StackSignalData {
  state: SignalState;
  headline: string;
  explanation: string;
}

function loadAllNutrients(): { nutrients: Map<string, NutrientRow>; suppNames: string[]; medNames: string[] } {
  const taken = loadTakenFlags();
  const supps = loadLS<any[]>(SUPPS_KEY, []).filter((s) => s?.id && taken[s.id]);
  const meds = loadLS<any[]>(MEDS_KEY, []);

  const map = new Map<string, NutrientRow & { sources: string[] }>();
  const suppNames: string[] = [];
  const medNames: string[] = [];

  for (const s of supps) {
    suppNames.push(s.displayName || "Supplement");
    for (const n of (s.nutrients || []) as NutrientRow[]) {
      if (!n?.nutrientId) continue;
      const existing = map.get(n.nutrientId);
      if (existing) {
        existing.amountToday += n.amountToday;
        existing.sources.push(s.displayName || "Supplement");
      } else {
        map.set(n.nutrientId, { ...n, sources: [s.displayName || "Supplement"] });
      }
    }
  }

  for (const m of meds) {
    medNames.push(m.displayName || "Medication");
    for (const n of (m.nutrients || []) as NutrientRow[]) {
      if (!n?.nutrientId) continue;
      const existing = map.get(n.nutrientId);
      if (existing) {
        existing.amountToday += n.amountToday;
        existing.sources.push(m.displayName || "Medication");
      } else {
        map.set(n.nutrientId, { ...n, sources: [m.displayName || "Medication"] });
      }
    }
  }

  return { nutrients: map as Map<string, NutrientRow>, suppNames, medNames };
}

function computeSignal(): StackSignalData {
  const { nutrients, suppNames, medNames } = loadAllNutrients();

  if (nutrients.size === 0 && suppNames.length === 0 && medNames.length === 0) {
    return {
      state: "balanced",
      headline: "No items tracked yet",
      explanation: "Scan a product or mark supplements as taken to see your stack signal.",
    };
  }

  if (nutrients.size === 0) {
    return {
      state: "balanced",
      headline: "No unusual stacking or redundancy detected today",
      explanation: "Based on what's currently tracked, nothing stands out.",
    };
  }

  const excessive: { name: string; pct: number }[] = [];
  const redundant: { name: string; count: number }[] = [];

  for (const [, row] of nutrients) {
    const r = row as NutrientRow & { sources: string[] };
    if (row.dailyReference != null && row.dailyReference > 0) {
      const pct = Math.round((row.amountToday / row.dailyReference) * 100);
      if (pct > 200) excessive.push({ name: row.name, pct });
    }
    if (r.sources && r.sources.length > 1) {
      redundant.push({ name: row.name, count: r.sources.length });
    }
  }

  excessive.sort((a, b) => b.pct - a.pct);
  redundant.sort((a, b) => b.count - a.count);

  // Check for supp+med overlap by shared ingredient names
  const hasOverlap = suppNames.length > 0 && medNames.length > 0 && redundant.length > 0;

  if (hasOverlap) {
    const top = redundant[0];
    return {
      state: "interaction",
      headline: "Potential overlap detected",
      explanation: `${top.name} appears across both supplements and medications (${top.count} sources).`,
    };
  }

  if (excessive.length > 0) {
    const top = excessive[0];
    return {
      state: "excessive",
      headline: "Excessive intake flagged",
      explanation: `${top.name} is at ${top.pct}% of typical daily reference — far above usual levels.`,
    };
  }

  if (redundant.length > 0) {
    const top = redundant[0];
    return {
      state: "redundant",
      headline: "Redundancy detected",
      explanation: `${top.name} appears in ${top.count} items you're currently taking.`,
    };
  }

  return {
    state: "balanced",
    headline: "No unusual stacking or redundancy detected today",
    explanation: "Based on what's currently tracked, nothing stands out.",
  };
}

const STATE_CONFIG: Record<SignalState, { label: string; color: string; bg: string }> = {
  balanced: { label: "Balanced", color: "var(--veda-green, #2ecc71)", bg: "rgba(46,204,113,0.08)" },
  redundant: { label: "Redundant", color: "var(--veda-orange, #e67e22)", bg: "rgba(230,126,34,0.08)" },
  excessive: { label: "Excessive", color: "var(--veda-red, #e74c3c)", bg: "rgba(231,76,60,0.08)" },
  interaction: { label: "Potential interaction", color: "var(--veda-red, #e74c3c)", bg: "rgba(231,76,60,0.08)" },
};

export default function StackSignal() {
  const signal = useMemo(() => computeSignal(), []);
  const cfg = STATE_CONFIG[signal.state];
  const [explainSignal, setExplainSignal] = useState<ExplainSignal | null>(null);

  const showExplain = signal.state !== "balanced";

  return (
    <>
      <section className="stack-signal" style={{ background: cfg.bg, borderColor: cfg.color }}>
        <div className="stack-signal__state" style={{ color: cfg.color }}>
          {cfg.label}
        </div>
        <div className="stack-signal__headline">{signal.headline}</div>
        <div className="stack-signal__explanation">{signal.explanation}</div>
        {showExplain && (
          <button
            className="stack-signal__explain-btn"
            onClick={() =>
              setExplainSignal({
                kind: signal.state,
                label: signal.headline,
                detail: signal.explanation,
              })
            }
          >
            What this means
          </button>
        )}
      </section>

      {explainSignal && (
        <ContextPanel
          signal={explainSignal}
          onClose={() => setExplainSignal(null)}
        />
      )}
    </>
  );
}
