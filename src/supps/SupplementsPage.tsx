import { Component, useEffect, useMemo, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { loadLS, saveLS } from "../lib/persist";
import AddScannedItemModal from "../shared/AddScannedItemModal";
import InteractionWarnings from "../shared/InteractionWarnings";
import BuySheet from "../shared/BuySheet";
import type { Interaction } from "../shared/InteractionWarnings";
import type { ScannedItem, ItemInsights } from "../shared/AddScannedItemModal";
import type { NutrientRow } from "../home/stubs";
import { loadUser } from "../lib/auth";
import {
  resolveTarget,
  getUl,
  getNutrientMeta,
  ageRangeToAgeBucket,
  bioSexToSex,
} from "../lib/nutrition";
import "./SupplementsPage.css";

type Supp = ScannedItem & { id: string; interactions?: Interaction[] };
const LS_KEY = "veda.supps.v1";

function uid() {
  return Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
}

function confLabel(c: number) {
  if (c >= 0.75) return "High";
  if (c >= 0.45) return "Med";
  return "Low";
}

const UNIT_TO_REF: Record<string, "mg" | "ug" | null> = {
  mg: "mg", ug: "ug", "µg": "ug", mcg: "ug",
};

function pctOfTarget(n: NutrientRow): { pct: number; source: "label" | "ref" } | null {
  try {
    if (!n || typeof n.amountToday !== "number") return null;
    const a = Number(n.amountToday);
    if (!isFinite(a) || a <= 0) return null;

    if (n.dailyReference != null) {
      const d = Number(n.dailyReference);
      if (isFinite(d) && d > 0) {
        const pct = Math.round((a / d) * 100);
        if (isFinite(pct)) return { pct, source: "label" };
      }
    }

    const refUnit = UNIT_TO_REF[n.unit] ?? null;
    if (!refUnit || !n.nutrientId) return null;

    const meta = getNutrientMeta(n.nutrientId);
    if (!meta) return null;

    const user = loadUser();
    const sex = bioSexToSex(user?.sex ?? null);
    const ageBucket = ageRangeToAgeBucket(user?.ageRange ?? null);

    let amount = a;
    if (refUnit !== meta.unit) {
      amount = refUnit === "mg" && meta.unit === "ug" ? a * 1000 : a / 1000;
    }

    const t = resolveTarget(sex, ageBucket, n.nutrientId);
    if (!t || t.target <= 0) return null;
    const pct = Math.round((amount / t.target) * 100);
    return isFinite(pct) ? { pct, source: "ref" } : null;
  } catch {
    return null;
  }
}

function ulFlag(n: NutrientRow): "exceeds" | "approaching" | null {
  try {
    if (!n || !n.nutrientId || typeof n.amountToday !== "number") return null;
    const refUnit = UNIT_TO_REF[n.unit] ?? null;
    if (!refUnit) return null;
    const meta = getNutrientMeta(n.nutrientId);
    if (!meta) return null;
    const ulObj = getUl(n.nutrientId);
    if (!ulObj || ulObj.ul == null || ulObj.applies_to === "no_ul") return null;

    let amount = Number(n.amountToday);
    if (!isFinite(amount)) return null;
    if (refUnit !== meta.unit) {
      amount = refUnit === "mg" && meta.unit === "ug" ? amount * 1000 : amount / 1000;
    }
    if (amount > ulObj.ul) return "exceeds";
    if (amount >= ulObj.ul * 0.8) return "approaching";
    return null;
  } catch {
    return null;
  }
}

function pctColor(pct: number, ul: "exceeds" | "approaching" | null): string {
  if (ul === "exceeds") return "var(--veda-red, #e74c3c)";
  if (ul === "approaching") return "var(--veda-orange, #FF8C1A)";
  if (pct > 200) return "var(--veda-red, #e74c3c)";
  return "var(--veda-text-muted)";
}

function riskColor(risk: string) {
  if (risk === "high") return "var(--veda-red, #e74c3c)";
  if (risk === "medium") return "var(--veda-orange, #e67e22)";
  return "var(--veda-accent, #2E5BFF)";
}

/** Fire-and-forget: fetch insights for an item and persist */
async function fetchInteractions(item: ScannedItem): Promise<Interaction[]> {
  try {
    const nutrients = Array.isArray(item.nutrients) ? item.nutrients : [];
    const ingredients = Array.isArray(item.ingredientsList) ? item.ingredientsList : [];
    if (nutrients.length === 0 && ingredients.length === 0) return [];

    const supps = loadLS<any[]>("veda.supps.v1", []);
    const meds = loadLS<any[]>("veda.meds.v1", []);
    const existing = [
      ...meds.map((m: any) => ({ ...m, type: "medication" })),
      ...supps.filter((s: any) => s.displayName !== item.displayName).map((s: any) => ({ ...s, type: "supplement" })),
    ];
    if (existing.length === 0) return [];

    const newItem = {
      displayName: item.displayName,
      type: "supplement",
      nutrients,
      ingredientsList: ingredients,
    };

    const res = await fetch("/api/interactions", {
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
        return lower.includes("supplement") || lower.includes("new") ||
          (nameLower && (lower.includes(nameLower) || nameLower.includes(lower)));
      });
    });
  } catch {
    return [];
  }
}

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

class SuppsErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; errorMsg: string }> {
  state = { hasError: false, errorMsg: "" };
  static getDerivedStateFromError(error: Error) { return { hasError: true, errorMsg: String(error?.message || error) }; }
  componentDidCatch(error: Error, info: any) {
    console.error("[SuppsPage] render crash:", error, info?.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, textAlign: "center", color: "var(--veda-text-muted)" }}>
          <p>Something went wrong loading supplements.</p>
          <p style={{ fontSize: "0.7rem", opacity: 0.5, marginTop: 8 }}>{this.state.errorMsg}</p>
          <button
            className="btn btn--secondary"
            style={{ marginTop: 12 }}
            onClick={() => { this.setState({ hasError: false, errorMsg: "" }); window.location.reload(); }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

class CardErrorBoundary extends Component<{ children: ReactNode; name: string; onRemove: () => void }, { hasError: boolean; errorMsg: string }> {
  state = { hasError: false, errorMsg: "" };
  static getDerivedStateFromError(error: Error) { return { hasError: true, errorMsg: String(error?.message || error) }; }
  componentDidCatch(error: Error, info: any) {
    console.error("[SupplementCard] child crash:", this.props.name, error, info?.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="supp-card" style={{ opacity: 0.6 }}>
          <div className="supp-card__top">
            <div className="supp-card__titleWrap">
              <div className="supp-card__title">{this.props.name || "Supplement"}</div>
            </div>
            <button className="supp-card__remove" onClick={this.props.onRemove}>Remove from daily use</button>
          </div>
          <p style={{ color: "var(--veda-text-muted)", fontSize: "0.8rem", padding: "8px 0" }}>
            Unable to display this card ({this.state.errorMsg})
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

function SupplementCard({
  s,
  removeSupp,
  setBuyId,
  setEditId,
  onUpdateServing,
}: {
  s: Supp;
  removeSupp: (id: string) => void;
  setBuyId: (id: string) => void;
  setEditId: (id: string) => void;
  onUpdateServing: (id: string, servingG: number) => void;
}) {
  const [editingServing, setEditingServing] = useState(false);
  const [servingInput, setServingInput] = useState<string>("");

  const isPer100g = (s as any).nutritionPer === "100g";
  const per100g: NutrientRow[] | null = Array.isArray((s as any).nutrientsPer100g) ? (s as any).nutrientsPer100g : null;
  const currentServingG: number | null = typeof (s as any).servingSizeG === "number" ? (s as any).servingSizeG : null;

  try {
    const nutrients: NutrientRow[] = Array.isArray(s.nutrients) ? (s.nutrients as NutrientRow[]) : [];
    const ingList: string[] = Array.isArray(s.ingredientsList) ? s.ingredientsList : [];
    const ingDetected: string[] = Array.isArray(s.ingredientsDetected) ? s.ingredientsDetected : [];
    const ingToShow = ingList.length > 0 ? ingList : ingDetected;
    const ingCount = ingToShow.length;
    const insights: any = s.insights && typeof s.insights === "object" ? s.insights : null;

    return (
      <div className="supp-card">
        <div className="supp-card__top">
          <div className="supp-card__titleWrap">
            <div className="supp-card__title">{s.displayName || "Unnamed supplement"}</div>
            {s.brand && <div className="supp-card__subtitle">{s.brand}</div>}
          </div>
          <button className="supp-card__remove" onClick={() => removeSupp(s.id)} aria-label="Remove from daily use">
            Remove from daily use
          </button>
        </div>

        <div className="supp-card__grid">
          <div>
            <div className="supp-card__label">Form</div>
            <div className="supp-card__value">{s.form || "—"}</div>
          </div>
          <div>
            <div className="supp-card__label">Serving</div>
            {isPer100g && !editingServing ? (
              <div className="supp-card__value supp-card__value--editable" onClick={() => {
                setServingInput(String(currentServingG ?? ""));
                setEditingServing(true);
              }}>
                {currentServingG ? `${currentServingG}g` : "Set serving"} ✎
              </div>
            ) : isPer100g && editingServing ? (
              <div className="supp-card__serving-edit">
                <input
                  type="number"
                  className="supp-card__serving-input"
                  value={servingInput}
                  min={1}
                  max={500}
                  placeholder="g"
                  autoFocus
                  onChange={(e) => setServingInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = Number(servingInput);
                      if (v > 0 && v <= 500) {
                        onUpdateServing(s.id, v);
                        setEditingServing(false);
                      }
                    } else if (e.key === "Escape") {
                      setEditingServing(false);
                    }
                  }}
                  onBlur={() => {
                    const v = Number(servingInput);
                    if (v > 0 && v <= 500) {
                      onUpdateServing(s.id, v);
                    }
                    setEditingServing(false);
                  }}
                />
                <span className="supp-card__serving-unit">g</span>
              </div>
            ) : (
              <div className="supp-card__value">{s.servingSizeText || "—"}</div>
            )}
          </div>
          <div>
            <div className="supp-card__label">Confidence</div>
            <div className={`supp-card__badge supp-card__badge--${confLabel(s.confidence).toLowerCase()}`}>
              {confLabel(s.confidence)}
            </div>
          </div>
        </div>

        {nutrients.length > 0 && (
          <div className="supp-nutrients">
            <div className="supp-nutrients__hdr">
              <div>Detected nutrients</div>
              <div className="supp-nutrients__sub">{nutrients.length} total</div>
            </div>
            <div className="supp-nutrients__grid">
              {nutrients
                .slice()
                .sort((a, b) => {
                  const pa = pctOfTarget(a);
                  const pb = pctOfTarget(b);
                  return (pb?.pct ?? -1) - (pa?.pct ?? -1);
                })
                .slice(0, 6)
                .map((n) => {
                  const ref = pctOfTarget(n);
                  const ul = ulFlag(n);
                  return (
                    <div className="supp-nutrients__row" key={`${n?.nutrientId ?? ""}-${n?.name ?? ""}`}>
                      <div className="supp-nutrients__name" title={n?.name ?? ""}>
                        {n?.name ?? "—"}
                        {ul && (
                          <span
                            className="supp-nutrients__ul-flag"
                            style={{ color: ul === "exceeds" ? "var(--veda-red, #e74c3c)" : "var(--veda-orange, #FF8C1A)" }}
                          >
                            {ul === "exceeds" ? " ⚠ exceeds UL" : " ↑ near UL"}
                          </span>
                        )}
                      </div>
                      <div className="supp-nutrients__amt">{n?.amountToday ?? 0}{n?.unit ?? ""}</div>
                      <div
                        className="supp-nutrients__pct"
                        style={ref ? { color: pctColor(ref.pct, ul) } : undefined}
                      >
                        {ref ? `${ref.pct}%` : ""}
                      </div>
                    </div>
                  );
                })}
            </div>
            <div className="supp-nutrients__source">From supplements</div>
            {nutrients.length > 6 && (
              <div className="supp-nutrients__more">+{nutrients.length - 6} more</div>
            )}
          </div>
        )}

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

        {Array.isArray(s.interactions) && s.interactions.length > 0 && (
          <InteractionWarnings interactions={s.interactions} />
        )}

        {insights && (insights.summary || (Array.isArray(insights.overlaps) && insights.overlaps.length > 0) || (Array.isArray(insights.notes) && insights.notes.length > 0)) && (
          <div className="item-insights">
            <div className="item-insights__title">Insights</div>
            {insights.summary && (
              <div className="item-insights__summary">{insights.summary}</div>
            )}
            {(Array.isArray(insights.overlaps) ? insights.overlaps : []).slice(0, 2).map((o: any, i: number) => (
              <div className="item-insights__overlap" key={`${o?.key ?? ""}-${i}`}>
                <span
                  className="item-insights__badge"
                  style={{ background: riskColor(o?.risk), opacity: 0.85 }}
                >
                  {o?.risk ?? ""}
                </span>
                <span className="item-insights__what">{o?.what ?? ""}</span>
              </div>
            ))}
            {(Array.isArray(insights.notes) ? insights.notes : []).slice(0, 2).map((note: string, i: number) => (
              <div className="item-insights__note" key={i}>{note}</div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <button className="btn btn--primary supp-card__buy" onClick={() => setBuyId(s.id)}>
            🛒 Buy / Refill
          </button>
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
  } catch (err: any) {
    console.error("[SupplementCard] render crash for", s?.displayName, err);
    return (
      <div className="supp-card" style={{ opacity: 0.6 }}>
        <div className="supp-card__top">
          <div className="supp-card__titleWrap">
            <div className="supp-card__title">{s?.displayName || "Supplement"}</div>
          </div>
          <button className="supp-card__remove" onClick={() => removeSupp(s.id)} aria-label="Remove">
            Remove from daily use
          </button>
        </div>
        <p style={{ color: "var(--veda-text-muted)", fontSize: "0.8rem", padding: "8px 0" }}>
          Unable to display this card ({String(err?.message || "unknown error")})
        </p>
      </div>
    );
  }
}

function SupplementsPageInner() {
  const [items, setItems] = useState<Supp[]>(() => loadLS<Supp[]>(LS_KEY, []));
  const [showAdd, setShowAdd] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [buyId, setBuyId] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setItems(loadLS<Supp[]>(LS_KEY, []));
    window.addEventListener("veda:supps-updated", refresh);
    return () => window.removeEventListener("veda:supps-updated", refresh);
  }, []);

  const persistUpdate = (updater: (prev: Supp[]) => Supp[]) => {
    setItems((prev) => {
      const next = updater(prev);
      saveLS(LS_KEY, next);
      return next;
    });
  };

  const addSupp = (s: ScannedItem) => {
    const newId = uid();
    persistUpdate((prev) => [{ ...s, id: newId }, ...prev]);
    fetchInsights(s).then((ins) => {
      if (ins) {
        persistUpdate((prev) =>
          prev.map((it) => (it.id === newId ? { ...it, insights: ins } : it))
        );
      }
    });
    fetchInteractions(s).then((ix) => {
      if (ix.length > 0) {
        persistUpdate((prev) =>
          prev.map((it) => (it.id === newId ? { ...it, interactions: ix } : it))
        );
      }
    });
  };

  const saveEdit = (updated: ScannedItem) => {
    if (!editId) return;
    const savedId = editId;
    persistUpdate((prev) =>
      prev.map((it) => (it.id === savedId ? { ...it, ...updated } : it))
    );
    setEditId(null);
    fetchInsights(updated).then((ins) => {
      if (ins) {
        persistUpdate((prev) =>
          prev.map((it) => (it.id === savedId ? { ...it, insights: ins } : it))
        );
      }
    });
  };

  const removeSupp = (rid: string) => {
    persistUpdate((prev) => prev.filter((x) => x.id !== rid));
  };

  const updateServing = (id: string, newServingG: number) => {
    persistUpdate((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const s = it as any;
        const per100g: NutrientRow[] | null = Array.isArray(s.nutrientsPer100g) ? s.nutrientsPer100g : null;
        const baseNutrients: NutrientRow[] = per100g ?? (Array.isArray(s.nutrients) ? s.nutrients : []);
        const oldServingG: number | null = typeof s.servingSizeG === "number" ? s.servingSizeG : null;

        let scaled: NutrientRow[];
        if (per100g) {
          const scale = newServingG / 100;
          scaled = per100g.map((n: NutrientRow) => ({
            ...n,
            amountToday: Math.round(n.amountToday * scale * 100) / 100,
          }));
        } else if (oldServingG && oldServingG > 0) {
          const ratio = newServingG / oldServingG;
          scaled = baseNutrients.map((n: NutrientRow) => ({
            ...n,
            amountToday: Math.round(n.amountToday * ratio * 100) / 100,
          }));
        } else {
          scaled = baseNutrients;
        }

        return {
          ...it,
          servingSizeG: newServingG,
          servingSizeText: `${newServingG}g`,
          nutrients: scaled,
          nutrientsPer100g: per100g ?? baseNutrients,
        };
      }),
    );
  };

  const submitUrl = useCallback(async () => {
    const trimmed = urlValue.trim();
    if (!trimmed) return;
    setUrlError(null);
    setUrlLoading(true);
    try {
      const res = await fetch("/api/parse-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      let data: any;
      try {
        data = await res.json();
      } catch {
        const text = await res.text().catch(() => "");
        setUrlError(
          `Server returned an unexpected response (HTTP ${res.status}). ${text.slice(0, 80)}`,
        );
        return;
      }

      if (!data?.ok) {
        setUrlError(data?.error || "Could not extract supplement data from that URL.");
        return;
      }

      const item: ScannedItem = {
        displayName: data.productName || "Supplement (from URL)",
        brand: data.brand || null,
        form: data.form || null,
        strengthPerUnit: null,
        strengthUnit: null,
        servingSizeText: data.servingSizeText || null,
        rawTextHints: [trimmed],
        confidence: 0.7,
        mode: "openai",
        frontImage: null,
        ingredientsImage: null,
        ingredientsImages: [],
        labelTranscription: null,
        nutrients: (data.nutrients || []).filter(
          (n: any) => n && typeof n.nutrientId === "string" && typeof n.amountToday === "number",
        ),
        ingredientsDetected: [],
        ingredientsList: data.ingredientsList || [],
        ingredientsCount: (data.ingredientsList || []).length,
        insights: null,
        meta: { transcriptionConfidence: 0.7, needsRescan: false, rescanHint: null },
        createdAtISO: new Date().toISOString(),
      };

      addSupp(item);
      setShowUrlInput(false);
      setUrlValue("");
      setUrlError(null);
    } catch (err: any) {
      setUrlError(`Request failed: ${err?.message || "check your connection and try again."}`);
    } finally {
      setUrlLoading(false);
    }
  }, [urlValue]);

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
        <div className="supps-page__actions">
          <button className="supps-page__add" onClick={() => setShowAdd(true)}>
            + Scan
          </button>
          <button
            className="supps-page__add supps-page__add--url"
            onClick={() => { setShowUrlInput(true); setUrlError(null); }}
          >
            + URL
          </button>
        </div>
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
          {items.map((s) => (
            <CardErrorBoundary key={s.id} name={s?.displayName ?? ""} onRemove={() => removeSupp(s.id)}>
              <SupplementCard s={s} removeSupp={removeSupp} setBuyId={setBuyId} setEditId={setEditId} onUpdateServing={updateServing} />
            </CardErrorBoundary>
          ))}
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

      {buyId && (() => {
        const buyItem = items.find((x) => x.id === buyId);
        if (!buyItem) return null;
        return (
          <BuySheet
            productName={buyItem.displayName}
            brand={buyItem.brand}
            nutrients={Array.isArray(buyItem.nutrients) ? buyItem.nutrients as any : []}
            form={buyItem.form}
            onClose={() => setBuyId(null)}
          />
        );
      })()}

      {showUrlInput && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card supps-url-modal">
            <button
              className="modal-close"
              onClick={() => { setShowUrlInput(false); setUrlError(null); }}
              aria-label="Close"
            >
              ×
            </button>

            <h2>Add from URL</h2>
            <p className="modal-sub">
              Paste a product page URL and we'll extract the supplement facts.
            </p>

            <label className="modal-label">Product URL</label>
            <input
              className="modal-input"
              type="url"
              placeholder="https://..."
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !urlLoading) submitUrl(); }}
              disabled={urlLoading}
              autoFocus
            />

            {urlError && (
              <div className="supps-url-modal__error">{urlError}</div>
            )}

            {urlLoading && (
              <div className="supps-url-modal__loading">
                <div className="supps-url-modal__spinner" />
                Fetching and analyzing page…
              </div>
            )}

            <div className="modal-actions">
              <button
                className="btn btn--secondary"
                onClick={() => { setShowUrlInput(false); setUrlError(null); }}
                disabled={urlLoading}
              >
                Cancel
              </button>
              <button
                className="btn btn--primary"
                onClick={submitUrl}
                disabled={urlLoading || !urlValue.trim()}
              >
                {urlLoading ? "Extracting…" : "Add supplement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SupplementsPage() {
  return (
    <SuppsErrorBoundary>
      <SupplementsPageInner />
    </SuppsErrorBoundary>
  );
}
