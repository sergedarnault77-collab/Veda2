import { useEffect, useMemo, useState } from "react";
import { loadLS } from "../lib/persist";
import { getLast7Days, getLast30Days, formatDayLabel } from "../lib/exposureHistory";
import type { DailyExposureSummary } from "../lib/exposureHistory";
import type { NutrientRow } from "../home/stubs";
import "./DashboardPage.css";

/* ── LocalStorage keys ── */
const SUPPS_KEY = "veda.supps.v1";
const MEDS_KEY = "veda.meds.v1";
const SCANS_KEY = "veda.scans.today.v1";

/* ── Types ── */

type SavedItem = {
  id: string;
  displayName: string;
  nutrients: NutrientRow[];
  ingredientsList?: string[];
  createdAtISO?: string;
};

type StoredScan = {
  productName: string;
  detectedSummary: string;
  ts: number;
};

type StoredScansDay = {
  date: string;
  scans: StoredScan[];
};

type TimeSlot = "morning" | "midday" | "evening";

type DayChip = {
  name: string;
  sourceCount: number;
  sourceLabel: string;
  slot: TimeSlot;
};

type OverlapSignal = {
  nutrientName: string;
  sourceCount: number;
  sourceNames: string[];
};

type TimingEntry = {
  text: string;
  slot: TimeSlot;
};

/* ── Helpers ── */

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function loadItems(key: string): SavedItem[] {
  const raw = loadLS<any[]>(key, []);
  return raw
    .filter((s) => s && typeof s.id === "string")
    .map((s) => ({
      id: s.id,
      displayName: s.displayName || "Unnamed",
      nutrients: Array.isArray(s.nutrients) ? s.nutrients : [],
      ingredientsList: Array.isArray(s.ingredientsList) ? s.ingredientsList : [],
      createdAtISO: s.createdAtISO ?? null,
    }));
}

function loadScansToday(): StoredScan[] {
  const stored = loadLS<StoredScansDay | null>(SCANS_KEY, null);
  if (stored && stored.date === todayStr()) return stored.scans;
  return [];
}

function hourToSlot(hour: number): TimeSlot {
  if (hour < 12) return "morning";
  if (hour < 17) return "midday";
  return "evening";
}

function slotLabel(slot: TimeSlot): string {
  if (slot === "morning") return "Morning";
  if (slot === "midday") return "Midday";
  return "Evening";
}

function slotIcon(slot: TimeSlot): string {
  if (slot === "morning") return "sunrise";
  if (slot === "midday") return "sun";
  return "moon";
}

/* ── Build Section Data ── */

function buildTypicalDay(
  supps: SavedItem[],
  meds: SavedItem[],
  scans: StoredScan[],
): DayChip[] {
  const nutrientSources = new Map<string, { name: string; sources: Set<string>; slots: Set<TimeSlot> }>();

  const addNutrients = (item: SavedItem, sourceType: string, slot: TimeSlot) => {
    for (const n of item.nutrients) {
      if (!n.nutrientId || !n.name) continue;
      const key = n.nutrientId.toLowerCase();
      const existing = nutrientSources.get(key);
      if (existing) {
        existing.sources.add(`${item.displayName} (${sourceType})`);
        existing.slots.add(slot);
      } else {
        nutrientSources.set(key, {
          name: n.name,
          sources: new Set([`${item.displayName} (${sourceType})`]),
          slots: new Set([slot]),
        });
      }
    }
  };

  for (const supp of supps) {
    addNutrients(supp, "supplement", "morning");
  }

  for (const med of meds) {
    const slot: TimeSlot = med.createdAtISO
      ? hourToSlot(new Date(med.createdAtISO).getHours())
      : "morning";
    addNutrients(med, "medication", slot);
  }

  for (const scan of scans) {
    const slot = hourToSlot(new Date(scan.ts).getHours());
    const key = scan.productName.toLowerCase().replace(/\s+/g, "_");
    const existing = nutrientSources.get(key);
    if (existing) {
      existing.sources.add(scan.productName);
      existing.slots.add(slot);
    } else {
      nutrientSources.set(key, {
        name: scan.productName,
        sources: new Set([scan.productName]),
        slots: new Set([slot]),
      });
    }
  }

  const chips: DayChip[] = [];
  for (const [, entry] of nutrientSources) {
    if (entry.sources.size === 0) continue;
    const primarySlot = entry.slots.values().next().value as TimeSlot;
    const srcCount = entry.sources.size;
    let sourceLabel: string;
    if (srcCount === 1) {
      sourceLabel = "1x";
    } else {
      const srcs = Array.from(entry.sources);
      const types = srcs.map((s) => {
        if (s.includes("supplement")) return "supplement";
        if (s.includes("medication")) return "medication";
        return "scan";
      });
      const uniqueTypes = [...new Set(types)];
      sourceLabel = uniqueTypes.length > 1
        ? `${srcCount} sources`
        : `${srcCount} ${uniqueTypes[0]}s`;
    }
    chips.push({
      name: entry.name,
      sourceCount: srcCount,
      sourceLabel,
      slot: primarySlot,
    });
  }

  chips.sort((a, b) => {
    const order: Record<TimeSlot, number> = { morning: 0, midday: 1, evening: 2 };
    return order[a.slot] - order[b.slot] || b.sourceCount - a.sourceCount;
  });

  return chips;
}

