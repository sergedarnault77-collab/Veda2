import { useRef, useState } from "react";
import type { Signal, AnalyzeResponse } from "./stubs";
import { STUB_ANALYZE_RESPONSE } from "./stubs";
import { fileToDataUrl } from "../lib/persist";
import { compressImageDataUrl } from "@/lib/image";
import "./ScanSection.css";

// ── Entity → category mapping (client-side grouping) ──

const ENTITY_CAT: Record<string, string> = {
  Aspartame: "Sweeteners",
  "Acesulfame K": "Sweeteners",
  Sucralose: "Sweeteners",
  Saccharin: "Sweeteners",
  Stevia: "Sweeteners",
  Caffeine: "Stimulants",
  Taurine: "Stimulants",
  Guarana: "Stimulants",
  Sugar: "Sugar & calories",
  Glucose: "Sugar & calories",
  Fructose: "Sugar & calories",
  HFCS: "Sugar & calories",
  Magnesium: "Minerals",
  Zinc: "Minerals",
  Iron: "Minerals",
  Calcium: "Minerals",
  Potassium: "Minerals",
  "Vitamin D": "Fortification",
  "Vitamin C": "Fortification",
  "Vitamin B12": "Fortification",
  "Vitamin B6": "Fortification",
  Niacin: "Fortification",
  "Omega-3": "Fatty acids",
  Melatonin: "Hormones",
  Ashwagandha: "Adaptogens",
  "St. John's wort": "Herbals",
};

const CAT_ORDER = [
  "Sweeteners",
  "Stimulants",
  "Sugar & calories",
  "Minerals",
  "Fortification",
  "Fatty acids",
  "Hormones",
  "Adaptogens",
  "Herbals",
  "Other",
];

type EntityGroup = { category: string; items: string[] };

function groupEntities(entities: string[]): EntityGroup[] {
  const map = new Map<string, string[]>();
  for (const e of entities) {
    const cat = ENTITY_CAT[e] ?? "Other";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(e);
  }
  return CAT_ORDER.filter((c) => map.has(c)).map((c) => ({ category: c, items: map.get(c)! }));
}

function buildSummary(groups: EntityGroup[]): string {
  return groups
    .map((g) =>
      g.items.length === 1
        ? g.items[0].toLowerCase()
        : `${g.category.toLowerCase()} (${g.items.length})`
    )
    .join(" · ");
}

// ── Analyze helper ──

async function analyzeLabel(inputText: string): Promise<AnalyzeResponse> {
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputText }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as AnalyzeResponse;
  } catch {
    return {
      ...STUB_ANALYZE_RESPONSE,
      meta: { mode: "stub", timestampISO: new Date().toISOString() },
    };
  }
}

const SEVERITY_CLASS: Record<Signal["severity"], string> = {
  likely: "badge--warn",
  possible: "badge--caution",
  info: "badge--clear",
};

// ── Component ──

