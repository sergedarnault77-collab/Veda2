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
  const out: ReturnType<typeof extractExposureFromScan> = {};

  // Sweeteners — accumulate unique names
  const sw = Array.isArray(cats.Sweeteners) ? cats.Sweeteners : [];
  if (sw.length > 0) out.sweetenerNames = sw.map((s) => String(s).toLowerCase());

  // Caffeine — from nutrients or detected entities
  const nutrients = result.nutrients || [];
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
  // Fallback: if caffeine in entities but no nutrient amount, add a flag
  if (!out.caffeine) {
    const ents = result.detectedEntities || [];
    if (ents.some((e) => /caffeine|koffein|cafeïne/i.test(e))) {
      out.caffeine = 0; // present but unknown amount — we'll still show it was detected
    }
  }

  // Sugars — from nutrients
  for (const n of nutrients) {
    if (!n || typeof n !== "object") continue;
    const name = String(n.name || "").toLowerCase();
    if (name.includes("sugar") || name.includes("sucre") || name.includes("suiker")) {
      const amt = Number(n.amountToday);
      if (Number.isFinite(amt) && amt > 0) out.sugars = (out.sugars || 0) + amt;
    }
  }

  // Calories — from categories or nutrients
  const calCats = Array.isArray(cats.Calories) ? cats.Calories : [];
  for (const c of calCats) {
    const match = String(c).match(/(\d+)\s*kcal/i);
    if (match) out.calories = (out.calories || 0) + Number(match[1]);
  }

  return out;
}

export default function HomePage({ isAI = false }: Props) {
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
        <h1 className="home__logo">Veda</h1>
      </header>

      {isAI ? (
        <>
          {/* 1. PRIMARY — Overall Stack Signal (hero, full width) */}
          <StackSignal />

          {/* 2 + 3: Side-by-side on tablet+, stacked on phone */}
          <div className="home__columns">
            <SignalExplainer />
            <DailyReferenceBars entries={entries} />
          </div>

          {/* 4. TERTIARY — Scan status + scan button */}
          <ScanSection onScanComplete={handleScanComplete} />

          {/* 5. Stack coverage (collapsed unless active) */}
          <StackCoverage />
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
