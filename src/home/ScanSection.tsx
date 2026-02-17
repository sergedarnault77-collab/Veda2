import { useMemo, useRef, useState } from "react";
import { compressImageDataUrl } from "../lib/image";
import { withMinDelay } from "../lib/minDelay";
import { loadLS, saveLS } from "../lib/persist";
import LoadingBanner from "../shared/LoadingBanner";
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
  const [todayScans, setTodayScans] = useState<StoredScan[]>(() => loadScans().scans);

  const ingredientsInputRef = useRef<HTMLInputElement>(null);

  const hasIngredients = ingredientsImages.length > 0;
  const scanCount = todayScans.length;

  const needsRescan = result?.meta?.needsRescan === true;
  const rescanHint =
    result?.meta?.rescanHint || "Take a closer photo of the ingredients label.";

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

      // Build summary string
      const ents: string[] = json?.normalized?.detectedEntities || [];
      const summaryStr = ents.slice(0, 4).join(", ") + (ents.length > 4 ? ` +${ents.length - 4} more` : "");

      // Persist scan to today's history
      const day = persistScan(pName, summaryStr);
      setTodayScans(day.scans);

      // Emit scan result upward for exposure tracking
      onScanComplete?.({
        productName: pName,
        categories: json?.normalized?.categories || {},
        nutrients: Array.isArray(json?.nutrients) ? json.nutrients : [],
        detectedEntities: ents,
      });
    } catch (e: any) {
      setError(String(e?.message || e));
      setStep("done");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep("idle");
    setFrontImage(null);
    setIngredientsImages([]);
    setResult(null);
    setError(null);
    setProductName("");
  }

  /* -- Render -- */

  return (
    <section className="scan-status">
      {/* Scan button + status (compact) */}
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
              handleCapture(f, step === "idle" && !frontImage ? "front" : "ingredients");
            }}
          />
          Scan label
        </label>

        <div className="scan-status__info">
          <div className="scan-status__checks">
            <span>Front {frontImage ? "✓" : "—"}</span>
            <span>Label {hasIngredients ? "✓" : "—"}</span>
          </div>
          {scanCount > 0 && (
            <div className="scan-status__count">
              {scanCount} item{scanCount !== 1 ? "s" : ""} scanned today
            </div>
          )}
        </div>
      </div>

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

          <button className="scan-status__reset" onClick={reset}>
            Scan another item
          </button>
        </div>
      )}

      {/* Persisted scan history (shows even after tab switch) */}
      {step !== "done" && todayScans.length > 0 && (
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
