import type { HomeSituationModel } from "../types/insights";
import InsightCard from "./InsightCard";
import "./HomeSituationPanel.css";

export default function HomeSituationPanel({ model }: { model: HomeSituationModel }) {
  if (model.insights.length === 0) {
    return (
      <section className="situation">
        <div className="situation__empty">
          <div className="situation__empty-title">Your current situation</div>
          <div className="situation__empty-text">
            Mark supplements as taken or scan a product to see how your stack fits together.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="situation">
      <div className="situation__header">
        <div>
          <div className="situation__title">
            {model.mode === "preview" ? "Preview" : "Your current situation"}
          </div>
          <div className="situation__subtitle">
            {model.mode === "preview"
              ? model.previewLabel ?? "Preview: If you add this"
              : "How your current stack fits together \u2014 now and over time."}
          </div>
        </div>

        {model.mode === "preview" && (
          <span className="situation__badge">Not saved yet</span>
        )}
      </div>

      <div className="situation__cards">
        {model.insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </section>
  );
}