function buildOverlaps(
  supps: SavedItem[],
  meds: SavedItem[],
): OverlapSignal[] {
  const nutrientMap = new Map<string, { name: string; sources: Set<string> }>();

  const addNutrients = (item: SavedItem) => {
    for (const n of item.nutrients) {
      if (!n.nutrientId || !n.name) continue;
      const key = n.nutrientId.toLowerCase();
      const existing = nutrientMap.get(key);
      if (existing) {
        existing.sources.add(item.displayName);
      } else {
        nutrientMap.set(key, {
          name: n.name,
          sources: new Set([item.displayName]),
        });
      }
    }
  };

  for (const supp of supps) {
    addNutrients(supp);
  }
  for (const med of meds) {
    addNutrients(med);
  }

  const overlaps: OverlapSignal[] = [];
  for (const [, entry] of nutrientMap) {
    if (entry.sources.size >= 2) {
      overlaps.push({
        nutrientName: entry.name,
        sourceCount: entry.sources.size,
        sourceNames: Array.from(entry.sources),
      });
    }
  }

  overlaps.sort((a, b) => b.sourceCount - a.sourceCount);
  return overlaps;
}

function buildTimingPatterns(
  supps: SavedItem[],
  scans: StoredScan[],
): TimingEntry[] {
  const entries: TimingEntry[] = [];

  const slotItems: Record<TimeSlot, string[]> = { morning: [], midday: [], evening: [] };

  for (const supp of supps) {
    slotItems["morning"].push(supp.displayName);
  }

  for (const scan of scans) {
    const slot = hourToSlot(new Date(scan.ts).getHours());
    slotItems[slot].push(scan.productName);
  }

  for (const slot of ["morning", "midday", "evening"] as TimeSlot[]) {
    const items = slotItems[slot];
    if (items.length >= 2) {
      entries.push({
        text: `${items.length} items logged in the ${slot}`,
        slot,
      });
    } else if (items.length === 1) {
      entries.push({
        text: `${items[0]} is most often logged in the ${slot}`,
        slot,
      });
    }
  }

  const caffeineScans = scans.filter((s) =>
    /caffeine|coffee|espresso|americano|latte|cappuccino|tea|matcha|energy/i.test(s.productName),
  );
  if (caffeineScans.length > 0) {
    const hours = caffeineScans.map((s) => new Date(s.ts).getHours());
    const latest = Math.max(...hours);
    if (latest >= 14) {
      entries.push({
        text: `Caffeine sources today appear after ${latest}:00`,
        slot: latest >= 17 ? "evening" : "midday",
      });
    }
  }

  const morningItems = slotItems.morning;
  const eveningItems = slotItems.evening;
  if (morningItems.length > 0 && eveningItems.length > 0) {
    entries.push({
      text: `${morningItems[0]} and ${eveningItems[0]} are logged at different times`,
      slot: "morning",
    });
  }

  return entries;
}

/* ── Component ── */

type ExposureRange = "7d" | "30d";