export default function ScanSection() {
  // Camera capture
  const [frontImageUrl, setFrontImageUrl] = useState<string | null>(null);
  const [ingredientsImageUrl, setIngredientsImageUrl] = useState<string | null>(null);
  const frontInputRef = useRef<HTMLInputElement | null>(null);
  const ingredientsInputRef = useRef<HTMLInputElement | null>(null);

  // Analysis results
  const [signals, setSignals] = useState<Signal[]>([]);
  const [entities, setEntities] = useState<string[]>([]);
  const [analysing, setAnalysing] = useState(false);

  // Post-results UI
  const [productName, setProductName] = useState("Scanned item");
  const [showPhotos, setShowPhotos] = useState(false);

  async function onPickFrontFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const raw = await fileToDataUrl(file);
    setFrontImageUrl(await compressImageDataUrl(raw));
    e.target.value = "";
  }

  async function onPickIngredientsFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const raw = await fileToDataUrl(file);
    setIngredientsImageUrl(await compressImageDataUrl(raw));
    e.target.value = "";
  }

  async function handleAnalyze() {
    setAnalysing(true);
    // Stub input text until OCR is wired to the scanned images
    const data = await analyzeLabel(
      "carbonated water, caramel colour, phosphoric acid, aspartame, " +
        "acesulfame K, caffeine, natural flavourings, citric acid"
    );
    setSignals(data.signals);
    setEntities(data.normalized.detectedEntities);
    setAnalysing(false);
  }

  function resetScan() {
    setFrontImageUrl(null);
    setIngredientsImageUrl(null);
    setSignals([]);
    setEntities([]);
    setProductName("Scanned item");
    setShowPhotos(false);
  }

  const canScanIngredients = !!frontImageUrl;
  const hasResults = signals.length > 0;
  const entityGroups = groupEntities(entities);
  const summaryText = buildSummary(entityGroups);

  return (
    <section className="scan-section" aria-label="Scan for interactions">
      {/* Hidden camera inputs */}
      <input
        ref={frontInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={onPickFrontFile}
      />
      <input
        ref={ingredientsInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={onPickIngredientsFile}
      />

      <div className="scan-section__header">
        <h2>Avoiding harm</h2>
        <p className="scan-section__sub">
          Most interaction patterns are identified from the ingredients label on
          the back.
        </p>
      </div>

      {/* ════ Pre-results: scanning flow ════ */}
      {!hasResults && (
        <>
          <div className="scan-section__actions">
            <button
              className="scan-section__btn"
              onClick={() => frontInputRef.current?.click()}
            >
              {frontImageUrl ? "Re-scan product front" : "Scan product front"}
            </button>
            <button
              className={`scan-section__btn ${canScanIngredients ? "is-primary" : "is-disabled"}`}
              disabled={!canScanIngredients}
              onClick={() => ingredientsInputRef.current?.click()}
              title={!canScanIngredients ? "Scan the front first" : ""}
            >
              {ingredientsImageUrl ? "Re-scan ingredients label" : "Scan ingredients label"}
            </button>
          </div>

          <div className="scan-section__status">
            <div>{frontImageUrl ? "Front captured ✅" : "Front: not captured yet"}</div>
            <div>{ingredientsImageUrl ? "Ingredients captured ✅" : "Ingredients: not captured yet"}</div>
          </div>

          <div className="scan-section__previews">
            {frontImageUrl && <img src={frontImageUrl} alt="Front" />}
            {ingredientsImageUrl && <img src={ingredientsImageUrl} alt="Ingredients" />}
          </div>

          {ingredientsImageUrl && (
            <button
              className="scan-section__btn is-primary"
              style={{ marginTop: 12, width: "100%" }}
              onClick={handleAnalyze}
              disabled={analysing}
            >
              {analysing ? "Analysing…" : "Run analysis"}
            </button>
          )}
        </>
      )}

      {/* ════ Post-results: collapsed view ════ */}
      {hasResults && (
        <>
          {/* Compact scanned-item header */}
          <div className="scan-section__scanned">
            <span className="scan-section__scanned-check">✅</span>
            <input
              className="scan-section__scanned-name"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              aria-label="Product name"
            />
          </div>

          {/* Collapsible photos */}
          <button
            className="scan-section__photo-toggle"
            onClick={() => setShowPhotos((p) => !p)}
          >
            {showPhotos ? "Hide photos ▲" : "Tap to view photos ▼"}
          </button>

          {showPhotos && (
            <div className="scan-section__previews scan-section__previews--compact">
              {frontImageUrl && <img src={frontImageUrl} alt="Front" />}
              {ingredientsImageUrl && <img src={ingredientsImageUrl} alt="Ingredients" />}
            </div>
          )}

          {/* Grouped entity chips */}
          {entityGroups.length > 0 && (
            <div className="scan-section__chip-groups">
              {entityGroups.map((g) => (
                <div key={g.category} className="scan-section__chip-row">
                  <span className="scan-section__chip-cat">{g.category}</span>
                  {g.items.map((item) => (
                    <span key={item} className="scan-section__entity">{item}</span>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Summary line */}
          {summaryText && (
            <div className="scan-section__summary-line">
              Detected: {summaryText}
            </div>
          )}

          {/* Signal cards */}
          <div className="scan-section__signals">
            {signals.map((s, i) => (
              <div key={i} className="scan-section__result">
                <span className={`scan-section__badge ${SEVERITY_CLASS[s.severity]}`}>
                  {s.headline}
                </span>
                <p className="scan-section__summary">{s.explanation}</p>
                {s.related && s.related.length > 0 && (
                  <p className="scan-section__related">
                    Related: {s.related.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Rescan */}
          <button
            className="scan-section__btn"
            style={{ marginTop: 14 }}
            onClick={resetScan}
          >
            Scan another item
          </button>
        </>
      )}
    </section>
  );
}
