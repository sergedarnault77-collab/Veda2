import type { InsightLens } from "../types/insights";

export default function MeaningBlock({ meaning }: { meaning: InsightLens }) {
  return (
    <div className="meaning-grid">
      <div className="meaning-lens">
        <div className="meaning-lens__label">Now</div>
        <ul className="meaning-lens__list">
          {meaning.now.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </div>

      <div className="meaning-lens">
        <div className="meaning-lens__label">Over time</div>
        <ul className="meaning-lens__list">
          {meaning.overTime.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
