import { describe, it, expect } from "vitest";
import { generateSchedule, getDefaultDaySlots, attachProfiles, buildConstraints } from "../scheduler";
import { FIRST_30_ITEM_PROFILES } from "../seed/seedItems";
import type { ItemProfile, ScheduleInputItem } from "../types";

function findItem(output: ReturnType<typeof generateSchedule>, canonical: string) {
  return output.items.find((i) => i.canonicalName === canonical);
}

function profilesFor(...names: string[]): ItemProfile[] {
  return FIRST_30_ITEM_PROFILES.filter((p) => names.includes(p.canonicalName));
}

describe("getDefaultDaySlots", () => {
  it("generates sensible defaults", () => {
    const slots = getDefaultDaySlots("07:00");
    expect(slots.wake).toBe(7 * 60);
    expect(slots.breakfast).toBeGreaterThan(slots.wake);
    expect(slots.lunch).toBeGreaterThan(slots.breakfast);
    expect(slots.dinner).toBeGreaterThan(slots.lunch);
  });

  it("respects custom meal times", () => {
    const slots = getDefaultDaySlots("06:00", { breakfast: "08:00", lunch: "13:00", dinner: "19:00" });
    expect(slots.breakfast).toBe(8 * 60);
    expect(slots.lunch).toBe(13 * 60);
    expect(slots.dinner).toBe(19 * 60);
  });
});

describe("Levothyroxine scheduling", () => {
  it("places levothyroxine at wake with 60-min buffer before breakfast", () => {
    const items: ScheduleInputItem[] = [
      { canonicalName: "levothyroxine", displayName: "Levothyroxine" },
    ];

    const output = generateSchedule({
      date: "2026-02-14",
      items,
      profiles: profilesFor("levothyroxine"),
      wakeTime: "07:00",
    });

    const levo = findItem(output, "levothyroxine");
    expect(levo).toBeDefined();
    expect(levo!.scheduledTime).toBe("07:00");
    expect(levo!.notes.some((n) => n.includes("empty stomach"))).toBe(true);
  });
});

describe("Iron + Calcium separation", () => {
  it("separates iron and calcium by at least 120 minutes", () => {
    const ironProfile: ItemProfile = {
      canonicalName: "iron_supplement",
      displayName: "Iron",
      kind: "supplement",
      tags: ["IRON"],
      timing: { preferredWindows: [{ start: "07:00", end: "09:00" }] },
    };

    const calciumProfile: ItemProfile = {
      canonicalName: "calcium_supplement",
      displayName: "Calcium",
      kind: "supplement",
      tags: ["DIVALENT_CATION"],
      timing: { flexible: true },
    };

    const items: ScheduleInputItem[] = [
      { canonicalName: "iron_supplement", displayName: "Iron" },
      { canonicalName: "calcium_supplement", displayName: "Calcium" },
    ];

    const output = generateSchedule({
      date: "2026-02-14",
      items,
      profiles: [ironProfile, calciumProfile],
      wakeTime: "07:00",
    });

    const iron = findItem(output, "iron_supplement");
    const calcium = findItem(output, "calcium_supplement");
    expect(iron).toBeDefined();
    expect(calcium).toBeDefined();

    const ironMin = timeToMin(iron!.scheduledTime);
    const calciumMin = timeToMin(calcium!.scheduledTime);
    const gap = Math.abs(ironMin - calciumMin);
    expect(gap).toBeGreaterThanOrEqual(120);
  });
});

describe("Lisdexamfetamine scheduling", () => {
  it("places lisdexamfetamine at wake and pushes food items later", () => {
    const proteinProfile: ItemProfile = {
      canonicalName: "protein_shake",
      displayName: "Protein Shake",
      kind: "supplement",
      tags: [],
      timing: { withFood: true, flexible: true },
    };

    const items: ScheduleInputItem[] = [
      { canonicalName: "lisdexamfetamine", displayName: "Elvanse" },
      { canonicalName: "protein_shake", displayName: "Protein Shake" },
    ];

    const output = generateSchedule({
      date: "2026-02-14",
      items,
      profiles: [...profilesFor("lisdexamfetamine"), proteinProfile],
      wakeTime: "07:00",
    });

    const lsd = findItem(output, "lisdexamfetamine");
    const protein = findItem(output, "protein_shake");
    expect(lsd).toBeDefined();
    expect(protein).toBeDefined();

    const lsdMin = timeToMin(lsd!.scheduledTime);
    const proteinMin = timeToMin(protein!.scheduledTime);

    expect(lsdMin).toBe(7 * 60);
    expect(proteinMin).toBeGreaterThanOrEqual(lsdMin);
  });
});

