import { useMemo, useState } from "react";
import { loadLS, saveLS } from "../lib/persist";
import AddScannedItemModal from "../shared/AddScannedItemModal";
import type { ScannedItem } from "../shared/AddScannedItemModal";
import "./MedicationsPage.css";

type Med = ScannedItem & { id: string };
const LS_KEY = "veda.meds.v1";

function id() {
  return Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
}

function confLabel(c: number) {
  if (c >= 0.75) return "High";
  if (c >= 0.45) return "Med";
  return "Low";
}

export default function MedicationsPage() {
  const [items, setItems] = useState<Med[]>(() => loadLS<Med[]>(LS_KEY, []));
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const addMed = (m: ScannedItem) => {
    const next: Med[] = [{ ...m, id: id() }, ...items];
    setItems(next);
    saveLS(LS_KEY, next);
  };

  const saveEdit = (updated: ScannedItem) => {
    if (!editId) return;
    const next = items.map((it) => (it.id === editId ? { ...it, ...updated } : it));
    setItems(next);
    saveLS(LS_KEY, next);
    setEditId(null);
  };

  const removeMed = (rid: string) => {
    const next = items.filter((x) => x.id !== rid);
    setItems(next);
    saveLS(LS_KEY, next);
  };

  const editingItem = useMemo(() => {
    if (!editId) return null;
    const found = items.find((x) => x.id === editId);
    return found ? ({ ...found, id: undefined } as any as ScannedItem) : null;
  }, [editId, items]);

  return (
    <div className="meds-page">
      <div className="meds-page__header">
        <div>
          <h1>Your medications</h1>
          <p>Maintain your medications here. We'll show interaction flags between items you've added.</p>
        </div>
        <button className="meds-page__add" onClick={() => setShowAdd(true)}>
          + Add
        </button>
      </div>

      {items.length === 0 ? (
        <div className="meds-page__empty">
          <div className="meds-page__emptyCard">
            <div>No medications added yet.</div>
            <div className="meds-page__emptySub">Tap "+ Add" to photograph a medication and its label.</div>
          </div>
        </div>
      ) : (
        <div className="meds-page__list">
          {items.map((m) => (
            <div className="med-card" key={m.id}>
              <div className="med-card__top">
                <div className="med-card__titleWrap">
                  <div className="med-card__title">{m.displayName}</div>
                  {m.brand && <div className="med-card__subtitle">{m.brand}</div>}
                </div>
                <button className="med-card__remove" onClick={() => removeMed(m.id)} aria-label="Remove">
                  ×
                </button>
              </div>

              <div className="med-card__grid">
                <div>
                  <div className="med-card__label">Form</div>
                  <div className="med-card__value">{m.form || "—"}</div>
                </div>
                <div>
                  <div className="med-card__label">Serving</div>
                  <div className="med-card__value">{m.servingSizeText || "—"}</div>
                </div>
                <div>
                  <div className="med-card__label">Confidence</div>
                  <div className={`med-card__badge med-card__badge--${confLabel(m.confidence).toLowerCase()}`}>
                    {confLabel(m.confidence)}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button className="btn btn--secondary" onClick={() => setEditId(m.id)}>
                  Re-read / replace label
                </button>
              </div>

              <details className="med-card__photos">
                <summary>Tap to view photos</summary>
                <div className="med-card__thumbs">
                  {m.frontImage && <img src={m.frontImage} alt="Front" />}
                  {m.ingredientsImage && <img src={m.ingredientsImage} alt="Label" />}
                </div>
              </details>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddScannedItemModal
          kind="med"
          onClose={() => setShowAdd(false)}
          onConfirm={(item) => addMed(item)}
        />
      )}

      {editId && editingItem && (
        <AddScannedItemModal
          kind="med"
          initialItem={editingItem}
          onClose={() => setEditId(null)}
          onConfirm={(item) => saveEdit(item)}
        />
      )}
    </div>
  );
}
