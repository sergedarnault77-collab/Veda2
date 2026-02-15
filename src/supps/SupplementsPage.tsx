import { useState } from "react";
import { loadLS, saveLS } from "../lib/persist";
import AddScannedItemModal from "../shared/AddScannedItemModal";
import type { ScannedItem } from "../shared/AddScannedItemModal";
import { parseScannedItem } from "../lib/parse-item";
import "./SupplementsPage.css";

type Supp = ScannedItem & {
  id: string;
};

const LS_KEY = "veda.supps.v1";

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function confidenceLabel(c: number) {
  const v = clamp01(c);
  if (v >= 0.75) return { text: "High", tone: "high" as const };
  if (v >= 0.45) return { text: "Med", tone: "med" as const };
  return { text: "Low", tone: "low" as const };
}

function fmtAmount(n: number) {
  if (!Number.isFinite(n)) return "";
  // keep a sane number of decimals for tiny values
  if (Math.abs(n) < 1 && n !== 0) return n.toFixed(2).replace(/\.?0+$/, "");
  if (Math.abs(n) < 10) return n.toFixed(1).replace(/\.?0+$/, "");
  return Math.round(n).toString();
}

function pctDV(amount: number, ref: number) {
  if (!Number.isFinite(amount) || !Number.isFinite(ref) || ref <= 0) return null;
  return Math.round((amount / ref) * 100);
}

