import { useMemo, useState } from "react";
import { loadLS, saveLS } from "../lib/persist";
import AddScannedItemModal from "../shared/AddScannedItemModal";
import type { ScannedItem } from "../shared/AddScannedItemModal";
import type { NutrientRow } from "../home/stubs";
import "./SupplementsPage.css";

type Supp = ScannedItem & { id: string };
const LS_KEY = "veda.supps.v1";

function id() {
  return Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
}

function confLabel(c: number) {
  if (c >= 0.75) return "High";
  if (c >= 0.45) return "Med";
  return "Low";
}

function pctDV(n: NutrientRow) {
  const a = Number(n.amountToday);
  const d = Number(n.dailyReference);
  if (!isFinite(a) || !isFinite(d) || d <= 0) return null;
  const pct = Math.round((a / d) * 100);
  if (!isFinite(pct)) return null;
  return pct;
}

export default function SupplementsPage() {
  const [items, setItems] = useState<Supp[]>(() => loadLS<Supp[]>(LS_KEY, []));
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const addSupp = (s: ScannedItem) => {
    const next: Supp[] = [{ ...s, id: id() }, ...items];
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

  const removeSupp = (rid: string) => {
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
    <div className="supps-page">
      <div className="supps-page__header">
        <div>
          <h1>Your supplements</h1>
          <p>Maintain your supplements here. We'll show overlap and interaction flags within this stack.</p>
        </div>
        <button className="supps-page__add" onClick={() => setShowAdd(true)}>
          + Add
        </button>
      </div>

      {items.length === 0 ? (
        <div className="supps-page__empty">
          <div className="supps-page__emptyCard">
            <div>No supplements added yet.</div>
            <div className="supps-page__emptySub">Tap "+ Add" to photograph a supplement and its label.</div>
          </div>
        </div>
      ) : (
        <div className="supps-page__list">
          {items.map((s) => {
            const nutrients = Array.isArray((s as any).nutrients) ? ((s as any).nutrients as any[]) : [];
            return (
              <div className="supp-card" key={s.id}>
                <div className="supp-card__top">
                  <div className="supp-card__titleWrap">
                    <div className="supp-card__title">{s.displayName}</div>
                    {s.brand && <div className="supp-card__subtitle">{s.brand}</div>}
                  </div>
                  <button className="supp-card__remove" onClick={() => removeSupp(s.id)} aria-label="Remove">
                    ×
                  </button>
                </div>

                <div className="supp-card__grid">
                  <div>
                    <div className="supp-card__label">Form</div>
                    <div className="supp-card__value">{s.form || "—"}</div>
                  </div>
                  <div>
                    <div className="supp-card__label">Serving</div>
                    <div className="supp-card__value">{s.servingSizeText || "—"}</div>
                  </div>
                  <div>
                    <div className="supp-card__label">Confidence</div>
                    <div className={`supp-card__badge supp-card__badge--${confLabel(s.confidence).toLowerCase()}`}>
                      {confLabel(s.confidence)}
                    </div>
                  </div>
                </div>

                {Array.isArray((s as any).nutrients) && ((s as any).nutrients as NutrientRow[]).length > 0 && (
                  <div className="supp-nutrients">
                    <div className="supp-nutrients__hdr">
                      <div>Detected nutrients</div>
                      <div className="supp-nutrients__sub">{((s as any).nutrients as NutrientRow[]).length} total</div>
                    </div>
                    <div className="supp-nutrients__grid">
                      {((s as any).nutrients as NutrientRow[])
                        .slice()
                        .sort((a, b) => (pctDV(b) ?? -1) - (pctDV(a) ?? -1))
                        .slice(0, 6)
                        .map((n) => {
                          const pct = pctDV(n);
                          return (
                            <div className="supp-nutrients__row" key={`${n.nutrientId}-${n.name}`}>
                              <div className="supp-nutrients__name" title={n.name}>
                                {n.name}
                              </div>
                              <div className="supp-nutrients__amt">
                                {n.amountToday}
                                {n.unit}
                              </div>
                              <div className="supp-nutrients__pct">{pct === null ? "—" : `${pct}% DV`}</div>
                            </div>
                          );
                        })}
                    </div>
                    {((s as any).nutrients as NutrientRow[]).length > 6 && (
                      <div className="supp-nutrients__more">
                        +{((s as any).nutrients as NutrientRow[]).length - 6} more
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button className="btn btn--secondary" onClick={() => setEditId(s.id)}>
                    Re-read / replace label
                  </button>
                </div>

                <details className="supp-card__photos">
                  <summary>Tap to view photos</summary>
                  <div className="supp-card__thumbs">
                    {s.frontImage && <img src={s.frontImage} alt="Front" />}
                    {s.ingredientsImage && <img src={s.ingredientsImage} alt="Label" />}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddScannedItemModal
          kind="supp"
          onClose={() => setShowAdd(false)}
          onConfirm={(item) => addSupp(item)}
        />
      )}

      {editId && editingItem && (
        <AddScannedItemModal
          kind="supp"
          initialItem={editingItem}
          onClose={() => setEditId(null)}
          onConfirm={(item) => saveEdit(item)}
        />
      )}
    </div>
  );
}
