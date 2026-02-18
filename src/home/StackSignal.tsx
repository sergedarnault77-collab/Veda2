import { useEffect, useMemo, useState } from "react";
import type { NutrientRow } from "./stubs";
import { loadLS } from "../lib/persist";
import ContextPanel from "../shared/ContextPanel";
import type { ExplainSignal } from "../shared/ContextPanel";
import "./StackSignal.css";

const SUPPS_KEY = "veda.supps.v1";
const MEDS_KEY = "veda.meds.v1";
const TAKEN_KEY = "veda.supps.taken.v1";
const SCANS_KEY = "veda.scans.today.v1";

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

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function loadAllNutrients(): { nutrients: Map<string, NutrientRow>; suppNames: string[]; medNames: string[] } {
  const taken = loadTakenFlags();
  const supps = loadLS<any[]>(SUPPS_KEY, []).filter((s) => s?.id && taken[s.id]);
  const meds = loadLS<any[]>(MEDS_KEY, []);

  const map = new Map<string, NutrientRow & { sources: string[] }>();
  const suppNames: string[] = [];
  const medNames: string[] = [];

  const addToMap = (n: NutrientRow, sourceName: string) => {
    if (!n?.nutrientId) return;
    const existing = map.get(n.nutrientId);
    if (existing) {
      existing.amountToday += n.amountToday;
      existing.sources.push(sourceName);
    } else {
      map.set(n.nutrientId, { ...n, sources: [sourceName] });
    }
  };

  for (const s of supps) {
    suppNames.push(s.displayName || "Supplement");
    for (const n of (s.nutrients || []) as NutrientRow[]) addToMap(n, s.displayName || "Supplement");
  }

  for (const m of meds) {
    medNames.push(m.displayName || "Medication");
    for (const n of (m.nutrients || []) as NutrientRow[]) addToMap(n, m.displayName || "Medication");
  }

  // Also include nutrients from today's scans (catches items not yet in supps list)
  const scansRaw = loadLS<any>(SCANS_KEY, null);
  if (scansRaw && scansRaw.date === todayStr() && Array.isArray(scansRaw.scans)) {
    for (const scan of scansRaw.scans) {
      if (!Array.isArray(scan.nutrients)) continue;
      for (const n of scan.nutrients as NutrientRow[]) addToMap(n, scan.productName || "Scanned item");
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
      headline: "You're within normal range today",
      explanation: "Based on what you've logged, there are no notable overlaps or excesses.",
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
    headline: "You're within normal range today",
    explanation: "Based on what you've logged, there are no notable overlaps or excesses.",
  };
}

const STATE_CONFIG: Record<SignalState, { label: string; color: string; bg: string }> = {
  balanced: { label: "Normal range", color: "var(--veda-orange, #FF8C1A)", bg: "rgba(46, 91, 255, 0.06)" },
  redundant: { label: "Redundant", color: "var(--veda-orange, #e67e22)", bg: "rgba(230,126,34,0.08)" },
  excessive: { label: "Excessive", color: "var(--veda-red, #e74c3c)", bg: "rgba(231,76,60,0.08)" },
  interaction: { label: "Potential interaction", color: "var(--veda-red, #e74c3c)", bg: "rgba(231,76,60,0.08)" },
};

export default function StackSignal() {
  const [ver, setVer] = useState(0);

  useEffect(() => {
    const bump = () => setVer((v) => v + 1);
    window.addEventListener("veda:synced", bump);
    window.addEventListener("veda:supps-updated", bump);
    return () => {
      window.removeEventListener("veda:synced", bump);
      window.removeEventListener("veda:supps-updated", bump);
    };
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const signal = useMemo(() => computeSignal(), [ver]);
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