function ExposureBarChart({ days, getValue, unit, color, range }: {
  days: DailyExposureSummary[];
  getValue: (d: DailyExposureSummary) => number;
  unit: string;
  color: string;
  range: ExposureRange;
}) {
  const values = days.map(getValue);
  const maxVal = Math.max(...values, 1);
  const total = values.reduce((a, b) => a + b, 0);
  const daysWithData = values.filter((v) => v > 0).length;
  const avg = daysWithData > 0 ? Math.round(total / daysWithData) : 0;

  return (
    <div className="expo-chart">
      <div className="expo-chart__summary">
        <span className="expo-chart__avg">
          {avg > 0 ? `${avg} ${unit}` : `No data`}
        </span>
        <span className="expo-chart__avg-label">
          {avg > 0 ? "daily avg" : ""}
        </span>
      </div>
      <div className="expo-chart__bars">
        {days.map((d, i) => {
          const val = values[i];
          const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
          return (
            <div className="expo-chart__col" key={d.date}>
              <div className="expo-chart__bar-wrap">
                <div
                  className="expo-chart__bar"
                  style={{
                    height: `${Math.max(pct, val > 0 ? 4 : 0)}%`,
                    background: val > 0 ? color : "rgba(255,255,255,0.04)",
                  }}
                />
              </div>
              <span className="expo-chart__label">
                {range === "7d"
                  ? formatDayLabel(d.date, true)
                  : (i % 5 === 0 || i === days.length - 1)
                    ? String(new Date(d.date + "T12:00:00").getDate())
                    : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SweetenerList({ days }: { days: DailyExposureSummary[] }) {
  const allNames = new Map<string, number>();
  for (const d of days) {
    for (const name of d.sweetenerNames) {
      const lower = name.toLowerCase();
      allNames.set(lower, (allNames.get(lower) ?? 0) + 1);
    }
  }
  const sorted = [...allNames.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return null;

  return (
    <div className="sweetener-list">
      <div className="sweetener-list__title">Types detected</div>
      <div className="sweetener-list__chips">
        {sorted.slice(0, 6).map(([name, count]) => (
          <span className="sweetener-list__chip" key={name}>
            {name} <span className="sweetener-list__chip-count">{count}d</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [syncVer, setSyncVer] = useState(0);
  const [caffeineRange, setCaffeineRange] = useState<ExposureRange>("7d");
  const [sweetenerRange, setSweetenerRange] = useState<ExposureRange>("7d");

  useEffect(() => {
    const onSync = () => setSyncVer((v) => v + 1);
    window.addEventListener("veda:synced", onSync);
    return () => window.removeEventListener("veda:synced", onSync);
  }, []);

  const data = useMemo(() => {
    const supps = loadItems(SUPPS_KEY);
    const meds = loadItems(MEDS_KEY);
    const scans = loadScansToday();

    return {
      chips: buildTypicalDay(supps, meds, scans),
      overlaps: buildOverlaps(supps, meds),
      timing: buildTimingPatterns(supps, scans),
      hasData: supps.length > 0 || meds.length > 0 || scans.length > 0,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncVer]);

  const caffeineDays = useMemo(
    () => (caffeineRange === "7d" ? getLast7Days() : getLast30Days()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [caffeineRange, syncVer],
  );

  const sweetenerDays = useMemo(
    () => (sweetenerRange === "7d" ? getLast7Days() : getLast30Days()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sweetenerRange, syncVer],
  );

  const hasCaffeineHistory = caffeineDays.some((d) => d.caffeine > 0);
  const hasSweetenerHistory = sweetenerDays.some((d) => d.sweetenerCount > 0);

  const morningChips = data.chips.filter((c) => c.slot === "morning");
  const middayChips = data.chips.filter((c) => c.slot === "midday");
  const eveningChips = data.chips.filter((c) => c.slot === "evening");

  if (!data.hasData) {
    return (
      <main className="dashboard">
        <header className="dashboard__header">
          <h1 className="dashboard__title">Dashboard</h1>
          <p className="dashboard__sub">Your patterns and signals at a glance</p>
        </header>
        <div className="dashboard__empty">
          <p>Start scanning items and marking supplements as taken to see your daily patterns here.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <header className="dashboard__header">
        <h1 className="dashboard__title">Dashboard</h1>
        <p className="dashboard__sub">Your patterns and signals at a glance</p>
      </header>

      {/* Section: Caffeine intake */}
      <section className="dashboard__section">
        <div className="dashboard__section-row">
          <h2 className="dashboard__section-title dashboard__section-title--nogap">Caffeine intake</h2>
          <div className="expo-range-toggle">
            {(["7d", "30d"] as ExposureRange[]).map((r) => (
              <button
                key={r}
                className={`expo-range-toggle__btn ${caffeineRange === r ? "expo-range-toggle__btn--active" : ""}`}
                onClick={() => setCaffeineRange(r)}
              >
                {r === "7d" ? "7 days" : "30 days"}
              </button>
            ))}
          </div>
        </div>

        {hasCaffeineHistory ? (
          <ExposureBarChart
            days={caffeineDays}
            getValue={(d) => d.caffeine}
            unit="mg"
            color="linear-gradient(180deg, #2E5BFF 0%, rgba(46,91,255,0.4) 100%)"
            range={caffeineRange}
          />
        ) : (
          <p className="dashboard__section-empty">
            Scan caffeine-containing items to see your intake trend
          </p>
        )}
      </section>

      {/* Section: Artificial sweetener intake */}
      <section className="dashboard__section">
        <div className="dashboard__section-row">
          <h2 className="dashboard__section-title dashboard__section-title--nogap">Artificial sweeteners</h2>
          <div className="expo-range-toggle">
            {(["7d", "30d"] as ExposureRange[]).map((r) => (
              <button
                key={r}
                className={`expo-range-toggle__btn ${sweetenerRange === r ? "expo-range-toggle__btn--active" : ""}`}
                onClick={() => setSweetenerRange(r)}
              >
                {r === "7d" ? "7 days" : "30 days"}
              </button>
            ))}
          </div>
        </div>

        {hasSweetenerHistory ? (
          <>
            <ExposureBarChart
              days={sweetenerDays}
              getValue={(d) => d.sweetenerCount}
              unit="types"
              color="linear-gradient(180deg, #f59e0b 0%, rgba(245,158,11,0.4) 100%)"
              range={sweetenerRange}
            />
            <SweetenerList days={sweetenerDays} />
          </>
        ) : (
          <p className="dashboard__section-empty">
            No artificial sweeteners detected in your scans yet
          </p>
        )}
      </section>

      {/* Section — Your typical day */}
      <section className="dashboard__section">
        <h2 className="dashboard__section-title">Your typical day</h2>

        {[
          { label: "Morning", icon: slotIcon("morning"), chips: morningChips },
          { label: "Midday", icon: slotIcon("midday"), chips: middayChips },
          { label: "Evening", icon: slotIcon("evening"), chips: eveningChips },
        ].map((group) => (
          <div className="day__slot" key={group.label}>
            <div className="day__slot-header">
              <span className={`day__slot-icon day__slot-icon--${group.icon}`} />
              <span className="day__slot-label">{group.label}</span>
            </div>
            {group.chips.length === 0 ? (
              <p className="day__slot-empty">Nothing logged yet</p>
            ) : (
              <div className="day__chips">
                {group.chips.map((chip, i) => (
                  <div className="day__chip" key={`${chip.name}-${i}`}>
                    <span className="day__chip-name">{chip.name}</span>
                    <span className="day__chip-src">{chip.sourceLabel}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      {/* Section 2 — Overlap signals */}
      <section className="dashboard__section">
        <h2 className="dashboard__section-title">Overlap signals</h2>

        {data.overlaps.length === 0 ? (
          <p className="dashboard__section-empty">No overlaps detected across your current items</p>
        ) : (
          <div className="overlap__list">
            {data.overlaps.slice(0, 8).map((o, i) => (
              <div className="overlap__card" key={`${o.nutrientName}-${i}`}>
                <div className="overlap__badge">{o.sourceCount}</div>
                <div className="overlap__body">
                  <div className="overlap__headline">
                    {o.sourceCount} products contribute to {o.nutrientName}
                  </div>
                  <div className="overlap__sources">
                    {o.sourceNames.join(" · ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Section 3 — Timing patterns (observed) */}
      <section className="dashboard__section">
        <h2 className="dashboard__section-title">Timing patterns (observed)</h2>

        {data.timing.length === 0 ? (
          <p className="dashboard__section-empty">Log a few items to see timing observations</p>
        ) : (
          <div className="timing__list">
            {data.timing.map((t, i) => (
              <div className="timing__entry" key={i}>
                <span className={`timing__dot timing__dot--${t.slot}`} />
                <span className="timing__text">{t.text}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
