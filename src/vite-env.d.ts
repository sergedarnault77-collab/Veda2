/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
  readonly VITE_REVENUECAT_APPLE_KEY?: string;
  readonly VITE_REVENUECAT_GOOGLE_KEY?: string;
  readonly VITE_PUBLIC_SITE_URL?: string;
  readonly VITE_PUBLIC_SUPPORT_EMAIL?: string;
  readonly VITE_VEDA_BUILD_ID?: string;
  readonly VITE_BUILD_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
