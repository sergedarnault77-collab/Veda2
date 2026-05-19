/**
 * Store URLs for subscription management and optional public app origin (legal URLs for listings).
 */

import { Capacitor } from "@capacitor/core";
import { siteOriginFromEnv, supportEmailFromEnv } from "./site";

const APPLE_MANAGE_SUBSCRIPTIONS = "https://apps.apple.com/account/subscriptions";
const GOOGLE_MANAGE_SUBSCRIPTIONS = "https://play.google.com/store/account/subscriptions";

/** URL to open platform subscription management; null on web. */
export function manageSubscriptionsUrl(): string | null {
  const p = Capacitor.getPlatform();
  if (p === "ios") return APPLE_MANAGE_SUBSCRIPTIONS;
  if (p === "android") return GOOGLE_MANAGE_SUBSCRIPTIONS;
  return null;
}

/** Opens HTTPS URLs in the system browser on native (Capacitor Browser); new tab on web. */
export async function openExternalUrl(url: string): Promise<void> {
  const u = url.trim();
  if (!u) return;

  if (Capacitor.isNativePlatform()) {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: u });
      return;
    } catch (err) {
      console.warn("[storeLinks] Browser.open failed:", err);
    }
  }

  window.open(u, "_blank", "noopener,noreferrer");
}

export function publicSiteOrigin(): string {
  return siteOriginFromEnv();
}

export function supportMailto(): string {
  return `mailto:${supportEmailFromEnv()}`;
}
