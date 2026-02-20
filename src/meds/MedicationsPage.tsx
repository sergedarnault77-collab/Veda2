import { useEffect, useMemo, useState } from "react";
import { loadLS, saveLS } from "../lib/persist";
import { apiFetch } from "../lib/api";
import { prepareImagesForStorage } from "../lib/image-storage";
import { findExistingIdx } from "../lib/dedup";
import { translateName } from "../lib/translate-nutrients";
import AddScannedItemModal from "../shared/AddScannedItemModal";
import InteractionWarnings from "../shared/InteractionWarnings";
import type { Interaction } from "../shared/InteractionWarnings";
import type { ScannedItem, ItemInsights } from "../shared/AddScannedItemModal";
import type { NutrientRow } from "../home/stubs";
import "./MedicationsPage.css";

type Med = ScannedItem & { id: string; interactions?: Interaction[] };
const LS_KEY = "veda.meds.v1";

function uid() {
  return Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
}

function confLabel(c: number) {
  if (c >= 0.75) return "High";
  if (c >= 0.45) return "Med";
  return "Low";
}

function pctDV(n: NutrientRow) {
  if (n.dailyReference == null) return null;
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
  return "var(--veda-accent, #2E5BFF)";
}

type ScheduleTime = "morning" | "afternoon" | "evening" | "night";
const SCHEDULE_OPTIONS: { value: ScheduleTime; label: string; icon: string }[] = [
  { value: "morning", label: "Morning", icon: "🌅" },
  { value: "afternoon", label: "Afternoon", icon: "☀️" },
  { value: "evening", label: "Evening", icon: "🌆" },
  { value: "night", label: "Night", icon: "🌙" },
];

