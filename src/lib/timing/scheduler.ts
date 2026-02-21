/* ── Timing Engine — Deterministic Scheduler Core ── */

import type {
  InteractionRule,
  ItemProfile,
  MealTimes,
  RuleConstraint,
  ScheduleInputItem,
  ScheduleOutput,
  ScheduledItem,
  ScheduleWarning,
} from "./types";
import { GENERIC_RULES } from "./genericRules";
import { SPECIFIC_RULES } from "./seed/seedRules";

// ────────────────────────────────────────────────────────────────────
// Time helpers
// ────────────────────────────────────────────────────────────────────

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function minToTime(m: number): string {
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function slotLabel(min: number): string {
  if (min < 720) return "Morning";
  if (min < 900) return "Afternoon";
  if (min < 1200) return "Evening";
  return "Night";
}

// ────────────────────────────────────────────────────────────────────
// Day slots (anchor points)
// ────────────────────────────────────────────────────────────────────

export interface DaySlots {
  wake: number;
  breakfast: number;
  midmorning: number;
  lunch: number;
  afternoon: number;
  dinner: number;
  bedtime: number;
}

export function getDefaultDaySlots(
  wakeTime = "07:00",
  meals?: MealTimes,
): DaySlots {
  const wake = timeToMin(wakeTime);
  const breakfast = meals?.breakfast ? timeToMin(meals.breakfast) : wake + 30;
  const lunch = meals?.lunch ? timeToMin(meals.lunch) : Math.max(breakfast + 240, timeToMin("12:00"));
  const dinner = meals?.dinner ? timeToMin(meals.dinner) : Math.max(lunch + 300, timeToMin("18:00"));
  return {
    wake,
    breakfast,
    midmorning: Math.round((breakfast + lunch) / 2),
    lunch,
    afternoon: Math.round((lunch + dinner) / 2),
    dinner,
    bedtime: dinner + 180,
  };
}

// ────────────────────────────────────────────────────────────────────
// Profile attachment
// ────────────────────────────────────────────────────────────────────

export interface EnrichedItem {
  input: ScheduleInputItem;
  profile: ItemProfile | null;
  tags: string[];
}

export function attachProfiles(
  items: ScheduleInputItem[],
  profiles: ItemProfile[],
): EnrichedItem[] {
  const profileMap = new Map(profiles.map((p) => [p.canonicalName, p]));
  return items.map((item) => {
    const profile = profileMap.get(item.canonicalName) ?? null;
    return { input: item, profile, tags: profile?.tags ?? [] };
  });
}

// ────────────────────────────────────────────────────────────────────
// Constraint collection
// ────────────────────────────────────────────────────────────────────

interface AppliedConstraint {
  rule: InteractionRule;
  constraint: RuleConstraint;
  targetCanonical: string;
  otherCanonical?: string;
}

function hasTag(item: EnrichedItem, tag: string): boolean {
  return item.tags.includes(tag);
}

function hasAnyTag(item: EnrichedItem, tags: string[]): boolean {
  return tags.some((t) => item.tags.includes(t));
}

export function buildConstraints(
  enriched: EnrichedItem[],
  additionalRules: InteractionRule[] = [],
): AppliedConstraint[] {
  const allRules = [
    ...GENERIC_RULES,
    ...SPECIFIC_RULES,
    ...additionalRules,
  ].filter((r) => r.isActive);

  const applied: AppliedConstraint[] = [];

  for (const rule of allRules) {
    for (const item of enriched) {
      const matchesByName =
        rule.appliesTo.length > 0 &&
        rule.appliesTo.includes(item.input.canonicalName);
      const matchesByTag =
        rule.appliesIfTags.length > 0 &&
        rule.appliesIfTags.every((t) => hasTag(item, t));

      if (!matchesByName && !matchesByTag) continue;

      if (
        rule.conflictsWithNames.length === 0 &&
        rule.conflictsWithTags.length === 0
      ) {
        applied.push({
          rule,
          constraint: rule.constraint,
          targetCanonical: item.input.canonicalName,
        });
        continue;
      }

      for (const other of enriched) {
        if (other === item) continue;
        const nameConflict =
          rule.conflictsWithNames.length > 0 &&
          rule.conflictsWithNames.includes(other.input.canonicalName);
        const tagConflict =
          rule.conflictsWithTags.length > 0 &&
          hasAnyTag(other, rule.conflictsWithTags);

        if (nameConflict || tagConflict) {
          applied.push({
            rule,
            constraint: rule.constraint,
            targetCanonical: item.input.canonicalName,
            otherCanonical: other.input.canonicalName,
          });
        }
      }
    }
  }

  return applied;
}

// ────────────────────────────────────────────────────────────────────
// Scheduler
// ────────────────────────────────────────────────────────────────────

interface PlacedItem {
  enriched: EnrichedItem;
  timeMin: number;
  withFood: boolean;
  notes: string[];
  constraintsSatisfied: string[];
  constraintsViolated: string[];
}

export function scheduleItems(
  enriched: EnrichedItem[],
  constraints: AppliedConstraint[],
  slots: DaySlots,
): { placed: PlacedItem[]; warnings: ScheduleWarning[] } {
  const placed: PlacedItem[] = [];
  const warnings: ScheduleWarning[] = [];

  const constraintsByTarget = new Map<string, AppliedConstraint[]>();
  for (const c of constraints) {
    const arr = constraintsByTarget.get(c.targetCanonical) ?? [];
    arr.push(c);
    constraintsByTarget.set(c.targetCanonical, arr);
  }

  const sortedItems = [...enriched].sort((a, b) => {
    const aFlex = a.profile?.timing?.flexible ? 1 : 0;
    const bFlex = b.profile?.timing?.flexible ? 1 : 0;
    if (aFlex !== bFlex) return aFlex - bFlex;

    const aEmpty = a.profile?.timing?.emptyStomachPreferred ? 0 : 1;
    const bEmpty = b.profile?.timing?.emptyStomachPreferred ? 0 : 1;
    return aEmpty - bEmpty;
  });

  function getInitialTime(item: EnrichedItem): number {
    const timing = item.profile?.timing;
    if (!timing) return slots.breakfast;

    if (timing.emptyStomachPreferred) return slots.wake;

    if (timing.preferredWindows?.length) {
      const w = timing.preferredWindows[0];
      return timeToMin(w.start);
    }

    if (timing.withFood) return slots.breakfast;

    return slots.breakfast;
  }

  function getPlacedTime(canonical: string): number | undefined {
    return placed.find((p) => p.enriched.input.canonicalName === canonical)
      ?.timeMin;
  }

  for (const item of sortedItems) {
    let timeMin = getInitialTime(item);
    const timing = item.profile?.timing;
    const withFood = timing?.withFood ?? false;
    const notes: string[] = [];
    const satisfied: string[] = [];
    const violated: string[] = [];

    const myConstraints = constraintsByTarget.get(item.input.canonicalName) ?? [];

    for (const ac of myConstraints) {
      const c = ac.constraint;

      if (c.type === "AVOID_AFTER_TIME") {
        const limit = timeToMin(c.time);
        if (timeMin > limit) {
          if (ac.rule.severity === "hard") {
            timeMin = Math.min(timeMin, limit);
            satisfied.push(ac.rule.ruleKey);
          } else {
            violated.push(ac.rule.ruleKey);
            warnings.push({
              ruleKey: ac.rule.ruleKey,
              severity: ac.rule.severity,
              confidence: ac.rule.confidence,
              message: `${item.input.displayName} is scheduled after ${c.time}. Many people prefer taking it earlier.`,
              affectedItems: [item.input.canonicalName],
            });
          }
        } else {
          satisfied.push(ac.rule.ruleKey);
        }
      }

      if (c.type === "EMPTY_STOMACH_PREFERRED") {
        if (timeMin >= slots.breakfast && timeMin < slots.breakfast + c.bufferBeforeFoodMin) {
          timeMin = slots.wake;
        }
        if (timeMin === slots.wake) {
          notes.push(
            `Take on an empty stomach, ${c.bufferBeforeFoodMin} min before food`,
          );
        }
        satisfied.push(ac.rule.ruleKey);
      }

      if (c.type === "WITH_FOOD_REQUIRED") {
        if (!withFood) {
          notes.push("Take with food");
        }
        satisfied.push(ac.rule.ruleKey);
      }

      if (c.type === "WARN") {
        notes.push(c.message);
        warnings.push({
          ruleKey: ac.rule.ruleKey,
          severity: ac.rule.severity,
          confidence: ac.rule.confidence,
          message: c.message,
          affectedItems: [
            item.input.canonicalName,
            ...(ac.otherCanonical ? [ac.otherCanonical] : []),
          ],
        });
        satisfied.push(ac.rule.ruleKey);
      }

      if (c.type === "MIN_SEPARATION_MINUTES" && ac.otherCanonical) {
        const otherTime = getPlacedTime(ac.otherCanonical);
        if (otherTime !== undefined) {
          const gap = Math.abs(timeMin - otherTime);
          if (gap < c.minutes) {
            const newTime = otherTime + c.minutes;
            if (newTime <= slots.bedtime) {
              timeMin = newTime;
              satisfied.push(ac.rule.ruleKey);
            } else {
              const altTime = otherTime - c.minutes;
              if (altTime >= slots.wake) {
                timeMin = altTime;
                satisfied.push(ac.rule.ruleKey);
              } else {
                violated.push(ac.rule.ruleKey);
                warnings.push({
                  ruleKey: ac.rule.ruleKey,
                  severity: ac.rule.severity,
                  confidence: ac.rule.confidence,
                  message: `Could not achieve ${c.minutes}-minute separation between ${item.input.displayName} and the conflicting item. Consider discussing timing with a pharmacist.`,
                  affectedItems: [item.input.canonicalName, ac.otherCanonical],
                });
              }
            }
          } else {
            satisfied.push(ac.rule.ruleKey);
          }
        }
      }
    }

    if (timing?.avoidAfterTime && !myConstraints.some((c) => c.constraint.type === "AVOID_AFTER_TIME")) {
      const limit = timeToMin(timing.avoidAfterTime);
      if (timeMin > limit) {
        timeMin = Math.min(timeMin, limit);
      }
    }

    timeMin = Math.max(slots.wake, Math.min(timeMin, slots.bedtime));

    placed.push({
      enriched: item,
      timeMin,
      withFood,
      notes,
      constraintsSatisfied: satisfied,
      constraintsViolated: violated,
    });
  }

  // ── Post-placement pass: enforce MIN_SEPARATION for pairs where the
  //    "other" item wasn't placed yet during the first pass ──
  const separationConstraints = constraints.filter(
    (c) => c.constraint.type === "MIN_SEPARATION_MINUTES" && c.otherCanonical,
  );
  for (const ac of separationConstraints) {
    const c = ac.constraint as Extract<RuleConstraint, { type: "MIN_SEPARATION_MINUTES" }>;
    const target = placed.find((p) => p.enriched.input.canonicalName === ac.targetCanonical);
    const other = placed.find((p) => p.enriched.input.canonicalName === ac.otherCanonical);
    if (!target || !other) continue;
    if (target.constraintsSatisfied.includes(ac.rule.ruleKey)) continue;
    if (target.constraintsViolated.includes(ac.rule.ruleKey)) continue;

    const gap = Math.abs(target.timeMin - other.timeMin);
    if (gap >= c.minutes) {
      target.constraintsSatisfied.push(ac.rule.ruleKey);
      continue;
    }

    const flexTarget = target.enriched.profile?.timing?.flexible;
    const flexOther = other.enriched.profile?.timing?.flexible;
    const mover = flexOther ? other : flexTarget ? target : other;

    const anchor = mover === target ? other : target;
    const newAfter = anchor.timeMin + c.minutes;
    const newBefore = anchor.timeMin - c.minutes;

    if (newAfter <= slots.bedtime) {
      mover.timeMin = newAfter;
      target.constraintsSatisfied.push(ac.rule.ruleKey);
    } else if (newBefore >= slots.wake) {
      mover.timeMin = newBefore;
      target.constraintsSatisfied.push(ac.rule.ruleKey);
    } else {
      target.constraintsViolated.push(ac.rule.ruleKey);
      warnings.push({
        ruleKey: ac.rule.ruleKey,
        severity: ac.rule.severity,
        confidence: ac.rule.confidence,
        message: `Could not achieve ${c.minutes}-minute separation between ${target.enriched.input.displayName} and ${other.enriched.input.displayName}. Consider discussing timing with a pharmacist.`,
        affectedItems: [ac.targetCanonical, ac.otherCanonical!],
      });
    }
  }

  return { placed, warnings };
}

// ────────────────────────────────────────────────────────────────────
// Confidence
// ────────────────────────────────────────────────────────────────────

export function computeConfidence(
  enriched: EnrichedItem[],
  constraints: AppliedConstraint[],
  placed: PlacedItem[],
): number {
  if (enriched.length === 0) return 100;

  const profiledCount = enriched.filter((e) => e.profile !== null).length;
  const profileCoverage = profiledCount / enriched.length;

  const ruleConfidences = constraints.map((c) => c.rule.confidence);
  const avgRuleConfidence =
    ruleConfidences.length > 0
      ? ruleConfidences.reduce((a, b) => a + b, 0) / ruleConfidences.length
      : 100;

  const violatedCount = placed.reduce(
    (n, p) => n + p.constraintsViolated.length,
    0,
  );
  const totalConstraints = constraints.length || 1;
  const satisfactionRate = 1 - violatedCount / totalConstraints;

  const raw =
    profileCoverage * 0.3 + (avgRuleConfidence / 100) * 0.4 + satisfactionRate * 0.3;

  return Math.round(raw * 100);
}

// ────────────────────────────────────────────────────────────────────
// Main entry point
// ────────────────────────────────────────────────────────────────────

export interface ScheduleParams {
  date: string;
  items: ScheduleInputItem[];
  profiles: ItemProfile[];
  additionalRules?: InteractionRule[];
  meals?: MealTimes;
  wakeTime?: string;
}

export function generateSchedule(params: ScheduleParams): ScheduleOutput {
  const {
    date,
    items,
    profiles,
    additionalRules = [],
    meals,
    wakeTime,
  } = params;

  const slots = getDefaultDaySlots(wakeTime, meals);
  const enriched = attachProfiles(items, profiles);
  const constraints = buildConstraints(enriched, additionalRules);
  const { placed, warnings } = scheduleItems(enriched, constraints, slots);
  const overallConfidence = computeConfidence(enriched, constraints, placed);

  const scheduledItems: ScheduledItem[] = placed
    .sort((a, b) => a.timeMin - b.timeMin)
    .map((p) => ({
      canonicalName: p.enriched.input.canonicalName,
      displayName: p.enriched.input.displayName,
      dose: p.enriched.input.dose,
      scheduledTime: minToTime(p.timeMin),
      slotLabel: slotLabel(p.timeMin),
      withFood: p.withFood,
      notes: p.notes,
      constraintsSatisfied: p.constraintsSatisfied,
      constraintsViolated: p.constraintsViolated,
    }));

  return {
    date,
    items: scheduledItems,
    warnings,
    overallConfidence,
    disclaimer:
      "This schedule is for informational purposes only and does not constitute medical advice. Always confirm medication timing with your doctor or pharmacist.",
  };
}
