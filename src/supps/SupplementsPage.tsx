import { useState } from "react";
import { loadLS, saveLS } from "../lib/persist";
import AddScannedItemModal from "../shared/AddScannedItemModal";
import type { ScannedItem } from "../shared/AddScannedItemModal";
import "./SupplementsPage.css";

type Supp = ScannedItem & {
  id: string;
};

const LS_KEY = "veda.supps.v1";

function confidenceLabel(c: number): string {
  if (c >= 0.75) return "High";
  if (c >= 0.45) return "Med";
  return "Low";
}

function confidenceClass(c: number): string {
  if (c >= 0.75) return "conf--high";
  if (c >= 0.45) return "conf--med";
  return "conf--low";
}

export default function SupplementsPage() {
  const [supps, setSupps] = useState<Supp[]>(() => loadLS<Supp[]>(LS_KEY, []));
  const [showModal, setShowModal] = useState(false);

  function addSupp(item: ScannedItem) {
    const supp: Supp = { ...item, id: crypto.randomUUID() };
    const next = [supp, ...supps];
    setSupps(next);
    saveLS(LS_KEY, next);
  }

  function removeSupp(id: string) {
    const next = supps.filter((s) => s.id !== id);
    setSupps(next);
    saveLS(LS_KEY, next);
  }

  return (
    <div className="supps-page">
      <div className="supps-page__top">
        <h1 className="supps-page__heading">Your supplements</h1>
        <button className="supps-page__add-btn" onClick={() => setShowModal(true)}>
          + Add
        </button>
      </div>
      <p className="supps-page__intro">
        Maintain your supplements here. We'll show overlap and interaction flags
        within this stack.
      </p>

      {supps.length === 0 && (
        <div className="supps-page__empty">
          <div className="supps-page__empty-label">No supplements added yet.</div>
          <div className="supps-page__empty-hint">
            Tap "+ Add" to photograph a supplement and its label.
          </div>
        </div>
      )}

      {supps.length > 0 && (
        <ul className="supps-page__list">
          {supps.map((s) => (
            <li key={s.id} className="supps-page__card">
              <div className="supps-page__card-body">
                <div className="supps-page__card-row">
                  <div className="supps-page__card-primary">
                    <div className="supps-page__card-name">{s.displayName}</div>
                    {s.brand && <div className="supps-page__card-brand">{s.brand}</div>}
                  </div>
                  <button className="supps-page__remove" onClick={() => removeSupp(s.id)} title="Remove">
                    ✕
                  </button>
                </div>

                <div className="supps-page__card-fields">
                  {s.strengthPerUnit != null && s.strengthUnit && (
                    <div className="supps-page__field">
                      <span className="supps-page__field-label">Strength</span>
                      <span className="supps-page__field-value">{s.strengthPerUnit} {s.strengthUnit}</span>
                    </div>
                  )}
                  {s.form && (
                    <div className="supps-page__field">
                      <span className="supps-page__field-label">Form</span>
                      <span className="supps-page__field-value">{s.form}</span>
                    </div>
                  )}
                  {s.servingSizeText && (
                    <div className="supps-page__field">
                      <span className="supps-page__field-label">Serving</span>
                      <span className="supps-page__field-value">{s.servingSizeText}</span>
                    </div>
                  )}
                  <div className="supps-page__field">
                    <span className="supps-page__field-label">Confidence</span>
                    <span className={`supps-page__confidence ${confidenceClass(s.confidence)}`}>
                      {confidenceLabel(s.confidence)}
                    </span>
                  </div>
                </div>

                <div className="supps-page__thumbs">
                  <img src={s.frontImage} alt={`${s.displayName} front`} className="supps-page__thumb" />
                  <img src={s.ingredientsImage} alt={`${s.displayName} ingredients`} className="supps-page__thumb" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showModal && (
        <AddScannedItemModal
          kind="supp"
          onClose={() => setShowModal(false)}
          onConfirm={addSupp}
        />
      )}
    </div>
  );
}
