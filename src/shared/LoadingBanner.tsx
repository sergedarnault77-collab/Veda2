import "./LoadingBanner.css";

type Props = {
  title: string;
  subtitle?: string;
  tone?: "info" | "warn" | "success";
  compact?: boolean;
};

export default function LoadingBanner({
  title,
  subtitle,
  tone = "info",
  compact = false,
}: Props) {
  const showSpinner = tone === "info"; // spinner only during active loading
  return (
    <div className={`lb lb--${tone}${compact ? " lb--compact" : ""}`}>
      <div className="lb__row">
        {showSpinner && <span className="lb__spinner" />}
        <div className="lb__text">
          <div className="lb__title">{title}</div>
          {subtitle && <div className="lb__subtitle">{subtitle}</div>}
        </div>
      </div>
      {showSpinner && <div className="lb__bar"><div className="lb__bar-fill" /></div>}
    </div>
  );
}
