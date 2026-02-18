import { useEffect, useMemo, useState } from "react";
import type { NutrientRow } from "./stubs";
import { loadLS } from "../lib/persist";
import { loadUser } from "../lib/auth";
import {
  computeDailyNutrients,
  ageRangeToAgeBucket,
  bioSexToSex,
  nutrientRowsToIntakeLines,
} from "../lib/nutrition";
import type { NutrientComputed, IntakeLine } from "../lib/nutrition";
import ContextPanel from "../shared/ContextPanel";
import type { ExplainSignal } from "../shared/ContextPanel";
import "./StackSignal.css";

const SUPPS_KEY = "veda.supps.v1";
const MEDS_KEY = "veda.meds.v1";
const TAKEN_KEY = "veda.supps.taken.v1";
const SCANS_KEY = "veda.scans.today.v1";

const HIGH_RISK_NUTRIENTS = new Set([
  "vitamin_d", "vitamin_a", "iron", "zinc", "selenium", "b6", "calcium", "iodine",
]);

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

function collectIntakeLines(): { lines: IntakeLine[]; suppNames: string[]; medNames: string[] } {
  const taken = loadTakenFlags();
  const supps = loadLS<any[]>(SUPPS_KEY, []).filter((s) => s?.id && taken[s.id]);
  const meds = loadLS<any[]>(MEDS_KEY, []);

  const lines: IntakeLine[] = [];
  const suppNames: string[] = [];
  const medNames: string[] = [];

  for (const s of supps) {
    suppNames.push(s.displayName || "Supplement");
    if (Array.isArray(s.nutrients)) {
      lines.push(...nutrientRowsToIntakeLines(s.nutrients, "supplement"));
    }
  }

  for (const m of meds) {
    medNames.push(m.displayName || "Medication");
    if (Array.isArray(m.nutrients)) {
      lines.push(...nutrientRowsToIntakeLines(m.nutrients, "med"));
    }
  }

  const scansRaw = loadLS<any>(SCANS_KEY, null);
  if (scansRaw && scansRaw.date === todayStr() && Array.isArray(scansRaw.scans)) {
    for (const scan of scansRaw.scans) {
      if (!Array.isArray(scan.nutrients)) continue;
      lines.push(...nutrientRowsToIntakeLines(scan.nutrients, "supplement"));
    }
  }

  return { lines, suppNames, medNames };
}

function computeSignal(): StackSignalData {
  const user = loadUser();
  const sex = bioSexToSex(user?.sex ?? null);
  const ageBucket = ageRangeToAgeBucket(user?.ageRange ?? null);
  const { lines, suppNames, medNames } = collectIntakeLines();

  if (lines.length === 0 && suppNames.length === 0 && medNames.length === 0) {
    return {
      state: "balanced",
      headline: "No items tracked yet",
      explanation: "Scan a product or mark supplements as taken to see your stack signal.",
    };
  }

  const nutrients = computeDailyNutrients({ sex, ageBucket }, lines);

  const exceeding = nutrients.filter((n) => n.flags.exceedsUl);
  const approaching = nutrients.filter((n) => n.flags.approachingUl && !n.flags.exceedsUl);
  const redundant = nutrients.filter((n) => n.flags.redundantStacking);

  const highRiskExceed = exceeding.filter((n) => HIGH_RISK_NUTRIENTS.has(n.nutrientId));
  const highRiskApproach = approaching.filter((n) => HIGH_RISK_NUTRIENTS.has(n.nutrientId));

  const hasOverlap = suppNames.length > 0 && medNames.length > 0 && redundant.length > 0;

  if (hasOverlap) {
    const top = redundant[0];
    return {
      state: "interaction",
      headline: "Potential overlap detected",
      explanation: `${top.label} appears across both supplements and medications.`,
    };
  }

  if (highRiskExceed.length > 0 || exceeding.length >= 2) {
    const top = highRiskExceed[0] || exceeding[0];
    const pct = top.ulPercentFromSupps ? Math.round(top.ulPercentFromSupps * 100) : null;
    return {
      state: "excessive",
      headline: "Excessive intake flagged",
      explanation: pct
        ? `${top.label} from supplements is at ${pct}% of the upper limit.`
        : `${top.label} exceeds the tolerable upper limit from supplements alone.`,
    };
  }

  if (highRiskApproach.length > 0) {
    const top = highRiskApproach[0];
    const pct = top.ulPercentFromSupps ? Math.round(top.ulPercentFromSupps * 100) : null;
    return {
      state: "redundant",
      headline: "Approaching upper limit",
      explanation: pct
        ? `${top.label} from supplements is at ${pct}% of the upper limit.`
        : `${top.label} is nearing the tolerable upper limit.`,
    };
  }

  if (redundant.length > 0) {
    const top = redundant[0];
    return {
      state: "redundant",
      headline: "Redundancy detected",
      explanation: `${top.label} appears in multiple items you're currently taking.`,
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
