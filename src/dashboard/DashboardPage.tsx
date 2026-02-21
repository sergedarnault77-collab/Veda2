import { useCallback, useEffect, useMemo, useState } from "react";
import { loadLS, saveLS } from "../lib/persist";
import { apiFetch } from "../lib/api";
import { getLast7Days, getLast30Days, formatDayLabel } from "../lib/exposureHistory";
import { SCHEDULE_ORDER, SCHEDULE_META } from "../lib/schedule";
import type { ScheduleTime } from "../lib/schedule";
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
  schedule?: ScheduleTime;
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

type ScheduleEntry = {
  id: string;
  name: string;
  type: "supplement" | "medication";
  schedule: ScheduleTime | null;
};

type OverlapSignal = {
  nutrientName: string;
  sourceCount: number;
  sourceNames: string[];
};

type ScheduleRec = {
  id: string;
  name: string;
  recommended: ScheduleTime;
  reason: string;
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
      schedule: s.schedule ?? null,
      createdAtISO: s.createdAtISO ?? null,
    }));
}

function loadScansToday(): StoredScan[] {
  const stored = loadLS<StoredScansDay | null>(SCANS_KEY, null);
  if (stored && stored.date === todayStr()) return stored.scans;
  return [];
}

function buildScheduleEntries(supps: SavedItem[], meds: SavedItem[]): ScheduleEntry[] {
  const entries: ScheduleEntry[] = [];
  for (const s of supps) {
    entries.push({ id: s.id, name: s.displayName, type: "supplement", schedule: s.schedule ?? null });
  }
  for (const m of meds) {
    entries.push({ id: m.id, name: m.displayName, type: "medication", schedule: m.schedule ?? null });
  }
  return entries;
}

