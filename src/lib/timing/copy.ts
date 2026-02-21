/* ── Timing Engine — App Store-Safe Copy Helpers ── */

import type { ConfidenceBand, ScheduledItem, Severity } from "./types";
import { getConfidenceBand } from "./types";

export const GLOBAL_DISCLAIMER_SHORT =
  "For informational purposes only — not medical advice. Always confirm with your healthcare provider.";

export const HEADER_SUGGESTION =
  "Based on general timing guidelines, here is a suggested schedule for your items:";

export interface ConfidencePhrasing {
  label: string;
  sentenceStarter: string;
}

export function confidencePhrasing(confidence: number): ConfidencePhrasing {
  const band: ConfidenceBand = getConfidenceBand(confidence);
  switch (band) {
    case "high":
      return {
        label: "Well-supported",
        sentenceStarter: "This timing is generally well-supported.",
      };
    case "moderate":
      return {
        label: "Commonly recommended",
        sentenceStarter: "Many people follow this timing approach.",
      };
    case "low":
      return {
        label: "Informational",
        sentenceStarter:
          "Limited general guidance is available for this timing.",
      };
  }
}

export function itemExplanation(
  item: ScheduledItem,
  reasons: string[],
): string {
  const confidenceNote =
    item.constraintsViolated.length > 0
      ? " We were unable to satisfy all timing preferences — consider discussing this with your pharmacist."
      : "";

  const reasonText =
    reasons.length > 0
      ? ` ${reasons.join(" ")}`
      : "";

  const withFoodNote = item.withFood
    ? " This item is commonly taken with food."
    : "";

  return `${item.displayName} is scheduled at ${item.scheduledTime}.${reasonText}${withFoodNote}${confidenceNote}`;
}

/**
 * Severity-appropriate verb: "hard" rules use stronger language only when
 * confidence is >= 85. Everything else uses suggestive phrasing.
 */
export function severityVerb(
  severity: Severity,
  confidence: number,
): string {
  if (severity === "hard" && confidence >= 85) return "should";
  return "may benefit from";
}
