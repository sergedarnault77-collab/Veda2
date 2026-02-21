/* ── Timing Engine — Core Types ── */

export type ItemKind = "med" | "supplement" | "food";

export interface TimingProfile {
  preferredWindows?: { start: string; end: string }[];
  withFood?: boolean;
  emptyStomachPreferred?: boolean;
  bufferBeforeFoodMin?: number;
  avoidAfterTime?: string;
  stimulant?: boolean;
  flexible?: boolean;
}

export type RuleConstraintType =
  | "MIN_SEPARATION_MINUTES"
  | "WITH_FOOD_REQUIRED"
  | "EMPTY_STOMACH_PREFERRED"
  | "AVOID_AFTER_TIME"
  | "WARN";

export type RuleConstraint =
  | {
      type: "MIN_SEPARATION_MINUTES";
      minutes: number;
      other: { type: "tag" | "name"; value: string };
    }
  | { type: "WITH_FOOD_REQUIRED" }
  | { type: "EMPTY_STOMACH_PREFERRED"; bufferBeforeFoodMin: number }
  | { type: "AVOID_AFTER_TIME"; time: string }
  | { type: "WARN"; message: string };

export type Severity = "hard" | "soft";

export interface InteractionRule {
  ruleKey: string;
  appliesTo: string[];
  appliesIfTags: string[];
  conflictsWithNames: string[];
  conflictsWithTags: string[];
  constraint: RuleConstraint;
  severity: Severity;
  confidence: number;
  rationale: string;
  references: string[];
  isActive: boolean;
  version: number;
}

export interface ItemProfile {
  canonicalName: string;
  displayName: string;
  kind: ItemKind;
  tags: string[];
  timing: TimingProfile;
}

export interface ScheduleInputItem {
  canonicalName: string;
  displayName: string;
  dose?: string;
  frequency?: string;
}

export interface MealTimes {
  breakfast?: string;
  lunch?: string;
  dinner?: string;
}

export interface ScheduledItem {
  canonicalName: string;
  displayName: string;
  dose?: string;
  scheduledTime: string;
  slotLabel: string;
  withFood: boolean;
  notes: string[];
  constraintsSatisfied: string[];
  constraintsViolated: string[];
}

export interface ScheduleWarning {
  ruleKey: string;
  severity: Severity;
  confidence: number;
  message: string;
  affectedItems: string[];
}

export interface ScheduleOutput {
  date: string;
  items: ScheduledItem[];
  warnings: ScheduleWarning[];
  overallConfidence: number;
  disclaimer: string;
}

export type ConfidenceBand = "high" | "moderate" | "low";

export function getConfidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 80) return "high";
  if (confidence >= 60) return "moderate";
  return "low";
}
