import posthog from "posthog-js";

const apiKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const apiHost = (import.meta.env.VITE_POSTHOG_HOST as string) || "https://us.i.posthog.com";

let initialized = false;

export function initAnalytics() {
  if (!apiKey || initialized) return;
  initialized = true;

  posthog.init(apiKey, {
    api_host: apiHost,
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: "localStorage+cookie",
    loaded(ph) {
      if (import.meta.env.DEV) ph.debug();
    },
  });
}

export function identify(userId: string, traits?: Record<string, any>) {
  if (!initialized) return;
  posthog.identify(userId, traits);
}

export function track(event: string, properties?: Record<string, any>) {
  if (!initialized) return;
  posthog.capture(event, properties);
}

export function reset() {
  if (!initialized) return;
  posthog.reset();
}
