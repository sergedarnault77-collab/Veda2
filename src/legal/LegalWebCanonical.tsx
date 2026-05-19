import { siteOriginFromEnv } from "../lib/site";
import "./Legal.css";

/** Public legal URL for store listings and support (vedais.ai). */
export function LegalWebCanonical({ path }: { path: "privacy" | "terms" }) {
  const base = siteOriginFromEnv();
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
