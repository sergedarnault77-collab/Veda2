export type TimingProfile = {
  preferredWindows?: Array<{ start: string; end: string }>;
  withFood?: boolean;
  emptyStomachPreferred?: boolean;
  bufferBeforeFoodMin?: number;
  avoidAfterTime?: string;
  stimulant?: boolean;
  flexible?: boolean;
};

export type ItemProfileSeed = {
  canonical_name: string;
  display_name: string;
  kind: "med" | "supplement" | "food";
  tags: string[];
  timing: TimingProfile;
};

export const FIRST_30_ITEM_PROFILES: ItemProfileSeed[] = [
  { canonical_name: "levothyroxine", display_name: "Levothyroxine", kind: "med", tags: ["THYROID_HORMONE"], timing: { emptyStomachPreferred: true, bufferBeforeFoodMin: 60, preferredWindows: [{ start: "06:00", end: "09:00" }] } },
  { canonical_name: "alendronate", display_name: "Alendronate", kind: "med", tags: ["BISPHOSPHONATE"], timing: { emptyStomachPreferred: true, bufferBeforeFoodMin: 60, preferredWindows: [{ start: "06:00", end: "09:00" }] } },
  { canonical_name: "doxycycline", display_name: "Doxycycline", kind: "med", tags: ["TETRACYCLINE"], timing: { flexible: true } },
  { canonical_name: "minocycline", display_name: "Minocycline", kind: "med", tags: ["TETRACYCLINE"], timing: { flexible: true } },
  { canonical_name: "ciprofloxacin", display_name: "Ciprofloxacin", kind: "med", tags: ["FLUOROQUINOLONE"], timing: { flexible: true } },
  { canonical_name: "levofloxacin", display_name: "Levofloxacin", kind: "med", tags: ["FLUOROQUINOLONE"], timing: { flexible: true } },
  { canonical_name: "moxifloxacin", display_name: "Moxifloxacin", kind: "med", tags: ["FLUOROQUINOLONE"], timing: { flexible: true } },
  { canonical_name: "azithromycin", display_name: "Azithromycin", kind: "med", tags: [], timing: { flexible: true } },
  { canonical_name: "bictegravir", display_name: "Bictegravir", kind: "med", tags: ["INTEGRASE_INHIBITOR"], timing: { flexible: true } },
  { canonical_name: "dolutegravir", display_name: "Dolutegravir", kind: "med", tags: ["INTEGRASE_INHIBITOR"], timing: { flexible: true } },

  { canonical_name: "omeprazole", display_name: "Omeprazole", kind: "med", tags: ["ACID_REDUCER"], timing: { emptyStomachPreferred: true, bufferBeforeFoodMin: 30, preferredWindows: [{ start: "06:00", end: "10:00" }] } },
  { canonical_name: "esomeprazole", display_name: "Esomeprazole", kind: "med", tags: ["ACID_REDUCER"], timing: { emptyStomachPreferred: true, bufferBeforeFoodMin: 30, preferredWindows: [{ start: "06:00", end: "10:00" }] } },
  { canonical_name: "pantoprazole", display_name: "Pantoprazole", kind: "med", tags: ["ACID_REDUCER"], timing: { emptyStomachPreferred: true, bufferBeforeFoodMin: 30, preferredWindows: [{ start: "06:00", end: "10:00" }] } },
  { canonical_name: "famotidine", display_name: "Famotidine", kind: "med", tags: ["ACID_REDUCER"], timing: { flexible: true } },
  { canonical_name: "sucralfate", display_name: "Sucralfate", kind: "med", tags: ["BINDING_AGENT"], timing: { emptyStomachPreferred: true, bufferBeforeFoodMin: 60 } },

  { canonical_name: "metformin_ir", display_name: "Metformin (IR)", kind: "med", tags: ["WITH_FOOD_RECOMMENDED"], timing: { withFood: true } },
  { canonical_name: "metformin_xr", display_name: "Metformin (XR)", kind: "med", tags: ["WITH_FOOD_RECOMMENDED"], timing: { withFood: true, preferredWindows: [{ start: "18:00", end: "22:00" }] } },
  { canonical_name: "ibuprofen", display_name: "Ibuprofen", kind: "med", tags: ["WITH_FOOD_RECOMMENDED"], timing: { withFood: true, flexible: true } },
  { canonical_name: "naproxen", display_name: "Naproxen", kind: "med", tags: ["WITH_FOOD_RECOMMENDED"], timing: { withFood: true, flexible: true } },
  { canonical_name: "prednisone", display_name: "Prednisone", kind: "med", tags: [], timing: { withFood: true, preferredWindows: [{ start: "06:00", end: "10:00" }], avoidAfterTime: "16:00" } },

  { canonical_name: "lisdexamfetamine", display_name: "Elvanse (lisdexamfetamine)", kind: "med", tags: ["STIMULANT"], timing: { stimulant: true, emptyStomachPreferred: true, bufferBeforeFoodMin: 60, preferredWindows: [{ start: "06:00", end: "10:00" }], avoidAfterTime: "14:00" } },
  { canonical_name: "methylphenidate_ir", display_name: "Methylphenidate (IR)", kind: "med", tags: ["STIMULANT"], timing: { stimulant: true, preferredWindows: [{ start: "06:00", end: "11:00" }], avoidAfterTime: "14:00" } },
  { canonical_name: "methylphenidate_er", display_name: "Methylphenidate (ER)", kind: "med", tags: ["STIMULANT"], timing: { stimulant: true, preferredWindows: [{ start: "06:00", end: "11:00" }], avoidAfterTime: "14:00" } },
  { canonical_name: "modafinil", display_name: "Modafinil", kind: "med", tags: ["STIMULANT"], timing: { stimulant: true, preferredWindows: [{ start: "06:00", end: "10:00" }], avoidAfterTime: "12:00" } },
  { canonical_name: "bupropion", display_name: "Bupropion", kind: "med", tags: ["STIMULANT"], timing: { stimulant: true, preferredWindows: [{ start: "06:00", end: "12:00" }], avoidAfterTime: "16:00" } },

  { canonical_name: "warfarin", display_name: "Warfarin", kind: "med", tags: ["NARROW_TW"], timing: { flexible: true } },
  { canonical_name: "lithium", display_name: "Lithium", kind: "med", tags: ["NARROW_TW"], timing: { flexible: true } },
  { canonical_name: "tacrolimus", display_name: "Tacrolimus", kind: "med", tags: ["NARROW_TW"], timing: { flexible: true } },
  { canonical_name: "cyclosporine", display_name: "Cyclosporine", kind: "med", tags: ["NARROW_TW"], timing: { flexible: true } },
  { canonical_name: "digoxin", display_name: "Digoxin", kind: "med", tags: ["NARROW_TW"], timing: { flexible: true } },
];