export default function SupplementsPage() {
  const [supps, setSupps] = useState<Supp[]>(() => loadLS<Supp[]>(LS_KEY, []));
  const [showModal, setShowModal] = useState(false);
  const [upgradingId, setUpgradingId] = useState<string | null>(null);

  const addSupp = (item: ScannedItem) => {
    const next: Supp[] = [{ ...item, id: crypto.randomUUID() }, ...supps];
    setSupps(next);
    saveLS(LS_KEY, next);
  };

  const removeSupp = (id: string) => {
    const next = supps.filter((s) => s.id !== id);
    setSupps(next);
    saveLS(LS_KEY, next);
  };

  const upgradeSupp = async (id: string) => {
    const s = supps.find((x) => x.id === id);
    if (!s) return;
    if (!s.frontImage || !s.ingredientsImage) return;

    try {
      setUpgradingId(id);
      const parsed = await parseScannedItem("supp", s.frontImage, s.ingredientsImage);

      const next = supps.map((x) => {
        if (x.id !== id) return x;
        // Merge parsed fields in, but keep user-edited displayName if present and non-empty
        const displayName = (x.displayName || "").trim() || parsed.displayName || "Supplement";
        return {
          ...x,
          displayName,
          brand: parsed.brand ?? x.brand ?? null,
          form: parsed.form ?? x.form ?? null,
          strengthPerUnit: parsed.strengthPerUnit ?? x.strengthPerUnit ?? null,
          strengthUnit: parsed.strengthUnit ?? x.strengthUnit ?? null,
          servingSizeText: parsed.servingSizeText ?? x.servingSizeText ?? null,
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : x.confidence,
          mode: parsed.mode ?? x.mode,
          // new stuff:
          labelTranscription: parsed.labelTranscription ?? x.labelTranscription ?? null,
          nutrients: Array.isArray(parsed.nutrients) ? parsed.nutrients : (x.nutrients ?? []),
          ingredientsDetected: Array.isArray(parsed.ingredientsDetected)
            ? parsed.ingredientsDetected
            : (x.ingredientsDetected ?? []),
          rawTextHints: Array.isArray(parsed.rawTextHints) ? parsed.rawTextHints : (x.rawTextHints ?? []),
        };
      });

      setSupps(next);
      saveLS(LS_KEY, next);
    } finally {
      setUpgradingId(null);
    }
  };

  return (
    <div className="supps-page">
      <div className="supps-page__header">
        <div>
          <h1>Your supplements</h1>
          <p>Maintain your supplements here. We'll show overlap and interaction flags within this stack.</p>
        </div>
        <button className="supps-page__add" onClick={() => setShowModal(true)}>
          + Add
        </button>
      </div>

      {supps.length === 0 ? (
        <div className="supps-page__empty">
          <div className="supps-page__emptyTitle">No supplements added yet.</div>
          <div className="supps-page__emptySub">Tap "+ Add" to photograph a supplement and its label.</div>
        </div>
      ) : (
        <div className="supps-page__list">
          {supps.map((s) => {
            const conf = confidenceLabel(s.confidence ?? 0);
            const nutrients = Array.isArray(s.nutrients) ? s.nutrients : [];
            const hasNutrients = nutrients.length > 0;
            const showRows = nutrients.slice(0, 6);
            const more = nutrients.length - showRows.length;

            return (
              <div key={s.id} className="supp-card">
                <button className="supp-card__remove" onClick={() => removeSupp(s.id)} aria-label="Remove">
                  ×
                </button>

                <div className="supp-card__title">{(s.displayName || "Supplement").toUpperCase()}</div>
                {s.brand ? <div className="supp-card__subtitle">{s.brand.toUpperCase()}</div> : null}

                <div className="supp-card__grid">
                  <div className="supp-card__field">
                    <div className="supp-card__label">FORM</div>
                    <div className="supp-card__value">{s.form || "—"}</div>
                  </div>
                  <div className="supp-card__field">
                    <div className="supp-card__label">SERVING</div>
                    <div className="supp-card__value">{s.servingSizeText || "—"}</div>
                  </div>
                  <div className="supp-card__field">
                    <div className="supp-card__label">CONFIDENCE</div>
                    <div className={`supp-card__badge supp-card__badge--${conf.tone}`}>{conf.text}</div>
                  </div>
                </div>

                {!hasNutrients ? (
                  <div className="supp-nutrients supp-nutrients--empty">
                    <div className="supp-nutrients__head">
                      <div className="supp-nutrients__title">Nutrients</div>
                      <button
                        className="supp-nutrients__action"
                        onClick={() => upgradeSupp(s.id)}
                        disabled={upgradingId === s.id}
                      >
                        {upgradingId === s.id ? "Extracting…" : "Extract nutrients"}
                      </button>
                    </div>
                    <div className="supp-nutrients__sub">
                      This item was saved before nutrient extraction was enabled. Tap "Extract nutrients" to read the label from the saved photos.
                    </div>
                  </div>
                ) : (
                  <div className="supp-nutrients">
                    <div className="supp-nutrients__head">
                      <div className="supp-nutrients__title">Nutrients</div>
                      <div className="supp-nutrients__meta">{nutrients.length}</div>
                    </div>
                    <div className="supp-nutrients__rows">
                      {showRows.map((n, idx) => {
                        const p = pctDV(n.amountToday, n.dailyReference);
                        return (
                          <div className="supp-nutrients__row" key={`${n.nutrientId}-${idx}`}>
                            <div className="supp-nutrients__name" title={n.name}>
                              {n.name}
                            </div>
                            <div className="supp-nutrients__amt">
                              {fmtAmount(n.amountToday)} {n.unit}
                            </div>
                            <div className="supp-nutrients__pct">{p == null ? "—" : `${p}%`}</div>
                          </div>
                        );
                      })}
                      {more > 0 ? <div className="supp-nutrients__more">+{more} more</div> : null}
                    </div>
                  </div>
                )}

                <details className="supp-card__photos">
                  <summary>Tap to view photos</summary>
                  <div className="supp-card__thumbs">
                    {s.frontImage ? <img src={s.frontImage} alt="Front" /> : null}
                    {s.ingredientsImage ? <img src={s.ingredientsImage} alt="Label" /> : null}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}

      {showModal ? (
        <AddScannedItemModal
          kind="supp"
          onClose={() => setShowModal(false)}
          onConfirm={(item) => {
            addSupp(item);
            setShowModal(false);
          }}
        />
      ) : null}
    </div>
  );
}
