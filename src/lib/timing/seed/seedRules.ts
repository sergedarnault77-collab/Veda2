/* ── Timing Engine — Specific (Name-Based) Rules ── */

import type { InteractionRule } from "../types";

/**
 * Specific rules target individual canonical_names rather than tags.
 * Keep these minimal — prefer tag-based generic rules whenever possible.
 */
export const SPECIFIC_RULES: InteractionRule[] = [
  {
    ruleKey: "lisdexamfetamine-empty-stomach",
    appliesTo: ["lisdexamfetamine"],
    appliesIfTags: [],
    conflictsWithNames: [],
    conflictsWithTags: [],
    constraint: {
      type: "EMPTY_STOMACH_PREFERRED",
      bufferBeforeFoodMin: 60,
    },
    severity: "soft",
    confidence: 70,
    rationale:
      "Many people find lisdexamfetamine onset is more predictable when taken on an empty stomach, with food about 60 minutes later.",
    references: [],
    isActive: true,
    version: 1,
  },
  {
    ruleKey: "bisphosphonate-upright-warn",
    appliesTo: ["alendronate"],
    appliesIfTags: [],
    conflictsWithNames: [],
    conflictsWithTags: [],
    constraint: {
      type: "WARN",
      message:
        "Remain upright (sitting or standing) for at least 30 minutes after taking this medication to reduce esophageal irritation risk.",
    },
    severity: "soft",
    confidence: 85,
    rationale:
      "Bisphosphonates can cause esophageal irritation if the patient lies down after ingestion.",
    references: [
      "FDA Fosamax prescribing information",
    ],
    isActive: true,
    version: 1,
  },
  {
    ruleKey: "warfarin-consistency-warn",
    appliesTo: ["warfarin"],
    appliesIfTags: [],
    conflictsWithNames: [],
    conflictsWithTags: [],
    constraint: {
      type: "WARN",
      message:
        "Take warfarin at a consistent time each day. Sudden changes in diet (especially vitamin K-rich foods) may affect blood levels.",
    },
    severity: "soft",
    confidence: 80,
    rationale:
      "Warfarin has a narrow therapeutic window; consistency in timing and diet helps maintain stable INR.",
    references: [],
    isActive: true,
    version: 1,
  },
  {
    ruleKey: "lithium-consistency-warn",
    appliesTo: ["lithium"],
    appliesIfTags: [],
    conflictsWithNames: [],
    conflictsWithTags: [],
    constraint: {
      type: "WARN",
      message:
        "Take lithium at consistent times and stay well hydrated. Dehydration can affect blood lithium levels.",
    },
    severity: "soft",
    confidence: 80,
    rationale:
      "Lithium has a narrow therapeutic window; consistent timing and hydration are important for stable serum levels.",
    references: [],
    isActive: true,
    version: 1,
  },
  {
    ruleKey: "tacrolimus-consistency-warn",
    appliesTo: ["tacrolimus"],
    appliesIfTags: [],
    conflictsWithNames: [],
    conflictsWithTags: [],
    constraint: {
      type: "WARN",
      message:
        "Take at a consistent time each day, ideally either always with or always without food. Consistency helps maintain stable levels.",
    },
    severity: "soft",
    confidence: 80,
    rationale: "Tacrolimus absorption varies with food; consistency minimizes variability.",
    references: [],
    isActive: true,
    version: 1,
  },
  {
    ruleKey: "cyclosporine-consistency-warn",
    appliesTo: ["cyclosporine"],
    appliesIfTags: [],
    conflictsWithNames: [],
    conflictsWithTags: [],
    constraint: {
      type: "WARN",
      message:
        "Take at a consistent time each day. Grapefruit and grapefruit juice can affect cyclosporine blood levels.",
    },
    severity: "soft",
    confidence: 80,
    rationale:
      "Cyclosporine has a narrow therapeutic window and interacts with CYP3A4 substrates including grapefruit.",
    references: [],
    isActive: true,
    version: 1,
  },
  {
    ruleKey: "digoxin-consistency-warn",
    appliesTo: ["digoxin"],
    appliesIfTags: [],
    conflictsWithNames: [],
    conflictsWithTags: [],
    constraint: {
      type: "WARN",
      message:
        "Take digoxin at a consistent time each day. High-fiber meals taken at the same time may reduce absorption.",
    },
    severity: "soft",
    confidence: 75,
    rationale:
      "Digoxin has a narrow therapeutic window. High-fiber foods can bind digoxin and reduce bioavailability.",
    references: [],
    isActive: true,
    version: 1,
  },
  {
    ruleKey: "prednisone-morning-warn",
    appliesTo: ["prednisone"],
    appliesIfTags: [],
    conflictsWithNames: [],
    conflictsWithTags: [],
    constraint: {
      type: "WARN",
      message:
        "Taking prednisone in the morning may help reduce insomnia side effects by aligning with the body's natural cortisol rhythm.",
    },
    severity: "soft",
    confidence: 75,
    rationale:
      "Morning dosing mimics the natural cortisol diurnal rhythm and can reduce sleep disruption.",
    references: [],
    isActive: true,
    version: 1,
  },
];
