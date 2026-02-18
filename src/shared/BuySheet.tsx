import { useMemo } from "react";
import { detectMarket, getRetailersForMarket, buildSearchQuery } from "../lib/retailers";
import type { Market, Retailer } from "../lib/retailers";
import type { NutrientRow } from "../home/stubs";
import { loadUser } from "../lib/auth";
import "./BuySheet.css";

interface Props {
  productName: string;
  brand?: string | null;
  nutrients?: NutrientRow[];
  form?: string | null;
  onClose: () => void;
}

function buildIngredientQuery(nutrients: NutrientRow[], form?: string | null): string | null {
  if (!nutrients.length) return null;

  const top = nutrients
    .slice()
    .sort((a, b) => (b.amountToday ?? 0) - (a.amountToday ?? 0))
    .slice(0, 3);

  const parts = top.map((n) => {
    const amt = n.amountToday;
    const unit = n.unit || "mg";
    return `${n.name} ${amt}${unit}`;
  });

  let q = parts.join(" + ");
  if (form && form !== "other") q += ` ${form}`;
  return q.slice(0, 120);
}

export default function BuySheet({ productName, brand, nutrients, form, onClose }: Props) {
  const market: Market = useMemo(() => {
    const user = loadUser();
    return detectMarket(user?.country);
  }, []);

  const retailers = useMemo(() => getRetailersForMarket(market), [market]);

  const { query, isEquivalent, ingredientLabel } = useMemo(() => {
    const ingredientQ = buildIngredientQuery(nutrients || [], form);
    const nameQ = buildSearchQuery(productName, brand);

    if (ingredientQ) {
      return { query: ingredientQ, isEquivalent: true, ingredientLabel: ingredientQ };
    }
    return { query: nameQ, isEquivalent: false, ingredientLabel: null };
  }, [productName, brand, nutrients, form]);

  const marketLabel: Record<Market, string> = {
    CH: "Switzerland", US: "United States", DE: "Germany",
    NL: "Netherlands", EU: "Europe",
  };

  return (
    <div className="buy-backdrop" onClick={onClose}>
      <div className="buy-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="buy-sheet__handle" />

        <div className="buy-sheet__header">
          <h3 className="buy-sheet__title">Buy / Refill</h3>
          <p className="buy-sheet__product">{productName}</p>
          <span className="buy-sheet__market">{marketLabel[market] ?? market}</span>
        </div>

        {isEquivalent && ingredientLabel && (
          <div className="buy-sheet__equiv">
            <div className="buy-sheet__equiv-label">Searching for equivalent</div>
            <div className="buy-sheet__equiv-query">{ingredientLabel}</div>
            <div className="buy-sheet__equiv-note">
              Same active ingredients and dosage — any matching brand will work.
            </div>
          </div>
        )}

        <div className="buy-sheet__list">
          {retailers.map((r: Retailer) => (
            <a
              key={r.id}
              className="buy-sheet__row"
              href={r.searchUrl(query)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="buy-sheet__icon">{r.icon}</span>
              <div className="buy-sheet__info">
                <div className="buy-sheet__retailer">{r.name}</div>
                <div className="buy-sheet__type">{r.type}</div>
              </div>
              <span className="buy-sheet__arrow">→</span>
            </a>
          ))}
        </div>

        <p className="buy-sheet__disclaimer">
          You'll complete your purchase on the retailer's site. Veda does not sell products directly.
        </p>

        <button className="buy-sheet__close" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
