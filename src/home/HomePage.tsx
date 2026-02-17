import { useState, useCallback } from "react";
import StackSignal from "./StackSignal";
import SignalExplainer from "./SignalExplainer";
import { DailyReferenceBars } from "./DailyReferenceBars";
import ScanSection from "./ScanSection";
import type { ScanResult } from "./ScanSection";
import { StackCoverage } from "./StackCoverage";
import type { ExposureEntry } from "./stubs";
import { loadLS, saveLS } from "../lib/persist";
import "./HomePage.css";

interface Props {
  isAI?: boolean;
  userName?: string;
}

const EXPOSURE_KEY = "veda.exposure.today.v1";

type StoredExposure = {
  date: string;
  sugars: number;
  sweetenerTypes: string[];
  calories: number;
  caffeine: number;
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function loadExposure(): StoredExposure {
  const stored = loadLS<StoredExposure | null>(EXPOSURE_KEY, null);
  if (stored && stored.date === todayStr()) return stored;
  return { date: todayStr(), sugars: 0, sweetenerTypes: [], calories: 0, caffeine: 0 };
}

function exposureToEntries(exp: StoredExposure): ExposureEntry[] {
  return [
    { label: "Added sugars (today)", value: exp.sugars, unit: "g", color: "var(--bar-sugar)" },
    { label: "Sweetener types detected", value: exp.sweetenerTypes.length, unit: "items", color: "var(--bar-sweetener)" },
    { label: "Calories from scanned items", value: exp.calories, unit: "kcal", color: "var(--bar-calorie)" },
    { label: "Caffeine exposure", value: exp.caffeine, unit: "mg", color: "var(--bar-caffeine)" },
  ];
}

function extractExposureFromScan(result: ScanResult): Partial<{
  sugars: number;
  sweetenerNames: string[];
  calories: number;
  caffeine: number;
}> {
  const cats = result.categories || {};
  const ents = result.detectedEntities || [];
  const nutrients = result.nutrients || [];
  const out: ReturnType<typeof extractExposureFromScan> = {};

  // Sweeteners — accumulate unique names
  const sw = Array.isArray(cats.Sweeteners) ? cats.Sweeteners : [];
  if (sw.length > 0) out.sweetenerNames = sw.map((s) => String(s).toLowerCase());

  // ── Caffeine ──
  // 1. Try nutrients (structured amount)
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
  // 2. Fallback: check categories.Stimulants for caffeine (try to parse amount from string)
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
  // 3. Fallback: check detectedEntities
  if (!out.caffeine && ents.some((e) => /caffeine|koffein|cafeïne|cafeine/i.test(e))) {
    out.caffeine = 1;
  }

  // ── Sugars ──
  for (const n of nutrients) {
    if (!n || typeof n !== "object") continue;
    const name = String(n.name || "").toLowerCase();
    if (name.includes("sugar") || name.includes("sucre") || name.includes("suiker")) {
      const amt = Number(n.amountToday);
      if (Number.isFinite(amt) && amt > 0) out.sugars = (out.sugars || 0) + amt;
    }
  }

  // ── Calories ──
  // 1. From nutrients
  for (const n of nutrients) {
    if (!n || typeof n !== "object") continue;
    const id = String(n.nutrientId || "").toLowerCase();
    const name = String(n.name || "").toLowerCase();
    if (id === "calories" || id === "energy" || name.includes("calorie") || name.includes("energy") || name === "kcal") {
      const amt = Number(n.amountToday);
      if (Number.isFinite(amt) && amt > 0) out.calories = (out.calories || 0) + amt;
    }
  }
  // 2. From categories
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
  const [exposure, setExposure] = useState<StoredExposure>(() => loadExposure());

  const handleScanComplete = useCallback((result: ScanResult) => {
    setExposure((prev) => {
      const base = prev.date === todayStr() ? prev : { date: todayStr(), sugars: 0, sweetenerTypes: [], calories: 0, caffeine: 0 };
      const extracted = extractExposureFromScan(result);

      const newSweeteners = new Set([...base.sweetenerTypes]);
      for (const s of (extracted.sweetenerNames || [])) newSweeteners.add(s);

      const next: StoredExposure = {
        date: todayStr(),
        sugars: base.sugars + (extracted.sugars || 0),
        sweetenerTypes: Array.from(newSweeteners),
        calories: base.calories + (extracted.calories || 0),
        caffeine: base.caffeine + (extracted.caffeine || 0),
      };
      saveLS(EXPOSURE_KEY, next);
      return next;
    });
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

          {/* 2. SECONDARY — Why this signal */}
          <SignalExplainer />

          {/* 3 + 4: Exposure + Stack coverage side-by-side on tablet+ */}
          <div className="home__columns">
            <DailyReferenceBars entries={entries} />
            <StackCoverage />
          </div>

          {/* 5. Scan status + scan button */}
          <ScanSection onScanComplete={handleScanComplete} />
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
