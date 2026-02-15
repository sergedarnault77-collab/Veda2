import { useMemo, useState } from "react";
import { loadLS, saveLS } from "../lib/persist";
import AddScannedItemModal from "../shared/AddScannedItemModal";
import type { ScannedItem, ItemInsights } from "../shared/AddScannedItemModal";
import type { NutrientRow } from "../home/stubs";
import "./SupplementsPage.css";

type Supp = ScannedItem & { id: string };
const LS_KEY = "veda.supps.v1";

function uid() {
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

function riskColor(risk: string) {
  if (risk === "high") return "var(--veda-red, #e74c3c)";
  if (risk === "medium") return "var(--veda-orange, #e67e22)";
  return "var(--veda-green, #2ecc71)";
}

/** Fire-and-forget: fetch insights for an item and persist */
async function fetchInsights(item: ScannedItem): Promise<ItemInsights | null> {
  try {
    const res = await fetch("/api/advise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            id: "single",
            displayName: item.displayName,
            nutrients: item.nutrients ?? [],
            ingredientsList: item.ingredientsList ?? [],
            labelTranscription: item.labelTranscription ?? null,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.ok) return null;
    return {
      summary: json.summary || "",
      overlaps: Array.isArray(json.overlaps) ? json.overlaps : [],
      notes: Array.isArray(json.notes) ? json.notes : [],
    };
  } catch {
    return null;
  }
}

export default function SupplementsPage() {
  const [items, setItems] = useState<Supp[]>(() => loadLS<Supp[]>(LS_KEY, []));
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const persist = (next: Supp[]) => {
    setItems(next);
    saveLS(LS_KEY, next);
  };

  const updateItemInsights = (itemId: string, insights: ItemInsights) => {
    setItems((prev) => {
      const next = prev.map((it) => (it.id === itemId ? { ...it, insights } : it));
      saveLS(LS_KEY, next);
      return next;
    });
  };

  const addSupp = (s: ScannedItem) => {
    const newId = uid();
    const next: Supp[] = [{ ...s, id: newId }, ...items];
    persist(next);
    // Fetch insights in background
    fetchInsights(s).then((ins) => {
      if (ins) updateItemInsights(newId, ins);
    });
  };

  const saveEdit = (updated: ScannedItem) => {
    if (!editId) return;
    const next = items.map((it) => (it.id === editId ? { ...it, ...updated } : it));
    persist(next);
    const savedId = editId;
    setEditId(null);
    // Fetch insights in background
    fetchInsights(updated).then((ins) => {
      if (ins) updateItemInsights(savedId, ins);
    });
  };

  const removeSupp = (rid: string) => {
    persist(items.filter((x) => x.id !== rid));
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
            const nutrients: NutrientRow[] = Array.isArray(s.nutrients) ? (s.nutrients as NutrientRow[]) : [];
            const ingList: string[] = Array.isArray(s.ingredientsList) ? s.ingredientsList : [];
            const ingDetected: string[] = Array.isArray(s.ingredientsDetected) ? s.ingredientsDetected : [];
            const ingToShow = ingList.length > 0 ? ingList : ingDetected;
            const ingCount = ingToShow.length;
            const insights = s.insights;

            return (
              <div className="supp-card" key={s.id}>
                <div className="supp-card__top">
                  <div className="supp-card__titleWrap">
                    <div className="supp-card__title">{s.displayName}</div>
                    {s.brand && <div className="supp-card__subtitle">{s.brand}</div>}
                  </div>
                  <button className="supp-card__remove" onClick={() => removeSupp(s.id)} aria-label="Remove">
                    x
                  </button>
                </div>

                <div className="supp-card__grid">
                  <div>
                    <div className="supp-card__label">Form</div>
                    <div className="supp-card__value">{s.form || "\u2014"}</div>
                  </div>
                  <div>
                    <div className="supp-card__label">Serving</div>
                    <div className="supp-card__value">{s.servingSizeText || "\u2014"}</div>
                  </div>
                  <div>
                    <div className="supp-card__label">Confidence</div>
                    <div className={`supp-card__badge supp-card__badge--${confLabel(s.confidence).toLowerCase()}`}>
                      {confLabel(s.confidence)}
                    </div>
                  </div>
                </div>

                {/* Nutrients table */}
                {nutrients.length > 0 && (
                  <div className="supp-nutrients">
                    <div className="supp-nutrients__hdr">
                      <div>Detected nutrients</div>
                      <div className="supp-nutrients__sub">{nutrients.length} total</div>
                    </div>
                    <div className="supp-nutrients__grid">
                      {nutrients
                        .slice()
                        .sort((a, b) => (pctDV(b) ?? -1) - (pctDV(a) ?? -1))
                        .slice(0, 6)
                        .map((n) => {
                          const pct = pctDV(n);
                          return (
                            <div className="supp-nutrients__row" key={`${n.nutrientId}-${n.name}`}>
                              <div className="supp-nutrients__name" title={n.name}>{n.name}</div>
                              <div className="supp-nutrients__amt">{n.amountToday}{n.unit}</div>
                              <div className="supp-nutrients__pct">{pct === null ? "\u2014" : `${pct}% DV`}</div>
                            </div>
                          );
                        })}
                    </div>
                    {nutrients.length > 6 && (
                      <div className="supp-nutrients__more">+{nutrients.length - 6} more</div>
                    )}
                  </div>
                )}

                {/* Ingredients list */}
                {ingCount > 0 && (
                  <details className="item-ingredients">
                    <summary className="item-ingredients__summary">
                      Detected ingredients: {ingCount}{ingList.length === 0 ? " (from categories)" : ""}
                    </summary>
                    <div className="item-ingredients__list">
                      {ingToShow.map((ing, i) => (
                        <span className="item-ingredients__chip" key={`${ing}-${i}`}>{ing}</span>
                      ))}
                    </div>
                  </details>
                )}

                {/* Insights */}
                {insights && (insights.summary || insights.overlaps.length > 0 || insights.notes.length > 0) && (
                  <div className="item-insights">
                    <div className="item-insights__title">Insights</div>
                    {insights.summary && (
                      <div className="item-insights__summary">{insights.summary}</div>
                    )}
                    {insights.overlaps.slice(0, 2).map((o, i) => (
                      <div className="item-insights__overlap" key={`${o.key}-${i}`}>
                        <span
                          className="item-insights__badge"
                          style={{ background: riskColor(o.risk), opacity: 0.85 }}
                        >
                          {o.risk}
                        </span>
                        <span className="item-insights__what">{o.what}</span>
                      </div>
                    ))}
                    {insights.notes.slice(0, 2).map((note, i) => (
                      <div className="item-insights__note" key={i}>{note}</div>
                    ))}
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
