import { useMemo } from "react";
import type { NutrientRow } from "./stubs";
import { loadLS } from "../lib/persist";
import "./SignalExplainer.css";

const SUPPS_KEY = "veda.supps.v1";
const MEDS_KEY = "veda.meds.v1";
const TAKEN_KEY = "veda.supps.taken.v1";

interface ExplainerRow {
  kind: "redundant" | "excessive" | "overlap";
  label: string;
  detail: string;
  color: string;
}

function buildExplainers(): ExplainerRow[] {
  const taken = loadLS<Record<string, boolean>>(TAKEN_KEY, {});
  const supps = loadLS<any[]>(SUPPS_KEY, []).filter((s) => s?.id && taken[s.id]);
  const meds = loadLS<any[]>(MEDS_KEY, []);

  type AugRow = NutrientRow & { sources: string[]; fromSupp: boolean; fromMed: boolean };
  const map = new Map<string, AugRow>();

  for (const s of supps) {
    for (const n of (s.nutrients || []) as NutrientRow[]) {
      if (!n?.nutrientId) continue;
      const ex = map.get(n.nutrientId);
      if (ex) {
        ex.amountToday += n.amountToday;
        ex.sources.push(s.displayName || "Supplement");
        ex.fromSupp = true;
      } else {
        map.set(n.nutrientId, { ...n, sources: [s.displayName || "Supplement"], fromSupp: true, fromMed: false });
      }
    }
  }

  for (const m of meds) {
    for (const n of (m.nutrients || []) as NutrientRow[]) {
      if (!n?.nutrientId) continue;
      const ex = map.get(n.nutrientId);
      if (ex) {
        ex.amountToday += n.amountToday;
        ex.sources.push(m.displayName || "Medication");
        ex.fromMed = true;
      } else {
        map.set(n.nutrientId, { ...n, sources: [m.displayName || "Medication"], fromSupp: false, fromMed: true });
      }
    }
  }

  const rows: ExplainerRow[] = [];

  // 1. Overlaps (supp + med)
  for (const [, r] of map) {
    if (r.fromSupp && r.fromMed) {
      rows.push({
        kind: "overlap",
        label: r.name,
        detail: `Present in both supplements and medications (${r.sources.length} sources)`,
        color: "var(--veda-red, #e74c3c)",
      });
    }
  }

  // 2. Redundancy (same nutrient, multiple sources, but not supp+med overlap)
  for (const [, r] of map) {
    if (r.sources.length > 1 && !(r.fromSupp && r.fromMed)) {
      rows.push({
        kind: "redundant",
        label: r.name,
        detail: `Appears in ${r.sources.length} items: ${r.sources.slice(0, 3).join(", ")}`,
        color: "var(--veda-orange, #e67e22)",
      });
    }
  }

  // 3. Excessive (>200% DV)
  for (const [, r] of map) {
    if (r.dailyReference != null && r.dailyReference > 0) {
      const pct = Math.round((r.amountToday / r.dailyReference) * 100);
      if (pct > 200) {
        rows.push({
          kind: "excessive",
          label: r.name,
          detail: `${pct}% of typical daily reference (${r.amountToday} ${r.unit})`,
          color: "var(--veda-red, #e74c3c)",
        });
      }
    }
  }

  // Deduplicate by label (keep first occurrence per label)
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = r.kind + ":" + r.label;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 9);
}

const KIND_LABELS: Record<string, string> = {
  overlap: "Overlap",
  redundant: "Redundant",
  excessive: "Excessive",
};

export default function SignalExplainer() {
  const rows = useMemo(() => buildExplainers(), []);

  if (rows.length === 0) return null;

  return (
    <section className="explainer">
      <h3 className="explainer__title">Why this signal</h3>
      <div className="explainer__list">
        {rows.map((r, i) => (
          <div className="explainer__row" key={`${r.kind}-${r.label}-${i}`}>
            <span className="explainer__tag" style={{ color: r.color }}>
              {KIND_LABELS[r.kind] || r.kind}
            </span>
            <div className="explainer__body">
              <div className="explainer__label">{r.label}</div>
              <div className="explainer__detail">{r.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
