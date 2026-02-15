import { useState } from "react";
import { loadLS, saveLS } from "../lib/persist";
import AddScannedItemModal from "../shared/AddScannedItemModal";
import type { ScannedItem } from "../shared/AddScannedItemModal";
import { parseScannedItem } from "../lib/parse-item";
import "./MedicationsPage.css";

type Med = ScannedItem & {
  id: string;
};

const LS_KEY = "veda.meds.v1";

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
  if (Math.abs(n) < 1 && n !== 0) return n.toFixed(2).replace(/\.?0+$/, "");
  if (Math.abs(n) < 10) return n.toFixed(1).replace(/\.?0+$/, "");
  return Math.round(n).toString();
}

function pctDV(amount: number, ref: number) {
  if (!Number.isFinite(amount) || !Number.isFinite(ref) || ref <= 0) return null;
  return Math.round((amount / ref) * 100);
}

export default function MedicationsPage() {
  const [meds, setMeds] = useState<Med[]>(() => loadLS<Med[]>(LS_KEY, []));
  const [showModal, setShowModal] = useState(false);
  const [upgradingId, setUpgradingId] = useState<string | null>(null);

  const addMed = (item: ScannedItem) => {
    const next: Med[] = [{ ...item, id: crypto.randomUUID() }, ...meds];
    setMeds(next);
    saveLS(LS_KEY, next);
  };

  const removeMed = (id: string) => {
    const next = meds.filter((m) => m.id !== id);
    setMeds(next);
    saveLS(LS_KEY, next);
  };

  const upgradeMed = async (id: string) => {
    const m = meds.find((x) => x.id === id);
    if (!m) return;
    if (!m.frontImage || !m.ingredientsImage) return;
    try {
      setUpgradingId(id);
      const parsed = await parseScannedItem("med", m.frontImage, m.ingredientsImage);
      const next = meds.map((x) => {
        if (x.id !== id) return x;
        const displayName = (x.displayName || "").trim() || parsed.displayName || "Medication";
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
          labelTranscription: parsed.labelTranscription ?? x.labelTranscription ?? null,
          nutrients: Array.isArray(parsed.nutrients) ? parsed.nutrients : (x.nutrients ?? []),
          ingredientsDetected: Array.isArray(parsed.ingredientsDetected)
            ? parsed.ingredientsDetected
            : (x.ingredientsDetected ?? []),
          rawTextHints: Array.isArray(parsed.rawTextHints) ? parsed.rawTextHints : (x.rawTextHints ?? []),
        };
      });
      setMeds(next);
      saveLS(LS_KEY, next);
    } finally {
      setUpgradingId(null);
    }
  };

  return (
    <div className="meds-page">
      <div className="meds-page__header">
        <div>
          <h1>Your medications</h1>
          <p>Maintain your medications here. We'll show interaction flags between items you've added.</p>
        </div>
        <button className="meds-page__add" onClick={() => setShowModal(true)}>
          + Add
        </button>
      </div>

      {meds.length === 0 ? (
        <div className="meds-page__empty">
          <div className="meds-page__emptyTitle">No medications added yet.</div>
          <div className="meds-page__emptySub">Tap "+ Add" to photograph a medication and its label.</div>
        </div>
      ) : (
        <div className="meds-page__list">
          {meds.map((m) => {
            const conf = confidenceLabel(m.confidence ?? 0);
            const nutrients = Array.isArray(m.nutrients) ? m.nutrients : [];
            const hasNutrients = nutrients.length > 0;
            const showRows = nutrients.slice(0, 6);
            const more = nutrients.length - showRows.length;

            return (
              <div key={m.id} className="med-card">
                <button className="med-card__remove" onClick={() => removeMed(m.id)} aria-label="Remove">
                  ×
                </button>

                <div className="med-card__title">{(m.displayName || "Medication").toUpperCase()}</div>
                {m.brand ? <div className="med-card__subtitle">{m.brand.toUpperCase()}</div> : null}

                <div className="med-card__grid">
                  <div className="med-card__field">
                    <div className="med-card__label">FORM</div>
                    <div className="med-card__value">{m.form || "—"}</div>
                  </div>
                  <div className="med-card__field">
                    <div className="med-card__label">SERVING</div>
                    <div className="med-card__value">{m.servingSizeText || "—"}</div>
                  </div>
                  <div className="med-card__field">
                    <div className="med-card__label">CONFIDENCE</div>
                    <div className={`med-card__badge med-card__badge--${conf.tone}`}>{conf.text}</div>
                  </div>
                </div>

                {!hasNutrients ? (
                  <div className="med-nutrients med-nutrients--empty">
                    <div className="med-nutrients__head">
                      <div className="med-nutrients__title">Nutrients</div>
                      <button
                        className="med-nutrients__action"
                        onClick={() => upgradeMed(m.id)}
                        disabled={upgradingId === m.id}
                      >
                        {upgradingId === m.id ? "Extracting…" : "Extract nutrients"}
                      </button>
                    </div>
                    <div className="med-nutrients__sub">
                      This item was saved before nutrient extraction was enabled. Tap "Extract nutrients" to read the label from the saved photos.
                    </div>
                  </div>
                ) : (
                  <div className="med-nutrients">
                    <div className="med-nutrients__head">
                      <div className="med-nutrients__title">Nutrients</div>
                      <div className="med-nutrients__meta">{nutrients.length}</div>
                    </div>
                    <div className="med-nutrients__rows">
                      {showRows.map((n, idx) => {
                        const p = pctDV(n.amountToday, n.dailyReference);
                        return (
                          <div className="med-nutrients__row" key={`${n.nutrientId}-${idx}`}>
                            <div className="med-nutrients__name" title={n.name}>
                              {n.name}
                            </div>
                            <div className="med-nutrients__amt">
                              {fmtAmount(n.amountToday)} {n.unit}
                            </div>
                            <div className="med-nutrients__pct">{p == null ? "—" : `${p}%`}</div>
                          </div>
                        );
                      })}
                      {more > 0 ? <div className="med-nutrients__more">+{more} more</div> : null}
                    </div>
                  </div>
                )}

                <details className="med-card__photos">
                  <summary>Tap to view photos</summary>
                  <div className="med-card__thumbs">
                    {m.frontImage ? <img src={m.frontImage} alt="Front" /> : null}
                    {m.ingredientsImage ? <img src={m.ingredientsImage} alt="Label" /> : null}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}

      {showModal ? (
        <AddScannedItemModal
          kind="med"
          onClose={() => setShowModal(false)}
          onConfirm={(item) => {
            addMed(item);
            setShowModal(false);
          }}
        />
      ) : null}
    </div>
  );
}
