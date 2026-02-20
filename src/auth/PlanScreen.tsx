import { useState, useEffect } from "react";
import type { Plan } from "../lib/auth";
import {
  isNativePlatform,
  getOfferings,
  purchasePackage,
  restorePurchases,
} from "../lib/purchases";
import type { VedaOffering } from "../lib/purchases";
import "./PlanScreen.css";

interface Props {
  onSelect: (plan: Plan) => void;
}

export default function PlanScreen({ onSelect }: Props) {
  const [offerings, setOfferings] = useState<VedaOffering[]>([]);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNative = isNativePlatform();

  useEffect(() => {
    if (isNative) {
      getOfferings().then(setOfferings);
    }
  }, [isNative]);

  const aiOffering = offerings[0] ?? null;

  async function handlePurchase() {
    if (!aiOffering) return;
    setPurchasing(true);
    setError(null);

    const result = await purchasePackage(aiOffering.identifier);
    setPurchasing(false);

    if (result.success && result.isActive) {
      onSelect("ai");
    } else if (result.error && result.error !== "cancelled") {
      setError(result.error);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    setError(null);

    const active = await restorePurchases();
    setRestoring(false);

    if (active) {
      onSelect("ai");
    } else {
      setError("No active subscription found.");
    }
  }

  return (
    <div className="plans">
      <div className="plans__logo">Veda</div>
      <h1 className="plans__title">Choose your plan</h1>
      <p className="plans__sub">You can change your plan at any time.</p>

      <div className="plans__grid">
        {/* Freemium */}
        <div className="plans__card">
          <div className="plans__cardTag">Free</div>
          <h2 className="plans__cardTitle">Freemium</h2>
          <p className="plans__cardDesc">Manual tracking</p>

          <ul className="plans__features">
            <li className="plans__feature plans__feature--on">Supplement list</li>
            <li className="plans__feature plans__feature--on">Medication list</li>
            <li className="plans__feature plans__feature--off">AI analysis</li>
            <li className="plans__feature plans__feature--off">Signal interpretation</li>
            <li className="plans__feature plans__feature--off">Scan-based insights</li>
          </ul>

          <button
            className="plans__cta plans__cta--secondary"
            onClick={() => onSelect("freemium")}
          >
            Start free
          </button>
        </div>

        {/* AI */}
        <div className="plans__card plans__card--highlight">
          <div className="plans__cardTag plans__cardTag--accent">Recommended</div>
          <h2 className="plans__cardTitle">Veda AI</h2>
          <p className="plans__cardDesc">
            {aiOffering ? aiOffering.priceString + "/mo" : "Smart insights"}
          </p>

          <ul className="plans__features">
            <li className="plans__feature plans__feature--on">Everything in Freemium</li>
            <li className="plans__feature plans__feature--on">AI label analysis</li>
            <li className="plans__feature plans__feature--on">Signal interpretation</li>
            <li className="plans__feature plans__feature--on">Scan, understand, track</li>
            <li className="plans__feature plans__feature--on">Stack coverage insights</li>
          </ul>

          {isNative && aiOffering ? (
            <button
              className="plans__cta plans__cta--primary"
              onClick={handlePurchase}
              disabled={purchasing}
            >
              {purchasing ? "Processing…" : `Subscribe ${aiOffering.priceString}/mo`}
            </button>
          ) : (
            <button
              className="plans__cta plans__cta--primary"
              onClick={() => onSelect("ai")}
            >
              Start with AI
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="plans__error">{error}</p>
      )}

      {isNative && (
        <button
          className="plans__restore"
          onClick={handleRestore}
          disabled={restoring}
        >
          {restoring ? "Restoring…" : "Restore purchases"}
        </button>
      )}
    </div>
  );
}
