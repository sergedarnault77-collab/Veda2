import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyAiRecommendations,
  countAllTrackableItems,
  countItemsNeedingTime,
  fetchAiScheduleRecommendations,
  loadTimelineEntries,
  markAutoFetchAiDone,
  shouldAutoFetchAi,
  updateItemSchedule,
  type TimelineEntry,
} from "../lib/daySchedule";
import { formatTime12h, scheduleSourceLabel, type ScheduleSource } from "../lib/schedule";
import "./DayTimeline.css";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function DayTimeline() {
  const [ver, setVer] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advice, setAdvice] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const bump = () => setVer((v) => v + 1);
    window.addEventListener("veda:supps-updated", bump);
    window.addEventListener("veda:meds-updated", bump);
    window.addEventListener("veda:schedule-updated", bump);
    window.addEventListener("veda:synced", bump);
    return () => {
      window.removeEventListener("veda:supps-updated", bump);
      window.removeEventListener("veda:meds-updated", bump);
      window.removeEventListener("veda:schedule-updated", bump);
      window.removeEventListener("veda:synced", bump);
    };
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const entries = useMemo(() => loadTimelineEntries(), [ver]);
  const totalItems = useMemo(() => countAllTrackableItems(), [ver]);
  const needsTime = useMemo(() => countItemsNeedingTime(), [ver]);

  const runAiSuggest = useCallback(async (onlyIfUnset: boolean) => {
    setLoading(true);
    setError(null);
    setAdvice("");
    try {
      const result = await fetchAiScheduleRecommendations();
      if (!result.ok) {
        setError(result.error || "Could not suggest times.");
        return;
      }
      applyAiRecommendations(result.items, { onlyIfUnset, respectDoctor: true });
      setAdvice(result.generalAdvice);
      setVer((v) => v + 1);
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!shouldAutoFetchAi()) return;
    let cancelled = false;
    (async () => {
      await runAiSuggest(true);
      if (!cancelled) markAutoFetchAiDone();
    })();
    return () => { cancelled = true; };
  }, [runAiSuggest]);

  const handleTimeChange = (entry: TimelineEntry, value: string) => {
    if (!value) return;
    updateItemSchedule(entry.id, entry.kind, {
      dailyTime: value,
      scheduleSource: entry.scheduleSource === "doctor" ? "doctor" : "manual",
    });
    setVer((v) => v + 1);
  };

  const handleSourceChange = (entry: TimelineEntry, source: ScheduleSource) => {
    updateItemSchedule(entry.id, entry.kind, { scheduleSource: source });
    setVer((v) => v + 1);
  };

  if (totalItems === 0) {
    return (
      <section className="day-timeline day-timeline--empty" aria-label="Daily schedule">
        <h2 className="day-timeline__title">Today&apos;s schedule</h2>
        <p className="day-timeline__empty">
          Add supplements or medications to see a 24-hour reminder timeline.
        </p>
      </section>
    );
  }

  return (
    <section className="day-timeline" aria-label="Daily schedule">
      <div className="day-timeline__header">
        <h2 className="day-timeline__title">Today&apos;s schedule</h2>
        <p className="day-timeline__sub">
          Best times to take your stack — AI suggested, editable for doctor instructions.
        </p>
      </div>

      <div className="day-timeline__track-wrap">
        <div className="day-timeline__hours" aria-hidden>
          {[6, 12, 18].map((h) => (
            <span key={h} className="day-timeline__hour-label" style={{ left: `${(h / 24) * 100}%` }}>
              {h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`}
            </span>
          ))}
        </div>
        <div className="day-timeline__track" role="list">
          {HOURS.map((h) => (
            <div key={h} className="day-timeline__tick" style={{ left: `${(h / 24) * 100}%` }} />
          ))}
          {entries.map((entry) => {
            const pct = (entry.minutes / 1440) * 100;
            return (
              <button
                key={`${entry.kind}-${entry.id}`}
                type="button"
                className={`day-timeline__marker day-timeline__marker--${entry.kind}${expandedId === entry.id ? " day-timeline__marker--active" : ""}`}
                style={{ left: `calc(${pct}% - 8px)` }}
                title={`${entry.name} — ${formatTime12h(entry.time)}`}
                onClick={() => setExpandedId((id) => (id === entry.id ? null : entry.id))}
                role="listitem"
              >
                <span className="day-timeline__marker-dot" />
              </button>
            );
          })}
        </div>
      </div>

      {needsTime > 0 && (
        <p className="day-timeline__hint">
          {needsTime} item{needsTime === 1 ? "" : "s"} still need a time — tap Suggest times.
        </p>
      )}

      <ul className="day-timeline__list">
        {entries.map((entry) => (
          <li
            key={`${entry.kind}-${entry.id}`}
            className={`day-timeline__row${expandedId === entry.id ? " day-timeline__row--open" : ""}`}
          >
            <div className="day-timeline__row-main">
              <span className={`day-timeline__kind day-timeline__kind--${entry.kind}`}>
                {entry.kind === "medication" ? "Med" : "Supp"}
              </span>
              <span className="day-timeline__name">{entry.name}</span>
              <label className="day-timeline__time-label">
                <span className="sr-only">Time for {entry.name}</span>
                <input
                  type="time"
                  className="day-timeline__time-input"
                  value={entry.time}
                  onChange={(e) => handleTimeChange(entry, e.target.value)}
                />
              </label>
            </div>
            <div className="day-timeline__row-meta">
              <select
                className="day-timeline__source-select"
                value={entry.scheduleSource || "ai"}
                onChange={(e) => handleSourceChange(entry, e.target.value as ScheduleSource)}
                aria-label={`Source for ${entry.name} timing`}
              >
                <option value="ai">AI suggested</option>
                <option value="manual">My preference</option>
                <option value="doctor">Doctor prescribed</option>
              </select>
              {entry.scheduleSource && (
                <span className={`day-timeline__badge day-timeline__badge--${entry.scheduleSource}`}>
                  {scheduleSourceLabel(entry.scheduleSource)}
                </span>
              )}
              {entry.scheduleNote && (
                <span className="day-timeline__note" title={entry.scheduleNote}>
                  {entry.scheduleNote}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {entries.length === 0 && needsTime > 0 && (
        <p className="day-timeline__empty-sched">
          No times set yet. Use AI suggestions or set times on each supplement or medication.
        </p>
      )}

      <div className="day-timeline__actions">
        <button
          type="button"
          className="day-timeline__btn day-timeline__btn--primary"
          disabled={loading}
          onClick={() => runAiSuggest(false)}
        >
          {loading ? "Suggesting…" : "Suggest times with AI"}
        </button>
        {needsTime > 0 && (
          <button
            type="button"
            className="day-timeline__btn"
            disabled={loading}
            onClick={() => runAiSuggest(true)}
          >
            Fill missing only
          </button>
        )}
      </div>

      {error && <p className="day-timeline__error">{error}</p>}
      {advice && <p className="day-timeline__advice">{advice}</p>}
      <p className="day-timeline__disclaimer">
        Timing suggestions are informational only — follow your prescriber&apos;s instructions when they differ.
      </p>
    </section>
  );
}
