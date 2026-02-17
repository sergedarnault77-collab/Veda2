import { STUB_EXPOSURE } from "./stubs";
import "./DailyReferenceBars.css";

export function DailyReferenceBars() {
  const visualMax: Record<string, number> = {
    "Added sugars (today)": 50,
    "Sweetener types detected": 10,
    "Calories from scanned items": 1000,
    "Caffeine exposure": 400,
  };

  return (
    <section className="exposure" aria-label="Exposure signals">
      <h3 className="exposure__title">Today's exposure</h3>

      <ul className="exposure__list">
        {STUB_EXPOSURE.map((e) => {
          const max = visualMax[e.label] ?? 100;
          const pct = Math.min((e.value / max) * 100, 100);
          return (
            <li key={e.label} className="exposure__item">
              <div className="exposure__label-row">
                <span className="exposure__label">{e.label}</span>
                <span className="exposure__value">
                  {e.value} {e.unit}
                </span>
              </div>
              <div className="exposure__track">
                <div
                  className="exposure__fill"
                  style={{ width: `${pct}%`, background: e.color }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="exposure__scope">Scanned items only — not full daily intake.</div>
    </section>
  );
}