describe("Omega-3 with food", () => {
  it("places omega-3 at a meal time", () => {
    const omega3Profile: ItemProfile = {
      canonicalName: "omega3",
      displayName: "Omega-3 Fish Oil",
      kind: "supplement",
      tags: [],
      timing: { withFood: true },
    };

    const items: ScheduleInputItem[] = [
      { canonicalName: "omega3", displayName: "Omega-3 Fish Oil" },
    ];

    const output = generateSchedule({
      date: "2026-02-14",
      items,
      profiles: [omega3Profile],
      wakeTime: "07:00",
      meals: { breakfast: "08:00", lunch: "12:30" },
    });

    const omega = findItem(output, "omega3");
    expect(omega).toBeDefined();
    expect(omega!.withFood).toBe(true);
  });
});

describe("Overall confidence", () => {
  it("has lower confidence when profiles are missing", () => {
    const items: ScheduleInputItem[] = [
      { canonicalName: "unknown_drug_xyz", displayName: "Mystery Pill" },
    ];

    const output = generateSchedule({
      date: "2026-02-14",
      items,
      profiles: [],
    });

    expect(output.overallConfidence).toBeLessThan(100);
  });

  it("has high confidence when all items have profiles", () => {
    const items: ScheduleInputItem[] = [
      { canonicalName: "levothyroxine", displayName: "Levothyroxine" },
    ];

    const output = generateSchedule({
      date: "2026-02-14",
      items,
      profiles: profilesFor("levothyroxine"),
    });

    expect(output.overallConfidence).toBeGreaterThanOrEqual(70);
  });
});

describe("Schedule output structure", () => {
  it("always includes a disclaimer", () => {
    const output = generateSchedule({
      date: "2026-02-14",
      items: [{ canonicalName: "levothyroxine", displayName: "Levothyroxine" }],
      profiles: profilesFor("levothyroxine"),
    });

    expect(output.disclaimer).toBeTruthy();
    expect(output.disclaimer.toLowerCase()).toContain("not");
    expect(output.disclaimer.toLowerCase()).toContain("medical advice");
  });

  it("returns the correct date", () => {
    const output = generateSchedule({
      date: "2026-03-01",
      items: [],
      profiles: [],
    });
    expect(output.date).toBe("2026-03-01");
  });
});

describe("Stimulant avoid-after-time", () => {
  it("warns when a stimulant cannot be placed before cutoff", () => {
    const items: ScheduleInputItem[] = [
      { canonicalName: "lisdexamfetamine", displayName: "Elvanse" },
    ];

    const output = generateSchedule({
      date: "2026-02-14",
      items,
      profiles: profilesFor("lisdexamfetamine"),
      wakeTime: "07:00",
    });

    const lsd = findItem(output, "lisdexamfetamine");
    expect(lsd).toBeDefined();
    const min = timeToMin(lsd!.scheduledTime);
    expect(min).toBeLessThanOrEqual(14 * 60);
  });
});

describe("Multiple medication interactions", () => {
  it("handles levothyroxine + iron + calcium in one schedule", () => {
    const ironProfile: ItemProfile = {
      canonicalName: "iron_supplement",
      displayName: "Iron",
      kind: "supplement",
      tags: ["IRON"],
      timing: {},
    };

    const calciumProfile: ItemProfile = {
      canonicalName: "calcium_supplement",
      displayName: "Calcium",
      kind: "supplement",
      tags: ["DIVALENT_CATION"],
      timing: { flexible: true },
    };

    const items: ScheduleInputItem[] = [
      { canonicalName: "levothyroxine", displayName: "Levothyroxine" },
      { canonicalName: "iron_supplement", displayName: "Iron" },
      { canonicalName: "calcium_supplement", displayName: "Calcium" },
    ];

    const output = generateSchedule({
      date: "2026-02-14",
      items,
      profiles: [...profilesFor("levothyroxine"), ironProfile, calciumProfile],
      wakeTime: "06:00",
    });

    expect(output.items.length).toBe(3);
    expect(output.overallConfidence).toBeGreaterThan(0);

    const levo = findItem(output, "levothyroxine");
    expect(levo!.scheduledTime).toBe("06:00");
  });
});

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}
