import "./InteractionWarnings.css";

export type Interaction = {
  severity: "info" | "caution" | "warning";
  headline: string;
  detail: string;
  items: string[];
};

interface Props {
  interactions: Interaction[];
  loading?: boolean;
}

const SEVERITY_ICON: Record<string, string> = {
  warning: "⚠️",
  caution: "⚡",
  info: "ℹ️",
};

export default function InteractionWarnings({ interactions, loading }: Props) {
  if (loading) {
    return (
      <div className="ix-warnings ix-warnings--loading">
        <div className="ix-warnings__spinner" />
        <span>Checking interactions…</span>
      </div>
    );
  }

  if (interactions.length === 0) return null;

  const sorted = [...interactions].sort((a, b) => {
    const order = { warning: 0, caution: 1, info: 2 };
    return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
  });

  return (
    <div className="ix-warnings">
      {sorted.map((ix, i) => (
        <div key={i} className={`ix-card ix-card--${ix.severity}`}>
          <div className="ix-card__header">
            <span className="ix-card__icon">{SEVERITY_ICON[ix.severity] || "ℹ️"}</span>
            <span className="ix-card__headline">{ix.headline}</span>
          </div>
          <div className="ix-card__detail">{ix.detail}</div>
          {ix.items.length > 0 && (
            <div className="ix-card__items">
              {ix.items.map((item, j) => (
                <span key={j} className="ix-card__chip">{item}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
