import { loadLS, saveLS } from "./persist";
import { apiFetchSafe } from "./apiFetchSafe";
import {
  effectiveDailyTime,
  parseTimeToMinutes,
  type ScheduleSource,
  type ScheduleTime,
} from "./schedule";

const SUPPS_KEY = "veda.supps.v1";
const MEDS_KEY = "veda.meds.v1";
const AI_FETCH_KEY = "veda.daySchedule.aiFetch.v1";

export type TimelineItemKind = "supplement" | "medication";

export type TimelineEntry = {
  id: string;
  kind: TimelineItemKind;
  name: string;
  time: string;
  minutes: number;
  schedule?: ScheduleTime;
  scheduleSource?: ScheduleSource;
  scheduleNote?: string;
};

type StoredItem = {
  id: string;
  displayName?: string;
  schedule?: ScheduleTime;
  dailyTime?: string;
  scheduleSource?: ScheduleSource;
  scheduleNote?: string;
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function loadItems(key: string, kind: TimelineItemKind): TimelineEntry[] {
  const rows = loadLS<StoredItem[]>(key, []).filter((r) => r?.id);
  const out: TimelineEntry[] = [];
  for (const row of rows) {
    const time = effectiveDailyTime(row);
    if (!time) continue;
    const minutes = parseTimeToMinutes(time);
    if (minutes == null) continue;
    out.push({
      id: row.id,
      kind,
      name: row.displayName || (kind === "medication" ? "Medication" : "Supplement"),
      time,
      minutes,
      schedule: row.schedule,
      scheduleSource: row.scheduleSource,
      scheduleNote: row.scheduleNote,
    });
  }
  return out;
}

export function loadTimelineEntries(): TimelineEntry[] {
  const all = [
    ...loadItems(SUPPS_KEY, "supplement"),
    ...loadItems(MEDS_KEY, "medication"),
  ];
  return all.sort((a, b) => a.minutes - b.minutes || a.name.localeCompare(b.name));
}

export function countItemsNeedingTime(): number {
  const supps = loadLS<StoredItem[]>(SUPPS_KEY, []);
  const meds = loadLS<StoredItem[]>(MEDS_KEY, []);
  return [...supps, ...meds].filter((r) => r?.id && !effectiveDailyTime(r)).length;
}

export function countAllTrackableItems(): number {
  const supps = loadLS<StoredItem[]>(SUPPS_KEY, []);
  const meds = loadLS<StoredItem[]>(MEDS_KEY, []);
  return [...supps, ...meds].filter((r) => r?.id).length;
}

function patchItem(
  key: string,
  id: string,
  patch: Partial<StoredItem>,
): boolean {
  const rows = loadLS<StoredItem[]>(key, []);
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return false;
  rows[idx] = { ...rows[idx], ...patch };
  saveLS(key, rows);
  return true;
}

export function updateItemSchedule(
  id: string,
  kind: TimelineItemKind,
  updates: {
    dailyTime?: string;
    schedule?: ScheduleTime;
    scheduleSource?: ScheduleSource;
    scheduleNote?: string;
  },
): void {
  const key = kind === "medication" ? MEDS_KEY : SUPPS_KEY;
  if (!patchItem(key, id, updates)) return;
  if (kind === "medication") {
    window.dispatchEvent(new Event("veda:meds-updated"));
  } else {
    window.dispatchEvent(new Event("veda:supps-updated"));
  }
  window.dispatchEvent(new Event("veda:schedule-updated"));
}

export type AiScheduleRec = {
  id: string;
  recommended: ScheduleTime;
  recommendedTime: string;
  reason: string;
};

export async function fetchAiScheduleRecommendations(): Promise<{
  ok: boolean;
  items: AiScheduleRec[];
  generalAdvice: string;
  disclaimer: string;
  error?: string;
}> {
  const supplements = loadLS<any[]>(SUPPS_KEY, []);
  const medications = loadLS<any[]>(MEDS_KEY, []);
  if (supplements.length === 0 && medications.length === 0) {
    return {
      ok: true,
      items: [],
      generalAdvice: "Add supplements or medications to get timing suggestions.",
      disclaimer: "",
    };
  }

  const res = await apiFetchSafe<any>("/api/schedule", {
    method: "POST",
    json: { supplements, medications },
  });

  if (!res.ok) {
    return { ok: false, items: [], generalAdvice: "", disclaimer: "", error: res.error.message };
  }

  const data = res.data;
  if (!data?.ok) {
    return { ok: false, items: [], generalAdvice: "", disclaimer: "", error: data?.error || "Could not generate schedule" };
  }

  return {
    ok: true,
    items: (data.items || []) as AiScheduleRec[],
    generalAdvice: data.generalAdvice || "",
    disclaimer: data.disclaimer || "",
  };
}

export function applyAiRecommendations(
  items: AiScheduleRec[],
  options?: { onlyIfUnset?: boolean; respectDoctor?: boolean },
): number {
  const onlyIfUnset = options?.onlyIfUnset ?? true;
  const respectDoctor = options?.respectDoctor ?? true;
  let changed = 0;

  for (const rec of items) {
    let key: string | null = null;
    let rows: StoredItem[] = [];
    let idx = -1;

    const supps = loadLS<StoredItem[]>(SUPPS_KEY, []);
    const suppIdx = supps.findIndex((r) => r.id === rec.id);
    if (suppIdx >= 0) {
      key = SUPPS_KEY;
      rows = supps;
      idx = suppIdx;
    } else {
      const meds = loadLS<StoredItem[]>(MEDS_KEY, []);
      const medIdx = meds.findIndex((r) => r.id === rec.id);
      if (medIdx >= 0) {
        key = MEDS_KEY;
        rows = meds;
        idx = medIdx;
      }
    }

    if (key == null || idx < 0) continue;
    const row = rows[idx];
    if (respectDoctor && row.scheduleSource === "doctor") continue;
    if (onlyIfUnset && effectiveDailyTime(row)) continue;

    rows[idx] = {
      ...row,
      schedule: rec.recommended,
      dailyTime: rec.recommendedTime,
      scheduleSource: "ai",
      scheduleNote: rec.reason,
    };
    saveLS(key, rows);
    changed++;
  }

  if (changed > 0) {
    window.dispatchEvent(new Event("veda:supps-updated"));
    window.dispatchEvent(new Event("veda:meds-updated"));
    window.dispatchEvent(new Event("veda:schedule-updated"));
  }

  return changed;
}

export function shouldAutoFetchAi(): boolean {
  if (countItemsNeedingTime() === 0) return false;
  const raw = loadLS<{ date: string } | null>(AI_FETCH_KEY, null);
  return raw?.date !== todayStr();
}

export function markAutoFetchAiDone(): void {
  saveLS(AI_FETCH_KEY, { date: todayStr() });
}
