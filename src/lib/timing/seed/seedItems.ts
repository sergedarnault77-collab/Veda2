/* ── Timing Engine — First 30 Medication Profiles ── */

import type { ItemProfile } from "../types";
import * as T from "../tags";

export const FIRST_30_ITEM_PROFILES: ItemProfile[] = [
  // ── A) Absorption/chelation sensitive ──
  {
    canonicalName: "levothyroxine",
    displayName: "Levothyroxine (Synthroid)",
    kind: "med",
    tags: [T.THYROID_HORMONE],
    timing: {
      emptyStomachPreferred: true,
      bufferBeforeFoodMin: 60,
      preferredWindows: [{ start: "06:00", end: "09:00" }],
    },
  },
  {
    canonicalName: "alendronate",
    displayName: "Alendronate (Fosamax)",
    kind: "med",
    tags: [T.BISPHOSPHONATE],
    timing: {
      emptyStomachPreferred: true,
      bufferBeforeFoodMin: 60,
      preferredWindows: [{ start: "06:00", end: "09:00" }],
    },
  },
  {
    canonicalName: "doxycycline",
    displayName: "Doxycycline",
    kind: "med",
    tags: [T.TETRACYCLINE],
    timing: { withFood: true, flexible: true },
  },
  {
    canonicalName: "minocycline",
    displayName: "Minocycline",
    kind: "med",
    tags: [T.TETRACYCLINE],
    timing: { flexible: true },
  },
  {
    canonicalName: "ciprofloxacin",
    displayName: "Ciprofloxacin (Cipro)",
    kind: "med",
    tags: [T.FLUOROQUINOLONE],
    timing: { flexible: true },
  },
  {
    canonicalName: "levofloxacin",
    displayName: "Levofloxacin (Levaquin)",
    kind: "med",
    tags: [T.FLUOROQUINOLONE],
    timing: { flexible: true },
  },
  {
    canonicalName: "moxifloxacin",
    displayName: "Moxifloxacin (Avelox)",
    kind: "med",
    tags: [T.FLUOROQUINOLONE],
    timing: { flexible: true },
  },
  {
    canonicalName: "azithromycin",
    displayName: "Azithromycin (Zithromax)",
    kind: "med",
    tags: [],
    timing: { flexible: true },
  },
  {
    canonicalName: "bictegravir",
    displayName: "Bictegravir (Biktarvy)",
    kind: "med",
    tags: [T.INTEGRASE_INHIBITOR],
    timing: { withFood: true },
  },
  {
    canonicalName: "dolutegravir",
    displayName: "Dolutegravir (Tivicay)",
    kind: "med",
    tags: [T.INTEGRASE_INHIBITOR],
    timing: { flexible: true },
  },

  // ── B) Acid/pH-sensitive / before meals ──
  {
    canonicalName: "omeprazole",
    displayName: "Omeprazole (Prilosec)",
    kind: "med",
    tags: [T.ACID_REDUCER],
    timing: {
      emptyStomachPreferred: true,
      bufferBeforeFoodMin: 30,
      preferredWindows: [{ start: "06:00", end: "10:00" }],
    },
  },
  {
    canonicalName: "esomeprazole",
    displayName: "Esomeprazole (Nexium)",
    kind: "med",
    tags: [T.ACID_REDUCER],
    timing: {
      emptyStomachPreferred: true,
      bufferBeforeFoodMin: 30,
      preferredWindows: [{ start: "06:00", end: "10:00" }],
    },
  },
  {
    canonicalName: "pantoprazole",
    displayName: "Pantoprazole (Protonix)",
    kind: "med",
    tags: [T.ACID_REDUCER],
    timing: {
      emptyStomachPreferred: true,
      bufferBeforeFoodMin: 30,
      preferredWindows: [{ start: "06:00", end: "10:00" }],
    },
  },
  {
    canonicalName: "famotidine",
    displayName: "Famotidine (Pepcid)",
    kind: "med",
    tags: [T.ACID_REDUCER],
    timing: { flexible: true },
  },
  {
    canonicalName: "sucralfate",
    displayName: "Sucralfate (Carafate)",
    kind: "med",
    tags: [T.BINDING_AGENT],
    timing: {
      emptyStomachPreferred: true,
      bufferBeforeFoodMin: 60,
    },
  },

  // ── C) Food recommended ──
  {
    canonicalName: "metformin_ir",
    displayName: "Metformin IR",
    kind: "med",
    tags: [T.WITH_FOOD_RECOMMENDED],
    timing: { withFood: true },
  },
  {
    canonicalName: "metformin_xr",
    displayName: "Metformin XR",
    kind: "med",
    tags: [T.WITH_FOOD_RECOMMENDED],
    timing: {
      withFood: true,
      preferredWindows: [{ start: "18:00", end: "22:00" }],
    },
  },
  {
    canonicalName: "ibuprofen",
    displayName: "Ibuprofen (Advil)",
    kind: "med",
    tags: [T.WITH_FOOD_RECOMMENDED],
    timing: { withFood: true, flexible: true },
  },
  {
    canonicalName: "naproxen",
    displayName: "Naproxen (Aleve)",
    kind: "med",
    tags: [T.WITH_FOOD_RECOMMENDED],
    timing: { withFood: true, flexible: true },
  },
  {
    canonicalName: "prednisone",
    displayName: "Prednisone",
    kind: "med",
    tags: [],
    timing: {
      withFood: true,
      preferredWindows: [{ start: "06:00", end: "10:00" }],
    },
  },

  // ── D) Stimulants/wakefulness ──
  {
    canonicalName: "lisdexamfetamine",
    displayName: "Lisdexamfetamine (Elvanse/Vyvanse)",
    kind: "med",
    tags: [T.STIMULANT],
    timing: {
      preferredWindows: [{ start: "06:00", end: "10:00" }],
      avoidAfterTime: "14:00",
      emptyStomachPreferred: true,
      bufferBeforeFoodMin: 60,
      stimulant: true,
    },
  },
  {
    canonicalName: "methylphenidate_ir",
    displayName: "Methylphenidate IR (Ritalin)",
    kind: "med",
    tags: [T.STIMULANT],
    timing: {
      preferredWindows: [{ start: "06:00", end: "10:00" }],
      avoidAfterTime: "14:00",
      stimulant: true,
    },
  },
  {
    canonicalName: "methylphenidate_er",
    displayName: "Methylphenidate ER (Concerta)",
    kind: "med",
    tags: [T.STIMULANT],
    timing: {
      preferredWindows: [{ start: "06:00", end: "10:00" }],
      avoidAfterTime: "14:00",
      stimulant: true,
    },
  },
  {
    canonicalName: "modafinil",
    displayName: "Modafinil (Provigil)",
    kind: "med",
    tags: [T.STIMULANT],
    timing: {
      preferredWindows: [{ start: "06:00", end: "10:00" }],
      avoidAfterTime: "12:00",
      stimulant: true,
    },
  },
  {
    canonicalName: "bupropion",
    displayName: "Bupropion (Wellbutrin)",
    kind: "med",
    tags: [T.STIMULANT],
    timing: {
      avoidAfterTime: "16:00",
      stimulant: true,
    },
  },

  // ── E) Narrow therapeutic window ──
  {
    canonicalName: "warfarin",
    displayName: "Warfarin (Coumadin)",
    kind: "med",
    tags: [T.NARROW_TW],
    timing: { flexible: true },
  },
  {
    canonicalName: "lithium",
    displayName: "Lithium",
    kind: "med",
    tags: [T.NARROW_TW],
    timing: { withFood: true, flexible: true },
  },
  {
    canonicalName: "tacrolimus",
    displayName: "Tacrolimus (Prograf)",
    kind: "med",
    tags: [T.NARROW_TW],
    timing: { flexible: true },
  },
  {
    canonicalName: "cyclosporine",
    displayName: "Cyclosporine (Neoral)",
    kind: "med",
    tags: [T.NARROW_TW],
    timing: { flexible: true },
  },
  {
    canonicalName: "digoxin",
    displayName: "Digoxin (Lanoxin)",
    kind: "med",
    tags: [T.NARROW_TW],
    timing: { flexible: true },
  },
];
