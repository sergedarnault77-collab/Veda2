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
