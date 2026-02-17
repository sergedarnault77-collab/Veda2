import type { Plan } from "../lib/auth";
import "./PlanScreen.css";

interface Props {
  onSelect: (plan: Plan) => void;
}

export default function PlanScreen({ onSelect }: Props) {
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
          <p className="plans__cardDesc">Smart insights</p>

          <ul className="plans__features">
            <li className="plans__feature plans__feature--on">Everything in Freemium</li>
            <li className="plans__feature plans__feature--on">AI label analysis</li>
            <li className="plans__feature plans__feature--on">Signal interpretation</li>
            <li className="plans__feature plans__feature--on">Scan, understand, track</li>
            <li className="plans__feature plans__feature--on">Stack coverage insights</li>
          </ul>

          <button
            className="plans__cta plans__cta--primary"
            onClick={() => onSelect("ai")}
          >
            Start with AI
          </button>
        </div>
      </div>
    </div>
  );
}
