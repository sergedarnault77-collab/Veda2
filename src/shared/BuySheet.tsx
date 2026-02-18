import { useMemo } from "react";
import { detectMarket, getRetailersForMarket, buildSearchQuery } from "../lib/retailers";
import type { Market, Retailer } from "../lib/retailers";
import { loadUser } from "../lib/auth";
import "./BuySheet.css";

interface Props {
  productName: string;
  brand?: string | null;
  onClose: () => void;
}

export default function BuySheet({ productName, brand, onClose }: Props) {
  const market: Market = useMemo(() => {
    const user = loadUser();
    return detectMarket(user?.country);
  }, []);

  const retailers = useMemo(() => getRetailersForMarket(market), [market]);
  const query = useMemo(() => buildSearchQuery(productName, brand), [productName, brand]);

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
