export const VEDA_BUILD_ID =
  (import.meta as any)?.env?.VITE_VEDA_BUILD_ID ||
  (globalThis as any).__VEDA_BUILD_ID__ ||
  "dev";

export function isWebKit(): boolean {
  const ua = navigator.userAgent || "";
  return /AppleWebKit/i.test(ua) && !/Chrome|Chromium|Edg|OPR/i.test(ua);
}

export function shortId(): string {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}
