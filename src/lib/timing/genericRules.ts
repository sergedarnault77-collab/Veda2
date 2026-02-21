/* ── Timing Engine — Generic (Tag-Based) Rules ── */

import type { InteractionRule } from "./types";
import * as T from "./tags";

/**
 * Generic rules are keyed by tag combinations, not specific medications.
 * This is the scalable core: add a tag to a new med and all applicable rules
 * automatically apply without writing new rule code.
 */
export const GENERIC_RULES: InteractionRule[] = [
  {
    ruleKey: "iron-vs-divalent-cation",
    appliesTo: [],
    appliesIfTags: [T.IRON],
    conflictsWithNames: [],
    conflictsWithTags: [T.DIVALENT_CATION],
    constraint: {
      type: "MIN_SEPARATION_MINUTES",
      minutes: 120,
      other: { type: "tag", value: T.DIVALENT_CATION },
    },
    severity: "soft",
    confidence: 80,
    rationale:
      "Iron absorption is significantly reduced by divalent cations (calcium, magnesium, zinc). Separating by at least 2 hours may help reduce this effect.",
    references: [
      "Hallberg L. et al. Am J Clin Nutr. 1991;53(1):112-119",
    ],
    isActive: true,
    version: 1,
  },
  {
    ruleKey: "thyroid-empty-stomach",
    appliesTo: [],
    appliesIfTags: [T.THYROID_HORMONE],
    conflictsWithNames: [],
    conflictsWithTags: [],
    constraint: {
      type: "EMPTY_STOMACH_PREFERRED",
      bufferBeforeFoodMin: 60,
    },
    severity: "soft",
    confidence: 80,
    rationale:
      "Thyroid hormones are best absorbed on an empty stomach. Many people take them 30–60 minutes before breakfast.",
    references: [
      "ATA Guidelines for Hypothyroidism, Thyroid 2014;24(12)",
    ],
    isActive: true,
    version: 1,
  },
  {
    ruleKey: "thyroid-vs-iron-divalent",
    appliesTo: [],
    appliesIfTags: [T.THYROID_HORMONE],
    conflictsWithNames: [],
    conflictsWithTags: [T.IRON, T.DIVALENT_CATION],
    constraint: {
      type: "MIN_SEPARATION_MINUTES",
      minutes: 240,
      other: { type: "tag", value: T.IRON },
    },
    severity: "soft",
    confidence: 80,
    rationale:
      "Iron and divalent cations can bind thyroid hormones and reduce absorption. A 4-hour separation is commonly recommended.",
    references: [
      "Campbell NR et al. Ann Intern Med. 1992;117(12):1010-1013",
    ],
    isActive: true,
    version: 1,
  },
  {
    ruleKey: "tetracycline-vs-divalent-iron",
    appliesTo: [],
    appliesIfTags: [T.TETRACYCLINE],
    conflictsWithNames: [],
    conflictsWithTags: [T.DIVALENT_CATION, T.IRON],
    constraint: {
      type: "MIN_SEPARATION_MINUTES",
      minutes: 120,
      other: { type: "tag", value: T.DIVALENT_CATION },
    },
    severity: "soft",
    confidence: 80,
    rationale:
      "Tetracyclines chelate with divalent cations (Ca, Mg, Zn, Fe), reducing absorption. Separate by at least 2 hours.",
    references: [
      "Leyden JJ. J Am Acad Dermatol. 1985;12(2 Pt 1):308-312",
    ],
    isActive: true,
    version: 1,
  },
  {
    ruleKey: "fluoroquinolone-vs-divalent-iron",
    appliesTo: [],
    appliesIfTags: [T.FLUOROQUINOLONE],
    conflictsWithNames: [],
    conflictsWithTags: [T.DIVALENT_CATION, T.IRON],
    constraint: {
      type: "MIN_SEPARATION_MINUTES",
      minutes: 120,
      other: { type: "tag", value: T.DIVALENT_CATION },
    },
    severity: "soft",
    confidence: 80,
    rationale:
      "Fluoroquinolones chelate with divalent cations, substantially reducing bioavailability. Separate by at least 2 hours.",
    references: [
      "Shiu J et al. Pharmacotherapy. 2016;36(11):1185-1196",
    ],
    isActive: true,
    version: 1,
  },
  {
    ruleKey: "integrase-vs-divalent",
    appliesTo: [],
    appliesIfTags: [T.INTEGRASE_INHIBITOR],
    conflictsWithNames: [],
    conflictsWithTags: [T.DIVALENT_CATION],
    constraint: {
      type: "MIN_SEPARATION_MINUTES",
      minutes: 120,
      other: { type: "tag", value: T.DIVALENT_CATION },
    },
    severity: "soft",
    confidence: 75,
    rationale:
      "Integrase inhibitors can chelate with divalent cations, potentially reducing drug levels. Separating by 2+ hours is often advised.",
    references: [
      "Song I et al. Antimicrob Agents Chemother. 2006;50(5):1859-1860",
    ],
    isActive: true,
    version: 1,
  },
  {
    ruleKey: "sucralfate-binds-meds",
    appliesTo: [],
    appliesIfTags: [T.BINDING_AGENT],
    conflictsWithNames: [],
    conflictsWithTags: [],
    constraint: {
      type: "MIN_SEPARATION_MINUTES",
      minutes: 120,
      other: { type: "tag", value: "ANY_MED" },
    },
    severity: "soft",
    confidence: 75,
    rationale:
      "Sucralfate can bind to other medications and reduce their absorption. A 2-hour separation from other medications is commonly recommended.",
    references: [],
    isActive: true,
    version: 1,
  },
  {
    ruleKey: "ppi-before-meal",
    appliesTo: [],
    appliesIfTags: [T.ACID_REDUCER],
    conflictsWithNames: [],
    conflictsWithTags: [],
    constraint: {
      type: "EMPTY_STOMACH_PREFERRED",
      bufferBeforeFoodMin: 30,
    },
    severity: "soft",
    confidence: 70,
    rationale:
      "PPIs and H2 blockers are generally most effective when taken 30 minutes before a meal.",
    references: [],
    isActive: true,
    version: 1,
  },
  {
    ruleKey: "stimulant-avoid-late",
    appliesTo: [],
    appliesIfTags: [T.STIMULANT],
    conflictsWithNames: [],
    conflictsWithTags: [],
    constraint: {
      type: "AVOID_AFTER_TIME",
      time: "14:00",
    },
    severity: "soft",
    confidence: 75,
    rationale:
      "Stimulant medications taken later in the day may interfere with sleep. Many people prefer taking them before 2 PM.",
    references: [],
    isActive: true,
    version: 1,
  },
  {
    ruleKey: "caffeine-plus-stimulant-warn",
    appliesTo: [],
    appliesIfTags: [T.CAFFEINE],
    conflictsWithNames: [],
    conflictsWithTags: [T.STIMULANT],
    constraint: {
      type: "WARN",
      message:
        "Caffeine combined with stimulant medications may amplify effects such as increased heart rate or restlessness. Many people moderate caffeine intake when taking stimulants.",
    },
    severity: "soft",
    confidence: 70,
    rationale:
      "Both caffeine and stimulant medications increase sympathetic nervous system activity.",
    references: [],
    isActive: true,
    version: 1,
  },
];
