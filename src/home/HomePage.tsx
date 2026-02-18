import { useState, useCallback, useEffect } from "react";
import StackSignal from "./StackSignal";
import { DailyReferenceBars } from "./DailyReferenceBars";
import ScanSection from "./ScanSection";
import type { ScanResult } from "./ScanSection";
import { StackCoverage } from "./StackCoverage";
import type { ExposureEntry } from "./stubs";
import { loadLS } from "../lib/persist";
import type { StoredScansDay, ScanExposure } from "./ScanSection";
import "./HomePage.css";

interface Props {
  isAI?: boolean;
  userName?: string;
}

const SCANS_KEY = "veda.scans.today.v1";

type AggregatedExposure = {
  sugars: number;
  sweetenerTypes: string[];
  calories: number;
  caffeine: number;
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const CAFFEINE_LOOKUP: Record<string, { caffeine: number; calories: number }> = {
  coffee: { caffeine: 95, calories: 2 }, espresso: { caffeine: 63, calories: 1 },
  americano: { caffeine: 95, calories: 2 }, cappuccino: { caffeine: 63, calories: 80 },
  latte: { caffeine: 63, calories: 120 }, "flat white": { caffeine: 63, calories: 80 },
  macchiato: { caffeine: 63, calories: 15 }, mocha: { caffeine: 63, calories: 200 },
  "black tea": { caffeine: 47, calories: 2 }, "green tea": { caffeine: 28, calories: 2 },
  tea: { caffeine: 47, calories: 2 }, matcha: { caffeine: 70, calories: 5 },
};

const CAFFEINE_RE = /\b(coffee|espresso|americano|cappuccino|latte|flat\s*white|macchiato|mocha|matcha|black\s*tea|green\s*tea|\btea\b)/i;

function inferExposureFromName(name: string, summary: string): ScanExposure {
  const out: ScanExposure = {};
  const hay = `${name} ${summary}`.toLowerCase();

  const bevMatch = hay.match(CAFFEINE_RE);
  if (bevMatch) {
    const key = bevMatch[1].replace(/\s+/g, " ").trim();
    const bev = CAFFEINE_LOOKUP[key];
    if (bev) {
      out.caffeine = /decaf/i.test(hay) ? 2 : bev.caffeine;
      out.calories = bev.calories;
    }
  }

  const caffeineMatch = summary.match(/~?(\d+)\s*mg\s*caffeine/i);
  if (caffeineMatch) out.caffeine = Number(caffeineMatch[1]);

  const calMatch = summary.match(/~?(\d+)\s*kcal/i);
  if (calMatch) out.calories = Number(calMatch[1]);

  const sweetenerNames: string[] = [];
  for (const sw of ["aspartam", "acesulfam", "sucralose", "stevia", "cyclamat", "saccharin"]) {
    if (hay.includes(sw)) sweetenerNames.push(sw);
  }
  if (sweetenerNames.length > 0) out.sweetenerNames = sweetenerNames;

  return out;
}

function deriveExposureFromScans(): AggregatedExposure {
  const stored = loadLS<StoredScansDay | null>(SCANS_KEY, null);
  const empty: AggregatedExposure = { sugars: 0, sweetenerTypes: [], calories: 0, caffeine: 0 };
  if (!stored || stored.date !== todayStr()) return empty;

  const sweetenerSet = new Set<string>();
  let sugars = 0;
  let calories = 0;
  let caffeine = 0;

  for (const scan of stored.scans) {
    const exp = scan.exposure || inferExposureFromName(scan.productName, scan.detectedSummary);
    sugars += exp.sugars || 0;
    calories += exp.calories || 0;
    caffeine += exp.caffeine || 0;
    if (exp.sweetenerNames) {
      for (const s of exp.sweetenerNames) sweetenerSet.add(s);
    }
  }

  return { sugars, sweetenerTypes: Array.from(sweetenerSet), calories, caffeine };
}

function exposureToEntries(exp: AggregatedExposure): ExposureEntry[] {
  return [
    { label: "Added sugars (today)", value: exp.sugars, unit: "g", color: "var(--bar-sugar)" },
    { label: "Sweetener types detected", value: exp.sweetenerTypes.length, unit: "items", color: "var(--bar-sweetener)" },
    { label: "Calories from scanned items", value: exp.calories, unit: "kcal", color: "var(--bar-calorie)" },
    { label: "Caffeine exposure", value: exp.caffeine, unit: "mg", color: "var(--bar-caffeine)" },
  ];
}

export function extractExposureFromScan(result: ScanResult): {
  sugars?: number;
  sweetenerNames?: string[];
  calories?: number;
  caffeine?: number;
} {
  const cats = result.categories || {};
  const ents = result.detectedEntities || [];
  const nutrients = result.nutrients || [];
  const out: ReturnType<typeof extractExposureFromScan> = {};

  const sw = Array.isArray(cats.Sweeteners) ? cats.Sweeteners : [];
  if (sw.length > 0) out.sweetenerNames = sw.map((s) => String(s).toLowerCase());

  for (const n of nutrients) {
    if (!n || typeof n !== "object") continue;
    const id = String(n.nutrientId || "").toLowerCase();
    const name = String(n.name || "").toLowerCase();
    if (id === "caffeine" || name.includes("caffeine") || name.includes("koffein") || name.includes("cafeïne")) {
      const amt = Number(n.amountToday);
      if (Number.isFinite(amt) && amt > 0) {
        out.caffeine = (out.caffeine || 0) + amt;
      }
    }
  }
  if (!out.caffeine) {
    const stims = Array.isArray(cats.Stimulants) ? cats.Stimulants : [];
    for (const s of stims) {
      const str = String(s).toLowerCase();
      if (/caffeine|koffein|cafeïne|cafeine/.test(str)) {
        const numMatch = str.match(/([\d.]+)\s*mg/);
        out.caffeine = numMatch ? Number(numMatch[1]) : 1;
        break;
      }
    }
  }
  if (!out.caffeine && ents.some((e) => /caffeine|koffein|cafeïne|cafeine/i.test(e))) {
    out.caffeine = 1;
  }

  for (const n of nutrients) {
    if (!n || typeof n !== "object") continue;
    const name = String(n.name || "").toLowerCase();
    if (name.includes("sugar") || name.includes("sucre") || name.includes("suiker")) {
      const amt = Number(n.amountToday);
      if (Number.isFinite(amt) && amt > 0) out.sugars = (out.sugars || 0) + amt;
    }
  }

  for (const n of nutrients) {
    if (!n || typeof n !== "object") continue;
    const id = String(n.nutrientId || "").toLowerCase();
    const name = String(n.name || "").toLowerCase();
    if (id === "calories" || id === "energy" || name.includes("calorie") || name.includes("energy") || name === "kcal") {
      const amt = Number(n.amountToday);
      if (Number.isFinite(amt) && amt > 0) out.calories = (out.calories || 0) + amt;
    }
  }
  if (!out.calories) {
    const calCats = Array.isArray(cats.Calories) ? cats.Calories : [];
    for (const c of calCats) {
      const str = String(c);
      const match = str.match(/([\d.]+)\s*(?:kcal|cal)/i);
      if (match) {
        out.calories = (out.calories || 0) + Number(match[1]);
      } else {
        const numOnly = str.match(/^([\d.]+)$/);
        if (numOnly) out.calories = (out.calories || 0) + Number(numOnly[1]);
      }
    }
  }

  return out;
}

export default function HomePage({ isAI = false, userName }: Props) {
  const [exposure, setExposure] = useState<AggregatedExposure>(() => deriveExposureFromScans());

  useEffect(() => {
    const onSync = () => setExposure(deriveExposureFromScans());
    window.addEventListener("veda:synced", onSync);
    return () => window.removeEventListener("veda:synced", onSync);
  }, []);

  const handleScanComplete = useCallback(() => {
    setExposure(deriveExposureFromScans());
  }, []);

  const entries = exposureToEntries(exposure);

  return (
    <main className="home">
      <header className="home__header">
        <h1 className="home__greeting">
          {userName ? `Hello ${userName},` : "Hello,"}
        </h1>
        <p className="home__sub">Based on what you've scanned today</p>
      </header>

      {isAI ? (
        <>
          {/* 1. PRIMARY — Overall Stack Signal (hero, full width) */}
          <StackSignal />

          {/* 2. Scan entry (label + drink) */}
          <ScanSection onScanComplete={handleScanComplete} />

          {/* 3 + 4: Exposure + Stack coverage side-by-side on tablet+ */}
          <div className="home__columns">
            <DailyReferenceBars entries={entries} />
            <StackCoverage />
          </div>
        </>
      ) : (
        <div className="home__freemium">
          <div className="home__freemiumCard">
            <div className="home__freemiumTitle">AI features are available on the Veda AI plan</div>
            <p className="home__freemiumSub">
              Scanning, analysis, signal interpretation, and stack insights are part of Veda AI.
              Upgrade from your account menu to unlock these features.
            </p>
            <div className="home__freemiumHint">
              You can still manage your supplements and medications from the tabs below.
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
