import { useState } from "react";
import { loadLS, saveLS } from "../lib/persist";
import { AddScannedItemModal } from "../shared/AddScannedItemModal";
import type { ScannedItemDraft } from "../shared/AddScannedItemModal";
import "./SupplementsPage.css";

type Supp = {
  id: string;
  name: string;
  frontDataUrl: string;
  ingredientsDataUrl: string;
  createdAtISO: string;
};

const LS_KEY = "veda.supps.v1";

export default function SupplementsPage() {
  const [supps, setSupps] = useState<Supp[]>(() => loadLS<Supp[]>(LS_KEY, []));
  const [showModal, setShowModal] = useState(false);

  function addSupp(draft: ScannedItemDraft) {
    const item: Supp = {
      ...draft,
      id: crypto.randomUUID(),
      createdAtISO: new Date().toISOString(),
    };
    const next = [item, ...supps]; // prepend
    setSupps(next);
    saveLS(LS_KEY, next);
    setShowModal(false);
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
              <div className="supps-page__thumbs">
                <img src={s.frontDataUrl} alt={`${s.name} front`} className="supps-page__thumb" />
                <img src={s.ingredientsDataUrl} alt={`${s.name} ingredients`} className="supps-page__thumb" />
              </div>
              <div className="supps-page__card-info">
                <div className="supps-page__card-name">{s.name}</div>
                {/* TODO: show ✅/⚠️ overlap/interaction indicators here */}
              </div>
              <button className="supps-page__remove" onClick={() => removeSupp(s.id)} title="Remove">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {showModal && (
        <AddScannedItemModal
          kind="supp"
          onCancel={() => setShowModal(false)}
          onConfirm={addSupp}
        />
      )}
    </div>
  );
}
