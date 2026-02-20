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

type Contributor = {
  name: string;
  amount: number;
  unit: string;
  source: "supplement" | "med";
};

interface StackSignalData {
  state: SignalState;
  headline: string;
  explanation: string;
  flaggedNutrient?: string;
  flaggedUl?: number | null;
  flaggedUnit?: string;
  contributors?: Contributor[];
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type ItemNutrients = {
  name: string;
  source: "supplement" | "med";
  nutrients: Array<{ nutrientId: string; name: string; unit: string; amountToday: number }>;
};

function getScaledNutrients(item: any): any[] {
  const per100g = Array.isArray(item.nutrientsPer100g) ? item.nutrientsPer100g : null;
  const servingG = typeof item.servingSizeG === "number" ? item.servingSizeG : null;
  const isPer100g = item.nutritionPer === "100g";

  if (per100g && servingG) {
    const scale = servingG / 100;
    return per100g.map((n: any) => ({
      ...n,
      amountToday: typeof n.amountToday === "number"
        ? Math.round(n.amountToday * scale * 100) / 100
        : n.amountToday,
    }));
  }

  if (isPer100g && !servingG) return [];

  return Array.isArray(item.nutrients) ? item.nutrients : [];
}

function collectIntakeLines(): { lines: IntakeLine[]; suppNames: string[]; medNames: string[]; items: ItemNutrients[] } {
  const taken = loadTakenFlags();
  const supps = loadLS<any[]>(SUPPS_KEY, []).filter((s) => s?.id && taken[s.id]);
  const meds = loadLS<any[]>(MEDS_KEY, []);

  const lines: IntakeLine[] = [];
  const suppNames: string[] = [];
  const medNames: string[] = [];
  const items: ItemNutrients[] = [];

  for (const s of supps) {
    const name = s.displayName || "Supplement";
    suppNames.push(name);
    const nutrients = getScaledNutrients(s);
    if (nutrients.length > 0) {
      lines.push(...nutrientRowsToIntakeLines(nutrients, "supplement"));
      items.push({ name, source: "supplement", nutrients });
    }
  }

  for (const m of meds) {
    const name = m.displayName || "Medication";
    medNames.push(name);
    const mNutrients = getScaledNutrients(m);
    if (mNutrients.length > 0) {
      lines.push(...nutrientRowsToIntakeLines(mNutrients, "med"));
      items.push({ name, source: "med", nutrients: mNutrients });
    }
  }

  const scansRaw = loadLS<any>(SCANS_KEY, null);
  if (scansRaw && scansRaw.date === todayStr() && Array.isArray(scansRaw.scans)) {
    for (const scan of scansRaw.scans) {
      if (!Array.isArray(scan.nutrients)) continue;
      lines.push(...nutrientRowsToIntakeLines(scan.nutrients, "supplement"));
      items.push({ name: scan.productName || "Scanned item", source: "supplement", nutrients: scan.nutrients });
    }
  }

  return { lines, suppNames, medNames, items };
}

function buildContributors(items: ItemNutrients[], nutrientId: string): Contributor[] {
  const result: Contributor[] = [];
  for (const item of items) {
    for (const n of item.nutrients) {
      if (n.nutrientId === nutrientId && n.amountToday > 0) {
        result.push({ name: item.name, amount: n.amountToday, unit: n.unit, source: item.source });
      }
    }
  }
  return result.sort((a, b) => b.amount - a.amount);
}

function computeSignal(): StackSignalData {
  const user = loadUser();
  const sex = bioSexToSex(user?.sex ?? null);
  const ageBucket = ageRangeToAgeBucket(user?.ageRange ?? null);
  const { lines, suppNames, medNames, items } = collectIntakeLines();

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

  function withContributors(top: NutrientComputed, base: StackSignalData): StackSignalData {
    return {
      ...base,
      flaggedNutrient: top.label,
      flaggedUl: top.ul,
      flaggedUnit: top.unit,
      contributors: buildContributors(items, top.nutrientId),
    };
  }

  if (hasOverlap) {
    const top = redundant[0];
    return withContributors(top, {
      state: "interaction",
      headline: "Potential overlap detected",
      explanation: `${top.label} appears across both supplements and medications.`,
    });
  }

  if (highRiskExceed.length > 0 || exceeding.length >= 2) {
    const top = highRiskExceed[0] || exceeding[0];
    const pct = top.ulPercentFromSupps ? Math.round(top.ulPercentFromSupps * 100) : null;
    return withContributors(top, {
      state: "excessive",
      headline: "Excessive intake flagged",
      explanation: pct
        ? `${top.label} from supplements is at ${pct}% of the upper limit.`
        : `${top.label} exceeds the tolerable upper limit from supplements alone.`,
    });
  }

  if (highRiskApproach.length > 0) {
    const top = highRiskApproach[0];
    const pct = top.ulPercentFromSupps ? Math.round(top.ulPercentFromSupps * 100) : null;
    return withContributors(top, {
      state: "redundant",
      headline: "Approaching upper limit",
      explanation: pct
        ? `${top.label} from supplements is at ${pct}% of the upper limit.`
        : `${top.label} is nearing the tolerable upper limit.`,
    });
  }

  if (redundant.length > 0) {
    const top = redundant[0];
    return withContributors(top, {
      state: "redundant",
      headline: "Redundancy detected",
      explanation: `${top.label} appears in multiple items you're currently taking.`,
    });
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
  const [showBreakdown, setShowBreakdown] = useState(false);

  const showExplain = signal.state !== "balanced";
  const hasContributors = (signal.contributors?.length ?? 0) > 0;
  const totalAmount = signal.contributors?.reduce((s, c) => s + c.amount, 0) ?? 0;

  return (
    <>
      <section className="stack-signal" style={{ background: cfg.bg, borderColor: cfg.color }}>
        <div className="stack-signal__state" style={{ color: cfg.color }}>
          {cfg.label}
        </div>
        <div className="stack-signal__headline">{signal.headline}</div>
        <div className="stack-signal__explanation">{signal.explanation}</div>
        {showExplain && (
          <div className="stack-signal__actions">
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
            {hasContributors && (
              <button
                className="stack-signal__explain-btn"
                onClick={() => setShowBreakdown((v) => !v)}
              >
                {showBreakdown ? "Hide" : "Show me"}
              </button>
            )}
          </div>
        )}

        {showBreakdown && hasContributors && (
          <div className="stack-signal__breakdown">
            <div className="stack-signal__breakdown-title">
              {signal.flaggedNutrient} breakdown
              {signal.flaggedUl != null && (
                <span className="stack-signal__breakdown-ul">
                  UL: {signal.flaggedUl} {signal.flaggedUnit}
                </span>
              )}
            </div>
            {signal.contributors!.map((c, i) => (
              <div key={i} className="stack-signal__contributor">
                <span className="stack-signal__contributor-name">
                  <span className={`stack-signal__contributor-dot stack-signal__contributor-dot--${c.source}`} />
                  {c.name}
                </span>
                <span className="stack-signal__contributor-amount">
                  {c.amount} {c.unit}
                </span>
              </div>
            ))}
            <div className="stack-signal__contributor stack-signal__contributor--total">
              <span className="stack-signal__contributor-name">Total</span>
              <span className="stack-signal__contributor-amount">
                {totalAmount} {signal.flaggedUnit}
              </span>
            </div>
          </div>
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
