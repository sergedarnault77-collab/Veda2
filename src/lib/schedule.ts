export type ScheduleTime = "morning" | "afternoon" | "evening" | "night";

export type ScheduleSlot = {
  value: ScheduleTime;
  label: string;
  timeRange: string;
  icon: string;
};

export const SCHEDULE_SLOTS: ScheduleSlot[] = [
  { value: "morning",   label: "Morning",   timeRange: "6 AM – 9 AM",   icon: "🌅" },
  { value: "afternoon", label: "Afternoon", timeRange: "12 PM – 3 PM",  icon: "☀️" },
  { value: "evening",   label: "Evening",   timeRange: "5 PM – 8 PM",   icon: "🌆" },
  { value: "night",     label: "Night",     timeRange: "9 PM – 12 AM",  icon: "🌙" },
];

export const SCHEDULE_META: Record<ScheduleTime, { label: string; timeRange: string; icon: string }> = {
  morning:   { label: "Morning",   timeRange: "6 AM – 9 AM",   icon: "🌅" },
  afternoon: { label: "Afternoon", timeRange: "12 PM – 3 PM",  icon: "☀️" },
  evening:   { label: "Evening",   timeRange: "5 PM – 8 PM",   icon: "🌆" },
  night:     { label: "Night",     timeRange: "9 PM – 12 AM",  icon: "🌙" },
};

export const SCHEDULE_ORDER: ScheduleTime[] = ["morning", "afternoon", "evening", "night"];

/** Default clock time per coarse slot (24h HH:MM). */
export const SLOT_DEFAULT_TIME: Record<ScheduleTime, string> = {
  morning: "08:00",
  afternoon: "13:00",
  evening: "18:00",
  night: "21:30",
};

export type ScheduleSource = "ai" | "manual" | "doctor";

export function slotToDefaultTime(slot: ScheduleTime): string {
  return SLOT_DEFAULT_TIME[slot];
}

export function parseTimeToMinutes(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function minutesToTimeString(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function formatTime12h(time: string): string {
  const mins = parseTimeToMinutes(time);
  if (mins == null) return time;
  const h24 = Math.floor(mins / 60);
  const min = mins % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(min).padStart(2, "0")} ${ampm}`;
}

export function effectiveDailyTime(item: {
  dailyTime?: string;
  schedule?: ScheduleTime;
}): string | null {
  if (item.dailyTime && parseTimeToMinutes(item.dailyTime) != null) return item.dailyTime;
  if (item.schedule) return slotToDefaultTime(item.schedule);
  return null;
}

export function scheduleSourceLabel(source?: ScheduleSource): string {
  if (source === "doctor") return "Doctor";
  if (source === "manual") return "You";
  if (source === "ai") return "AI";
  return "";
}
