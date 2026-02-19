import { loadLS, saveLS } from "./persist";

const HISTORY_KEY = "veda.exposure.history.v1";
const SCANS_KEY = "veda.scans.today.v1";
const MAX_DAYS = 90;

export type DailyExposureSummary = {
  date: string; // YYYY-MM-DD
  caffeine: number;
  sweetenerCount: number;
  sweetenerNames: string[];
  calories: number;
  sugars: number;
  scanCount: number;
};

type StoredHistory = {
  days: DailyExposureSummary[];
};

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function loadHistory(): DailyExposureSummary[] {
  const stored = loadLS<StoredHistory | null>(HISTORY_KEY, null);
  return stored?.days ?? [];
}

export function saveHistory(days: DailyExposureSummary[]): void {
  const trimmed = days.slice(-MAX_DAYS);
  saveLS(HISTORY_KEY, { days: trimmed });
}

/**
 * Snapshot today's exposure into the history.
 * Called after each scan add to keep history up-to-date.
 */
export function snapshotToday(exposure: {
  caffeine: number;
  sweetenerTypes: string[];
  calories: number;
  sugars: number;
}): void {
  const today = todayStr();
  const scansRaw = loadLS<any>(SCANS_KEY, null);
  const scanCount = (scansRaw?.date === today && Array.isArray(scansRaw?.scans))
    ? scansRaw.scans.length
    : 0;

  const summary: DailyExposureSummary = {
    date: today,
    caffeine: exposure.caffeine,
    sweetenerCount: exposure.sweetenerTypes.length,
    sweetenerNames: exposure.sweetenerTypes,
    calories: exposure.calories,
    sugars: exposure.sugars,
    scanCount,
  };

  const days = loadHistory().filter((d) => d.date !== today);
  days.push(summary);
  days.sort((a, b) => a.date.localeCompare(b.date));
  saveHistory(days);
}

export function getLast7Days(): DailyExposureSummary[] {
  return getLastNDays(7);
}

export function getLast30Days(): DailyExposureSummary[] {
  return getLastNDays(30);
}

function getLastNDays(n: number): DailyExposureSummary[] {
  const history = loadHistory();
  const result: DailyExposureSummary[] = [];
  const now = new Date();

  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const existing = history.find((h) => h.date === dateStr);
    result.push(existing ?? {
      date: dateStr,
      caffeine: 0,
      sweetenerCount: 0,
      sweetenerNames: [],
      calories: 0,
      sugars: 0,
      scanCount: 0,
    });
  }

  return result;
}

export function formatDayLabel(dateStr: string, short = false): string {
  const d = new Date(dateStr + "T12:00:00");
  if (short) {
    return d.toLocaleDateString("en", { weekday: "short" }).slice(0, 2);
  }
  return d.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });
}
