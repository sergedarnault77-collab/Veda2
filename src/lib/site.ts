/** Production web origin (no trailing slash). Override via VITE_PUBLIC_SITE_URL at build time. */
export const VEDAIS_SITE_ORIGIN = "https://vedais.ai";

export const VEDAIS_SUPPORT_EMAIL = "support@vedais.ai";
export const VEDAIS_LEGAL_EMAIL = "legal@vedais.ai";
export const VEDAIS_PRIVACY_EMAIL = "privacy@vedais.ai";

export function siteOriginFromEnv(): string {
  const raw = import.meta.env.VITE_PUBLIC_SITE_URL?.trim();
  return raw ? raw.replace(/\/$/, "") : VEDAIS_SITE_ORIGIN;
}

export function supportEmailFromEnv(): string {
  return import.meta.env.VITE_PUBLIC_SUPPORT_EMAIL?.trim() || VEDAIS_SUPPORT_EMAIL;
}