function buildOverlaps(supps: SavedItem[], meds: SavedItem[]): OverlapSignal[] {
  const nutrientMap = new Map<string, { name: string; sources: Set<string> }>();

  const addNutrients = (item: SavedItem) => {
    for (const n of item.nutrients) {
      if (!n.nutrientId || !n.name) continue;
      const key = n.nutrientId.toLowerCase();
      const existing = nutrientMap.get(key);
      if (existing) {
        existing.sources.add(item.displayName);
      } else {
        nutrientMap.set(key, { name: n.name, sources: new Set([item.displayName]) });
      }
    }
  };

  for (const supp of supps) addNutrients(supp);
  for (const med of meds) addNutrients(med);

  const overlaps: OverlapSignal[] = [];
  for (const [, entry] of nutrientMap) {
    if (entry.sources.size >= 2) {
      overlaps.push({ nutrientName: entry.name, sourceCount: entry.sources.size, sourceNames: Array.from(entry.sources) });
    }
  }
  overlaps.sort((a, b) => b.sourceCount - a.sourceCount);
  return overlaps;
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

  // AI schedule assessment
  const [scheduleRecs, setScheduleRecs] = useState<ScheduleRec[] | null>(null);
  const [scheduleAdvice, setScheduleAdvice] = useState("");
  const [scheduleDisclaimer, setScheduleDisclaimer] = useState("");
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  useEffect(() => {
    const onSync = () => setSyncVer((v) => v + 1);
    const onSupps = () => setSyncVer((v) => v + 1);
    const onMeds = () => setSyncVer((v) => v + 1);
    window.addEventListener("veda:synced", onSync);
    window.addEventListener("veda:supps-updated", onSupps);
    window.addEventListener("veda:meds-updated", onMeds);
    return () => {
      window.removeEventListener("veda:synced", onSync);
      window.removeEventListener("veda:supps-updated", onSupps);
      window.removeEventListener("veda:meds-updated", onMeds);
    };
  }, []);

  const data = useMemo(() => {
    const supps = loadItems(SUPPS_KEY);
    const meds = loadItems(MEDS_KEY);
    const scans = loadScansToday();

    return {
      schedule: buildScheduleEntries(supps, meds),
      overlaps: buildOverlaps(supps, meds),
      hasData: supps.length > 0 || meds.length > 0 || scans.length > 0,
      suppsCount: supps.length,
      medsCount: meds.length,
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

  // Group schedule entries by time slot
  const grouped = useMemo(() => {
    const g: Record<ScheduleTime | "unscheduled", ScheduleEntry[]> = {
      morning: [], afternoon: [], evening: [], night: [], unscheduled: [],
    };
    for (const entry of data.schedule) {
      if (entry.schedule && g[entry.schedule]) {
        g[entry.schedule].push(entry);
      } else {
        g.unscheduled.push(entry);
      }
    }
    return g;
  }, [data.schedule]);

  const hasScheduledItems = data.schedule.some((e) => e.schedule);

  const askAiSchedule = useCallback(async () => {
    setScheduleLoading(true);
    setScheduleError(null);
    setScheduleRecs(null);

    const rawSupps = loadLS<any[]>(SUPPS_KEY, []);
    const rawMeds = loadLS<any[]>(MEDS_KEY, []);

    try {
      const res = await apiFetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplements: rawSupps, medications: rawMeds }),
      });
      const json = await res.json();
      if (!json?.ok) {
        setScheduleError(json?.error || "Could not generate suggestions.");
        return;
      }
      setScheduleRecs(json.items || []);
      setScheduleAdvice(json.generalAdvice || "");
      setScheduleDisclaimer(json.disclaimer || "");
    } catch {
      setScheduleError("Connection failed. Please try again.");
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  const applyScheduleRecs = useCallback(() => {
    if (!scheduleRecs || scheduleRecs.length === 0) return;
    const rawSupps = loadLS<any[]>(SUPPS_KEY, []);
    const rawMeds = loadLS<any[]>(MEDS_KEY, []);
    let suppsChanged = false;
    let medsChanged = false;

    for (const rec of scheduleRecs) {
      const si = rawSupps.findIndex((s: any) => s.id === rec.id);
      if (si >= 0) { rawSupps[si] = { ...rawSupps[si], schedule: rec.recommended }; suppsChanged = true; continue; }
      const mi = rawMeds.findIndex((m: any) => m.id === rec.id);
      if (mi >= 0) { rawMeds[mi] = { ...rawMeds[mi], schedule: rec.recommended }; medsChanged = true; }
    }

    if (suppsChanged) { saveLS(SUPPS_KEY, rawSupps); window.dispatchEvent(new Event("veda:supps-updated")); }
    if (medsChanged) { saveLS(MEDS_KEY, rawMeds); window.dispatchEvent(new Event("veda:meds-updated")); }
    setScheduleRecs(null);
    setScheduleAdvice("");
    setSyncVer((v) => v + 1);
  }, [scheduleRecs]);

  if (!data.hasData) {
    return (
      <main className="dashboard">
        <header className="dashboard__header">
          <h1 className="dashboard__title">Dashboard</h1>
          <p className="dashboard__sub">Your daily schedule and patterns at a glance</p>
        </header>
        <div className="dashboard__empty">
          <p>Start scanning items and marking supplements as taken to see your daily schedule here.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <header className="dashboard__header">
        <h1 className="dashboard__title">Dashboard</h1>
        <p className="dashboard__sub">Your daily schedule and patterns at a glance</p>
      </header>

      {/* Section: My Daily Schedule */}
      <section className="dashboard__section">
        <h2 className="dashboard__section-title">My Daily Schedule</h2>

        {data.schedule.length === 0 ? (
          <p className="dashboard__section-empty">
            Add supplements or medications to see your schedule
          </p>
        ) : (
          <>
            {SCHEDULE_ORDER.map((time) => {
              const items = grouped[time];
              if (items.length === 0) return null;
              const meta = SCHEDULE_META[time];
              return (
                <div className="sched__slot" key={time}>
                  <div className="sched__slot-header">
                    <span className="sched__slot-icon">{meta.icon}</span>
                    <span className="sched__slot-label">{meta.label}</span>
                    <span className="sched__slot-time">{meta.timeRange}</span>
                  </div>
                  <div className="sched__items">
                    {items.map((item) => (
                      <div className={`sched__item sched__item--${item.type}`} key={item.id}>
                        <span className="sched__item-name">{item.name}</span>
                        <span className="sched__item-type">{item.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {grouped.unscheduled.length > 0 && (
              <div className="sched__slot sched__slot--unsched">
                <div className="sched__slot-header">
                  <span className="sched__slot-icon">📋</span>
                  <span className="sched__slot-label">No time set</span>
                  <span className="sched__slot-time">Assign on Supps or Meds page</span>
                </div>
                <div className="sched__items">
                  {grouped.unscheduled.map((item) => (
                    <div className={`sched__item sched__item--${item.type} sched__item--faded`} key={item.id}>
                      <span className="sched__item-name">{item.name}</span>
                      <span className="sched__item-type">{item.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI schedule assessment */}
            {!scheduleRecs && (
              <button
                className="sched__ai-btn"
                onClick={askAiSchedule}
                disabled={scheduleLoading}
              >
                {scheduleLoading
                  ? "Analyzing your schedule…"
                  : "🤖 Are these the best time slots for me?"}
              </button>
            )}

            {scheduleError && (
              <div className="sched__ai-error">{scheduleError}</div>
            )}

            {scheduleRecs && scheduleRecs.length > 0 && (
              <div className="sched__ai-result">
                <div className="sched__ai-header">
                  <span className="sched__ai-badge">🤖</span>
                  <span className="sched__ai-title">AI Schedule Assessment</span>
                </div>

                {scheduleAdvice && (
                  <p className="sched__ai-advice">{scheduleAdvice}</p>
                )}

                <div className="sched__ai-recs">
                  {SCHEDULE_ORDER.map((time) => {
                    const items = scheduleRecs.filter((r) => r.recommended === time);
                    if (items.length === 0) return null;
                    const meta = SCHEDULE_META[time];
                    return (
                      <div key={time} className="sched__ai-group">
                        <div className="sched__ai-group-label">
                          {meta.icon} {meta.label} <span className="sched__ai-group-time">{meta.timeRange}</span>
                        </div>
                        {items.map((item) => {
                          const current = data.schedule.find((e) => e.id === item.id);
                          const changed = current?.schedule !== item.recommended;
                          return (
                            <div key={item.id} className={`sched__ai-rec ${changed ? "sched__ai-rec--changed" : ""}`}>
                              <div className="sched__ai-rec-top">
                                <span className="sched__ai-rec-name">{item.name}</span>
                                {changed && current?.schedule && (
                                  <span className="sched__ai-rec-move">
                                    was {SCHEDULE_META[current.schedule].label}
                                  </span>
                                )}
                                {changed && !current?.schedule && (
                                  <span className="sched__ai-rec-move">new</span>
                                )}
                              </div>
                              <div className="sched__ai-rec-reason">{item.reason}</div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                {scheduleDisclaimer && (
                  <p className="sched__ai-disclaimer">{scheduleDisclaimer}</p>
                )}

                <div className="sched__ai-actions">
                  <button className="sched__ai-apply" onClick={applyScheduleRecs}>
                    Apply suggestions
                  </button>
                  <button className="sched__ai-dismiss" onClick={() => { setScheduleRecs(null); setScheduleAdvice(""); }}>
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

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

      {/* Section: Overlap signals */}
      {data.overlaps.length > 0 && (
        <section className="dashboard__section">
          <h2 className="dashboard__section-title">Overlap signals</h2>
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
        </section>
      )}
    </main>
  );
}
