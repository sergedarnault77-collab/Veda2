import { useState } from "react";
import { loadLS, saveLS } from "../lib/persist";
import { AddScannedItemModal } from "../shared/AddScannedItemModal";
import type { ScannedItemDraft } from "../shared/AddScannedItemModal";
import "./MedicationsPage.css";

type Med = ScannedItemDraft & {
  id: string;
  createdAtISO: string;
};

const LS_KEY = "veda.meds.v1";

export default function MedicationsPage() {
  const [meds, setMeds] = useState<Med[]>(() => loadLS<Med[]>(LS_KEY, []));
  const [showModal, setShowModal] = useState(false);

  function addMed(draft: ScannedItemDraft) {
    const item: Med = {
      ...draft,
      id: crypto.randomUUID(),
      createdAtISO: new Date().toISOString(),
    };
    const next = [item, ...meds];
    setMeds(next);
    saveLS(LS_KEY, next);
    setShowModal(false);
  }

  function removeMed(id: string) {
    const next = meds.filter((m) => m.id !== id);
    setMeds(next);
    saveLS(LS_KEY, next);
  }

  return (
    <div className="meds-page">
      <div className="meds-page__top">
        <h1 className="meds-page__heading">Your medications</h1>
        <button className="meds-page__add-btn" onClick={() => setShowModal(true)}>
          + Add
        </button>
      </div>
      <p className="meds-page__intro">
        Maintain your medications here. We'll show interaction flags between
        items you've added.
      </p>

      {meds.length === 0 && (
        <div className="meds-page__empty">
          <div className="meds-page__empty-label">No medications added yet.</div>
          <div className="meds-page__empty-hint">
            Tap "+ Add" to photograph a medication and its label.
          </div>
        </div>
      )}

      {meds.length > 0 && (
        <ul className="meds-page__list">
          {meds.map((m) => (
            <li key={m.id} className="meds-page__card">
              <div className="meds-page__thumbs">
                <img src={m.frontDataUrl} alt={`${m.name} front`} className="meds-page__thumb" />
                <img src={m.ingredientsDataUrl} alt={`${m.name} ingredients`} className="meds-page__thumb" />
              </div>
              <div className="meds-page__card-info">
                <div className="meds-page__card-name">{m.name}</div>
                <div className="meds-page__card-meta">
                  {m.brand && <span>{m.brand}</span>}
                  {m.strengthPerUnit != null && m.strengthUnit && (
                    <span>{m.strengthPerUnit} {m.strengthUnit}{m.form ? ` · ${m.form}` : ""}</span>
                  )}
                  {m.servingSizeText && <span>{m.servingSizeText}</span>}
                </div>
                {/* TODO: show ✅/⚠️ interaction indicators here */}
              </div>
              <button className="meds-page__remove" onClick={() => removeMed(m.id)} title="Remove">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {showModal && (
        <AddScannedItemModal
          kind="med"
          onCancel={() => setShowModal(false)}
          onConfirm={addMed}
        />
      )}
    </div>
  );
}
