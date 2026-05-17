import "./Legal.css";

/** Shown when VITE_PUBLIC_SITE_URL is set — use the same URL in App Store / Play Console. */
export function LegalWebCanonical({ path }: { path: "privacy" | "terms" }) {
  const raw = import.meta.env.VITE_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  const base = raw.replace(/\/$/, "");
  const href = `${base}/#${path}`;
  return (
    <p className="legal__canonical">
      Public link (for store listings and support):{" "}
      <a href={href} target="_blank" rel="noopener noreferrer">
        {href}
      </a>
    </p>
  );
}
