export type RuleConstraint =
  | { type: "MIN_SEPARATION_MINUTES"; minutes: number; other: { type: "tag" | "name"; value: string } }
  | { type: "WITH_FOOD_REQUIRED" }
  | { type: "EMPTY_STOMACH_PREFERRED"; bufferBeforeFoodMin: number }
  | { type: "AVOID_AFTER_TIME"; time: string }
  | { type: "WARN"; message: string };

export type InteractionRuleSeed = {
  rule_key: string;
  applies_to: string[];
  applies_if_tags: string[];
  conflicts_with_names: string[];
  conflicts_with_tags: string[];
  constraint: RuleConstraint;
  severity: "hard" | "soft";
  confidence: number;
  rationale: string;
  references: string[];
  version?: number;
  is_active?: boolean;
};

export const GENERIC_RULES: InteractionRuleSeed[] = [
  {
    rule_key: "iron_separate_from_divalent_cations",
    applies_to: [],
    applies_if_tags: ["IRON", "DIVALENT_CATION"],
    conflicts_with_names: [],
    conflicts_with_tags: [],
    constraint: { type: "MIN_SEPARATION_MINUTES", minutes: 120, other: { type: "tag", value: "DIVALENT_CATION" } },
    severity: "soft",
    confidence: 80,
    rationale: "Iron absorption can be reduced when taken near calcium/magnesium/zinc; spacing helps.",
    references: [],
  },
  {
    rule_key: "thyroid_empty_stomach_preferred",
    applies_to: [],
    applies_if_tags: ["THYROID_HORMONE"],
    conflicts_with_names: [],
    conflicts_with_tags: [],
    constraint: { type: "EMPTY_STOMACH_PREFERRED", bufferBeforeFoodMin: 60 },
    severity: "soft",
    confidence: 80,
    rationale: "Thyroid hormone is commonly taken on an empty stomach for more consistent absorption.",
    references: [],
  },
  {
    rule_key: "thyroid_separate_from_iron_and_cations",
    applies_to: [],
    applies_if_tags: ["THYROID_HORMONE", "DIVALENT_CATION"],
    conflicts_with_names: [],
    conflicts_with_tags: [],
    constraint: { type: "MIN_SEPARATION_MINUTES", minutes: 240, other: { type: "tag", value: "DIVALENT_CATION" } },
    severity: "soft",
    confidence: 80,
    rationale: "Calcium/magnesium/zinc can interfere with thyroid hormone absorption; spacing helps.",
    references: [],
  },
  {
    rule_key: "tetracyclines_separate_from_cations",
    applies_to: [],
    applies_if_tags: ["TETRACYCLINE", "DIVALENT_CATION"],
    conflicts_with_names: [],
    conflicts_with_tags: [],
    constraint: { type: "MIN_SEPARATION_MINUTES", minutes: 120, other: { type: "tag", value: "DIVALENT_CATION" } },
    severity: "soft",
    confidence: 80,
    rationale: "Tetracyclines can chelate with minerals, reducing absorption; spacing helps.",
    references: [],
  },
  {
    rule_key: "fluoroquinolones_separate_from_cations",
    applies_to: [],
    applies_if_tags: ["FLUOROQUINOLONE", "DIVALENT_CATION"],
    conflicts_with_names: [],
    conflicts_with_tags: [],
    constraint: { type: "MIN_SEPARATION_MINUTES", minutes: 120, other: { type: "tag", value: "DIVALENT_CATION" } },
    severity: "soft",
    confidence: 80,
    rationale: "Fluoroquinolones can chelate with minerals, reducing absorption; spacing helps.",
    references: [],
  },
  {
    rule_key: "integrase_separate_from_cations",
    applies_to: [],
    applies_if_tags: ["INTEGRASE_INHIBITOR", "DIVALENT_CATION"],
    conflicts_with_names: [],
    conflicts_with_tags: [],
    constraint: { type: "MIN_SEPARATION_MINUTES", minutes: 120, other: { type: "tag", value: "DIVALENT_CATION" } },
    severity: "soft",
    confidence: 75,
    rationale: "Some HIV integrase inhibitors are affected by minerals; spacing may help.",
    references: [],
  },
  {
    rule_key: "binding_agent_separate_from_meds",
    applies_to: ["sucralfate"],
    applies_if_tags: ["BINDING_AGENT"],
    conflicts_with_names: [],
    conflicts_with_tags: [],
    constraint: { type: "MIN_SEPARATION_MINUTES", minutes: 120, other: { type: "tag", value: "MED" } },
    severity: "soft",
    confidence: 75,
    rationale: "Sucralfate can bind other meds; spacing is commonly advised.",
    references: [],
  },
  {
    rule_key: "stimulants_avoid_late",
    applies_to: [],
    applies_if_tags: ["STIMULANT"],
    conflicts_with_names: [],
    conflicts_with_tags: [],
    constraint: { type: "AVOID_AFTER_TIME", time: "14:00" },
    severity: "soft",
    confidence: 75,
    rationale: "Stimulants taken later may disrupt sleep for some people.",
    references: [],
  },
  {
    rule_key: "caffeine_with_stimulant_warn",
    applies_to: [],
    applies_if_tags: ["CAFFEINE", "STIMULANT"],
    conflicts_with_names: [],
    conflicts_with_tags: [],
    constraint: { type: "WARN", message: "Caffeine + stimulants may increase jitteriness/anxiety for some people." },
    severity: "soft",
    confidence: 70,
    rationale: "Combining stimulants and caffeine can amplify effects in some users.",
    references: [],
  },
];

export const SPECIFIC_RULES: InteractionRuleSeed[] = [
  {
    rule_key: "lisdexamfetamine_empty_stomach_buffer",
    applies_to: ["lisdexamfetamine"],
    applies_if_tags: [],
    conflicts_with_names: [],
    conflicts_with_tags: ["HIGH_PROTEIN_MEAL"],
    constraint: { type: "EMPTY_STOMACH_PREFERRED", bufferBeforeFoodMin: 60 },
    severity: "soft",
    confidence: 70,
    rationale: "Many users prefer lisdexamfetamine alone for more predictable onset; food can delay onset.",
    references: [],
  },
  {
    rule_key: "bisphosphonate_upright_warn",
    applies_to: ["alendronate"],
    applies_if_tags: [],
    conflicts_with_names: [],
    conflicts_with_tags: [],
    constraint: { type: "WARN", message: "After alendronate, many guidelines advise staying upright for a period and taking with water." },
    severity: "soft",
    confidence: 85,
    rationale: "Common administration guidance for bisphosphonates focuses on esophageal irritation risk.",
    references: [],
  },
  {
    rule_key: "warfarin_consistency_warn",
    applies_to: ["warfarin"],
    applies_if_tags: [],
    conflicts_with_names: [],
    conflicts_with_tags: [],
    constraint: { type: "WARN", message: "Try to take warfarin at a consistent time each day and confirm any changes with your clinician." },
    severity: "soft",
    confidence: 80,
    rationale: "Consistency helps with stable anticoagulation management.",
    references: [],
  },
];