async function fetchInteractions(item: ScannedItem): Promise<Interaction[]> {
  try {
    const nutrients = Array.isArray(item.nutrients) ? item.nutrients : [];
    const ingredients = Array.isArray(item.ingredientsList) ? item.ingredientsList : [];
    if (nutrients.length === 0 && ingredients.length === 0) return [];

    const supps = loadLS<any[]>("veda.supps.v1", []);
    const meds = loadLS<any[]>("veda.meds.v1", []);
    const existing = [
      ...meds.filter((m: any) => m.displayName !== item.displayName).map((m: any) => ({ ...m, type: "medication" })),
      ...supps.map((s: any) => ({ ...s, type: "supplement" })),
    ];
    if (existing.length === 0) return [];

    const newItem = {
      displayName: item.displayName,
      type: "medication",
      nutrients,
      ingredientsList: ingredients,
    };

    const res = await apiFetch("/api/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newItem, existingItems: existing }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data?.ok || !Array.isArray(data.interactions)) return [];

    const nameLower = (item.displayName || "").toLowerCase();
    return data.interactions.filter((ix: Interaction) => {
      if (!Array.isArray(ix.items) || ix.items.length === 0) return false;
      return ix.items.some((s) => {
        const lower = (s || "").toLowerCase();
        return lower.includes("medication") || lower.includes("new") ||
          (nameLower && (lower.includes(nameLower) || nameLower.includes(lower)));
      });
    });
  } catch {
    return [];
  }
}

async function fetchInsights(item: ScannedItem): Promise<ItemInsights | null> {
  try {
    const res = await apiFetch("/api/advise", {
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

export default function MedicationsPage() {
  const [items, setItems] = useState<Med[]>(() => loadLS<Med[]>(LS_KEY, []));
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualName, setManualName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setItems(loadLS<Med[]>(LS_KEY, []));
    window.addEventListener("veda:meds-updated", refresh);
    return () => window.removeEventListener("veda:meds-updated", refresh);
  }, []);

  const persistUpdate = (updater: (prev: Med[]) => Med[]) => {
    setItems((prev) => {
      const next = updater(prev);
      saveLS(LS_KEY, next);
      return next;
    });
  };

  const addMed = (m: ScannedItem) => {
    const existingIdx = findExistingIdx(items, m.displayName || "");
    const itemId = existingIdx >= 0 ? items[existingIdx].id : uid();

    const upsert = (data: any) => {
      persistUpdate((prev) => {
        const idx = prev.findIndex((x) => x.id === itemId);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...data, id: itemId, insights: prev[idx].insights ?? null };
          return updated;
        }
        return [{ ...data, id: itemId }, ...prev];
      });
    };

    prepareImagesForStorage(m).then(upsert).catch(() => {
      upsert({ ...m, frontImage: null, ingredientsImage: null, ingredientsImages: undefined });
    });
    fetchInsights(m).then((ins) => {
      if (ins) {
        persistUpdate((prev) =>
          prev.map((it) => (it.id === itemId ? { ...it, insights: ins } : it))
        );
      }
    });
    fetchInteractions(m).then((ix) => {
      if (ix.length > 0) {
        persistUpdate((prev) =>
          prev.map((it) => (it.id === itemId ? { ...it, interactions: ix } : it))
        );
      }
    });
  };

  const saveEdit = (updated: ScannedItem) => {
    if (!editId) return;
    const savedId = editId;
    prepareImagesForStorage(updated).then((small) => {
      persistUpdate((prev) =>
        prev.map((it) => (it.id === savedId ? { ...it, ...small } : it))
      );
    }).catch(() => {
      persistUpdate((prev) =>
        prev.map((it) => (it.id === savedId ? { ...it, ...updated, frontImage: null, ingredientsImage: null, ingredientsImages: undefined } : it))
      );
    });
    setEditId(null);
    fetchInsights(updated).then((ins) => {
      if (ins) {
        persistUpdate((prev) =>
          prev.map((it) => (it.id === savedId ? { ...it, insights: ins } : it))
        );
      }
    });
  };

  const removeMed = (rid: string) => {
    persistUpdate((prev) => prev.filter((x) => x.id !== rid));
  };

  const updateSchedule = (id: string, schedule: ScheduleTime | undefined) => {
    persistUpdate((prev) =>
      prev.map((it) => (it.id !== id ? it : { ...it, schedule }))
    );
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
          <p>Your daily medications. Scan products on the Scan tab to add them here.</p>
        </div>
        <button className="meds-page__add" onClick={() => { setShowManualAdd(true); setManualName(""); }}>
          + Manual
        </button>
      </div>

      {items.length === 0 ? (
        <div className="meds-page__empty">
          <div className="meds-page__emptyCard">
            <div>No medications added yet.</div>
            <div className="meds-page__emptySub">Go to the Scan tab to photograph a medication, then save it here.</div>
          </div>
        </div>
      ) : (
        <div className="meds-page__list">
          {items.map((m) => {
            const nutrients: NutrientRow[] = Array.isArray(m.nutrients) ? (m.nutrients as NutrientRow[]) : [];
            const ingList: string[] = Array.isArray(m.ingredientsList) ? m.ingredientsList : [];
            const ingDetected: string[] = Array.isArray(m.ingredientsDetected) ? m.ingredientsDetected : [];
            const ingToShow = ingList.length > 0 ? ingList : ingDetected;
            const ingCount = ingToShow.length;
            const insights = m.insights;

            return (
              <div className="med-card" key={m.id}>
                <div className="med-card__top">
                  <div className="med-card__titleWrap">
                    <div className="med-card__title">{m.displayName}</div>
                    {m.brand && <div className="med-card__subtitle">{m.brand}</div>}
                  </div>
                  <button className="med-card__remove" onClick={() => removeMed(m.id)} aria-label="Remove from daily use">
                    Remove from daily use
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

                {/* Schedule picker */}
                <div className="med-card__schedule">
                  <div className="med-card__label">When do you take this?</div>
                  <div className="med-card__schedule-pills">
                    {SCHEDULE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        className={`med-card__schedule-pill${m.schedule === opt.value ? " med-card__schedule-pill--active" : ""}`}
                        onClick={() => updateSchedule(m.id, m.schedule === opt.value ? undefined : opt.value)}
                      >
                        <span className="med-card__schedule-icon">{opt.icon}</span>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Nutrients table */}
                {nutrients.length > 0 && (
                  <div className="med-nutrients">
                    <div className="med-nutrients__hdr">
                      <div>Detected nutrients</div>
                      <div className="med-nutrients__sub">{nutrients.length} total</div>
                    </div>
                    <div className="med-nutrients__grid">
                      {nutrients
                        .slice()
                        .sort((a, b) => (pctDV(b) ?? -1) - (pctDV(a) ?? -1))
                        .slice(0, 6)
                        .map((n) => {
                          const pct = pctDV(n);
                          return (
                            <div className="med-nutrients__row" key={`${n.nutrientId}-${n.name}`}>
                              <div className="med-nutrients__name" title={translateName(n.name)}>{translateName(n.name)}</div>
                              <div className="med-nutrients__amt">{n.amountToday}{n.unit}</div>
                              <div className="med-nutrients__pct">{pct === null ? "" : `${pct}%`}</div>
                            </div>
                          );
                        })}
                    </div>
                    {nutrients.length > 6 && (
                      <div className="med-nutrients__more">+{nutrients.length - 6} more</div>
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

                {/* Interaction warnings */}
                {Array.isArray(m.interactions) && m.interactions.length > 0 && (
                  <InteractionWarnings interactions={m.interactions} />
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
            );
          })}
        </div>
      )}

      {showManualAdd && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <button className="modal-close" onClick={() => setShowManualAdd(false)} aria-label="Close">×</button>
            <h2>Add medication manually</h2>
            <p className="modal-sub">Type the medication name. For full ingredient data, scan the label on the Scan tab.</p>
            <label className="modal-label">Name</label>
            <input
              className="modal-input"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="e.g. Ibuprofen"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && manualName.trim()) {
                  addMed({
                    displayName: manualName.trim(),
                    brand: null, form: null, strengthPerUnit: null, strengthUnit: null,
                    servingSizeText: null, rawTextHints: [], confidence: 0, mode: "stub",
                    frontImage: null, ingredientsImage: null, ingredientsImages: [],
                    labelTranscription: null, nutrients: [], ingredientsDetected: [],
                    ingredientsList: [], ingredientsCount: 0, insights: null,
                    meta: { transcriptionConfidence: 0, needsRescan: false, rescanHint: null },
                    createdAtISO: new Date().toISOString(),
                  });
                  setShowManualAdd(false);
                }
              }}
            />
            <div className="modal-actions">
              <button className="btn btn--secondary" onClick={() => setShowManualAdd(false)}>Cancel</button>
              <button
                className="btn btn--primary"
                disabled={!manualName.trim()}
                onClick={() => {
                  if (!manualName.trim()) return;
                  addMed({
                    displayName: manualName.trim(),
                    brand: null, form: null, strengthPerUnit: null, strengthUnit: null,
                    servingSizeText: null, rawTextHints: [], confidence: 0, mode: "stub",
                    frontImage: null, ingredientsImage: null, ingredientsImages: [],
                    labelTranscription: null, nutrients: [], ingredientsDetected: [],
                    ingredientsList: [], ingredientsCount: 0, insights: null,
                    meta: { transcriptionConfidence: 0, needsRescan: false, rescanHint: null },
                    createdAtISO: new Date().toISOString(),
                  });
                  setShowManualAdd(false);
                }}
              >
                Add medication
              </button>
            </div>
          </div>
        </div>
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
