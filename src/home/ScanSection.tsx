import { useMemo, useRef, useState } from "react";
import { compressImageDataUrl } from "../lib/image";
import { withMinDelay } from "../lib/minDelay";
import { loadLS, saveLS } from "../lib/persist";
import LoadingBanner from "../shared/LoadingBanner";
import DrinkBuilder from "./DrinkBuilder";
import type { DrinkEstimate } from "./DrinkBuilder";
import "./ScanSection.css";

export type ScanResult = {
  productName: string;
  categories: Record<string, string[]>;
  nutrients: any[];
  detectedEntities: string[];
};

type ScanStep = "idle" | "front" | "ingredients" | "done";

const MAX_ING_PHOTOS = 4;
const SCANS_KEY = "veda.scans.today.v1";

type StoredScan = {
  productName: string;
  detectedSummary: string;
  ts: number;
};

type StoredScansDay = {
  date: string;
  scans: StoredScan[];
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function loadScans(): StoredScansDay {
  const stored = loadLS<StoredScansDay | null>(SCANS_KEY, null);
  if (stored && stored.date === todayStr()) return stored;
  return { date: todayStr(), scans: [] };
}

function persistScan(name: string, summary: string) {
  const day = loadScans();
  day.scans.push({ productName: name, detectedSummary: summary, ts: Date.now() });
  saveLS(SCANS_KEY, day);
  return day;
}

/* ── Caffeine detection helpers ── */

const CAFFEINE_BEVERAGES: Record<string, { caffeine: number; calories: number }> = {
  coffee:      { caffeine: 95, calories: 2 },
  espresso:    { caffeine: 63, calories: 1 },
  americano:   { caffeine: 95, calories: 2 },
  cappuccino:  { caffeine: 63, calories: 80 },
  latte:       { caffeine: 63, calories: 120 },
  "flat white": { caffeine: 63, calories: 80 },
  macchiato:   { caffeine: 63, calories: 15 },
  mocha:       { caffeine: 63, calories: 200 },
  "black tea": { caffeine: 47, calories: 2 },
  "green tea": { caffeine: 28, calories: 2 },
  tea:         { caffeine: 47, calories: 2 },
  "matcha":    { caffeine: 70, calories: 5 },
};

const CAFFEINE_PATTERN = /\b(coffee|espresso|americano|cappuccino|latte|flat\s*white|macchiato|mocha|matcha|black\s*tea|green\s*tea|\btea\b)/i;

function detectCaffeineBeverage(name: string, entities: string[]): string | null {
  const haystack = [name, ...entities].join(" ").toLowerCase();
  const match = haystack.match(CAFFEINE_PATTERN);
  if (!match) return null;
  const key = match[1].toLowerCase().replace(/\s+/g, " ").trim();
  if (key in CAFFEINE_BEVERAGES) return key;
  if (key === "tea") return "tea";
  return null;
}

function hasCaffeineAmount(result: any): boolean {
  const nutrients = Array.isArray(result?.nutrients) ? result.nutrients : [];
  for (const n of nutrients) {
    if (!n || typeof n !== "object") continue;
    const id = String(n.nutrientId || "").toLowerCase();
    const name = String(n.name || "").toLowerCase();
    if ((id === "caffeine" || name.includes("caffeine")) && Number(n.amountToday) > 1) {
      return true;
    }
  }
  return false;
}

type CaffeineAnswer = null | "regular" | "decaf";

interface Props {
  onScanComplete?: (result: ScanResult) => void;
}

export default function ScanSection({ onScanComplete }: Props) {
  const [step, setStep] = useState<ScanStep>("idle");
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [ingredientsImages, setIngredientsImages] = useState<string[]>([]);
  const [productName, setProductName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [added, setAdded] = useState(false);
  const [todayScans, setTodayScans] = useState<StoredScan[]>(() => loadScans().scans);
  const [caffeineQ, setCaffeineQ] = useState<CaffeineAnswer>(null);
  const [mode, setMode] = useState<"idle" | "scan" | "drink">("idle");

  const ingredientsInputRef = useRef<HTMLInputElement>(null);

  const hasIngredients = ingredientsImages.length > 0;
  const scanCount = todayScans.length;

  const needsRescan = result?.meta?.needsRescan === true;
  const rescanHint =
    result?.meta?.rescanHint || "Take a closer photo of the ingredients label.";

  /* -- Detect if we need to ask the caffeine question -- */
  const caffeineBevKey = useMemo(() => {
    if (!result) return null;
    if (hasCaffeineAmount(result)) return null;
    const ents: string[] = result?.normalized?.detectedEntities || [];
    return detectCaffeineBeverage(productName, ents);
  }, [result, productName]);

  const needsCaffeineQ = caffeineBevKey !== null && caffeineQ === null;

  /* -- Summary of what was detected (compact) -- */
  const detectedSummary = useMemo(() => {
    if (!result) return null;
    const ents: string[] = result?.normalized?.detectedEntities || [];
    if (!ents.length) return null;
    const top = ents.slice(0, 4).join(", ");
    return ents.length > 4 ? `${top} +${ents.length - 4} more` : top;
  }, [result]);

  /* -- Handlers -- */

  async function handleCapture(file: File, kind: "front" | "ingredients") {
    setError(null);
    const reader = new FileReader();
    const dataUrl: string = await new Promise((resolve, reject) => {
      reader.onerror = () => reject(new Error("Failed to read image"));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });

    const compressed = await compressImageDataUrl(dataUrl, {
      maxW: kind === "front" ? 900 : 1200,
      maxH: kind === "front" ? 900 : 1400,
      quality: kind === "front" ? 0.72 : 0.78,
      mimeType: "image/jpeg",
    });

    if (kind === "front") {
      setFrontImage(compressed);
      setStep("front");
      setIngredientsImages([]);
      setResult(null);
      setProductName("");
      setAdded(false);
      setCaffeineQ(null);
    } else {
      setIngredientsImages((prev) => [...prev, compressed].slice(-MAX_ING_PHOTOS));
      setStep("ingredients");
    }
  }

  async function runAnalysis(frontOnly = false) {
    if (!frontImage) return;
    if (!frontOnly && ingredientsImages.length === 0) return;
    setLoading(true);
    setError(null);
    setAdded(false);
    setCaffeineQ(null);
    try {
      const payload: any = { frontImageDataUrl: frontImage };
      if (!frontOnly && ingredientsImages.length > 0) {
        payload.ingredientsImageDataUrls = ingredientsImages;
      }
      const json = await withMinDelay(
        fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }).then(async (r) => {
          const j = await r.json();
          if (!j.ok) throw new Error(j?.error || `HTTP ${r.status}`);
          return j;
        }),
        700,
      );
      setResult(json);
      const pName = typeof json?.productName === "string" && json.productName.trim()
        ? json.productName
        : "(unnamed item)";
      setProductName(pName);
      setStep("done");
    } catch (e: any) {
      setError(String(e?.message || e));
      setStep("done");
    } finally {
      setLoading(false);
    }
  }

  function buildScanResult(): ScanResult {
    const cats = { ...(result?.normalized?.categories || {}) };
    const ents: string[] = [...(result?.normalized?.detectedEntities || [])];
    const nutrients: any[] = [...(Array.isArray(result?.nutrients) ? result.nutrients : [])];

    if (caffeineBevKey && caffeineQ === "regular") {
      const bev = CAFFEINE_BEVERAGES[caffeineBevKey];
      if (bev) {
        nutrients.push({ nutrientId: "caffeine", name: "Caffeine", unit: "mg", amountToday: bev.caffeine, dailyReference: 400 });
        if (bev.calories > 0) {
          nutrients.push({ nutrientId: "calories", name: "Calories", unit: "kcal", amountToday: bev.calories, dailyReference: null });
        }
        if (!ents.some((e) => /caffeine/i.test(e))) ents.push("caffeine");
        if (!cats.Stimulants) cats.Stimulants = [];
        if (!cats.Stimulants.some((s: string) => /caffeine/i.test(s))) cats.Stimulants.push("caffeine");
      }
    } else if (caffeineBevKey && caffeineQ === "decaf") {
      nutrients.push({ nutrientId: "caffeine", name: "Caffeine (decaf)", unit: "mg", amountToday: 2, dailyReference: 400 });
    }

    return { productName, categories: cats, nutrients, detectedEntities: ents };
  }

  function addToIntake() {
    if (!result || added) return;
    setAdded(true);

    const scanResult = buildScanResult();
    const ents = scanResult.detectedEntities;
    const summaryStr = ents.slice(0, 4).join(", ") + (ents.length > 4 ? ` +${ents.length - 4} more` : "");

    const day = persistScan(productName, summaryStr);
    setTodayScans(day.scans);

    onScanComplete?.(scanResult);
  }

  function handleDrinkAdd(est: DrinkEstimate) {
    const sizeSuffix = est.size !== "M" ? ` (${est.size})` : "";
    const pName = est.isDecaf
      ? `${est.drinkLabel}${sizeSuffix} (decaf)`
      : `${est.drinkLabel}${sizeSuffix}`;

    const nutrients: any[] = [
      {
        nutrientId: "caffeine",
        name: est.isDecaf ? "Caffeine (decaf)" : "Caffeine",
        unit: "mg",
        amountToday: est.caffeineMg,
        dailyReference: 400,
      },
    ];
    if (est.caloriesKcal > 0) {
      nutrients.push({
        nutrientId: "calories",
        name: "Calories",
        unit: "kcal",
        amountToday: est.caloriesKcal,
        dailyReference: null,
      });
    }

    const ents: string[] = est.isDecaf ? [] : ["caffeine"];
    const cats: Record<string, string[]> = est.isDecaf ? {} : { Stimulants: ["caffeine"] };
    if (est.sweetenerType) {
      if (!cats.Sweeteners) cats.Sweeteners = [];
      cats.Sweeteners.push(est.sweetenerType);
      ents.push(est.sweetenerType);
    }

    const summaryStr = est.isDecaf
      ? `decaf · ~${est.caloriesKcal} kcal`
      : `~${est.caffeineMg} mg caffeine · ~${est.caloriesKcal} kcal`;

    const day = persistScan(pName, summaryStr);
    setTodayScans(day.scans);
    setMode("idle");

    onScanComplete?.({ productName: pName, categories: cats, nutrients, detectedEntities: ents });
  }

  function dismiss() {
    setStep("idle");
    setFrontImage(null);
    setIngredientsImages([]);
    setResult(null);
    setError(null);
    setProductName("");
    setAdded(false);
    setCaffeineQ(null);
    setMode("idle");
  }

  function scanAnother() {
    setStep("idle");
    setFrontImage(null);
    setIngredientsImages([]);
    setResult(null);
    setError(null);
    setProductName("");
    setAdded(false);
    setCaffeineQ(null);
    setMode("idle");
  }

  /* -- Render -- */

  return (
    <section className="scan-status">
      {/* Entry tiles — two clear paths */}
      {step === "idle" && !loading && mode === "idle" && (
        <div className="scan-status__tiles">
          <label className="scan-status__tile scan-status__tile--primary">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                e.target.value = "";
                setMode("scan");
                handleCapture(f, "front");
              }}
            />
            <span className="scan-status__tileIcon">📷</span>
            <span className="scan-status__tileLabel">Scan label</span>
            <span className="scan-status__tileSub">Meds, supps, food & drink</span>
          </label>

          <button
            className="scan-status__tile scan-status__tile--secondary"
            onClick={() => setMode("drink")}
          >
            <span className="scan-status__tileIcon">☕</span>
            <span className="scan-status__tileLabel">Log drink</span>
            <span className="scan-status__tileSub">Coffee, tea, matcha, energy</span>
          </button>
        </div>
      )}

      {/* Active scan: show status row */}
      {mode === "scan" && step !== "idle" && (
        <div className="scan-status__row">
          <label className="scan-status__btn">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                e.target.value = "";
                handleCapture(f, frontImage ? "ingredients" : "front");
              }}
            />
            Scan
          </label>

          <div className="scan-status__info">
            <div className="scan-status__checks">
              <span>Front {frontImage ? "✓" : "—"}</span>
              <span>Label {hasIngredients ? "✓" : "—"}</span>
            </div>
          </div>
        </div>
      )}

      {/* Drink builder */}
      {mode === "drink" && (
        <DrinkBuilder
          onAdd={handleDrinkAdd}
          onCancel={() => setMode("idle")}
        />
      )}

      {/* Scan count */}
      {scanCount > 0 && mode === "idle" && step === "idle" && (
        <div className="scan-status__count">
          {scanCount} item{scanCount !== 1 ? "s" : ""} added today
        </div>
      )}

      {/* Hidden rescan input */}
      <input
        ref={ingredientsInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          e.target.value = "";
          handleCapture(f, "ingredients");
        }}
      />

      {/* Loading */}
      {loading && (
        <LoadingBanner
          title="Reading label…"
          subtitle="Extracting ingredients and nutrients"
          tone="info"
          compact
        />
      )}

      {/* Analyze buttons */}
      {frontImage && hasIngredients && step !== "done" && !loading && (
        <button className="scan-status__analyze" onClick={() => runAnalysis()}>
          Analyze
        </button>
      )}
      {frontImage && !hasIngredients && step !== "done" && !loading && (
        <button className="scan-status__frontOnly" onClick={() => runAnalysis(true)}>
          No label — identify from front
        </button>
      )}

      {error && <div className="scan-status__error">{error}</div>}

      {/* Current result (if active scan) */}
      {step === "done" && result && (
        <div className="scan-status__result">
          {needsRescan && (
            <LoadingBanner
              tone="warn"
              title="Photo is hard to read"
              subtitle={rescanHint}
              compact
            />
          )}

          <div className="scan-status__resultRow">
            <span className="scan-status__productName">{productName}</span>
            {detectedSummary && (
              <span className="scan-status__detected">{detectedSummary}</span>
            )}
          </div>

          {/* Caffeine follow-up question */}
          {needsCaffeineQ && !added && (
            <div className="scan-status__caffeineQ">
              <div className="scan-status__caffeineQText">
                Was this regular or decaf?
              </div>
              <div className="scan-status__caffeineQBtns">
                <button
                  className="scan-status__caffeineQBtn"
                  onClick={() => setCaffeineQ("regular")}
                >
                  Regular (~{CAFFEINE_BEVERAGES[caffeineBevKey!]?.caffeine ?? 95} mg caffeine)
                </button>
                <button
                  className="scan-status__caffeineQBtn scan-status__caffeineQBtn--decaf"
                  onClick={() => setCaffeineQ("decaf")}
                >
                  Decaf (~2 mg)
                </button>
              </div>
            </div>
          )}

          {/* Show caffeine answer */}
          {caffeineQ && !added && (
            <div className="scan-status__caffeineA">
              ✓ {caffeineQ === "regular"
                ? `Regular — ~${CAFFEINE_BEVERAGES[caffeineBevKey!]?.caffeine ?? 95} mg caffeine`
                : "Decaf — ~2 mg caffeine"}
            </div>
          )}

          {/* Add / Dismiss actions */}
          {!added ? (
            <div className="scan-status__actions">
              <button
                className="scan-status__addBtn"
                onClick={addToIntake}
                disabled={needsCaffeineQ}
                title={needsCaffeineQ ? "Answer the caffeine question first" : ""}
              >
                Add to today's intake
              </button>
              <button className="scan-status__dismissBtn" onClick={dismiss}>
                Dismiss
              </button>
            </div>
          ) : (
            <div className="scan-status__added">
              <span className="scan-status__addedBadge">✓ Added</span>
              <button className="scan-status__reset" onClick={scanAnother}>
                Scan another item
              </button>
            </div>
          )}
        </div>
      )}

      {/* Persisted scan history (shows even after tab switch) */}
      {step !== "done" && todayScans.length > 0 && mode === "idle" && (
        <div className="scan-status__history">
          {todayScans.slice().reverse().slice(0, 5).map((s, i) => (
            <div className="scan-status__historyRow" key={`${s.ts}-${i}`}>
              <span className="scan-status__historyName">{s.productName}</span>
              {s.detectedSummary && (
                <span className="scan-status__historyDetail">{s.detectedSummary}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
