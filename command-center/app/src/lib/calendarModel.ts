import type { ApiCalendarEvent } from "./api";
import { type Job, isoToLocalDate } from "./jobsPipeline";

// One event on the unified company calendar, whatever stream it came from. Every
// view (month/week/agenda) reads only this shape, so a new stream is just a new
// mapper plus a source entry, never a change to the views.
export type CalendarSource = "appointment" | "job" | "social" | "campaign";

export interface CalendarItem {
  id: string; // "<source>:<rawId>", unique across streams
  source: CalendarSource;
  title: string;
  subtitle: string;
  // Local calendar date "YYYY-MM-DD" (empty when the source has no date).
  date: string;
  // Minutes past local midnight, or null for an all-day item (posts, sends).
  startMinutes: number | null;
  endMinutes: number | null;
  // Display time, e.g. "9:30 AM"; empty for all-day.
  timeLabel: string;
  status: string;
  amount: number | null;
  location: string;
  meetingUrl: string;
  contactId: string;
}

// Per-source label + CSS var (defined in index.css) + tint var. Kept data-only so
// views and the legend share one source of truth, and colors stay theme-aware.
export const CALENDAR_SOURCE_META: Record<
  CalendarSource,
  { label: string; plural: string; varName: string; tintVar: string }
> = {
  appointment: {
    label: "Appointment",
    plural: "Appointments",
    varName: "--source-appointment",
    tintVar: "--source-appointment-tint",
  },
  job: {
    label: "Job",
    plural: "Jobs",
    varName: "--source-job",
    tintVar: "--source-job-tint",
  },
  social: {
    label: "Post",
    plural: "Social posts",
    varName: "--source-social",
    tintVar: "--source-social-tint",
  },
  campaign: {
    label: "Campaign",
    plural: "Campaigns",
    varName: "--source-campaign",
    tintVar: "--source-campaign-tint",
  },
};

export const CALENDAR_SOURCE_ORDER: CalendarSource[] = [
  "appointment",
  "job",
  "social",
  "campaign",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Local date + minutes-past-midnight for an ISO instant, honoring a timezone.
// Uses Intl parts so the wall-clock date/time matches the location, not the
// device. Returns empty/null when the input has no start.
function localParts(
  iso: string | null,
  tz: string | null,
): { date: string; minutes: number | null } {
  if (!iso) return { date: "", minutes: null };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", minutes: null };
  const fmt = new Intl.DateTimeFormat("en-CA", {
    ...(tz ? { timeZone: tz } : {}),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(d).map((p) => [p.type, p.value]),
  );
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: hour * 60 + Number(parts.minute),
  };
}

export function minutesToLabel(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad2(m)} ${ampm}`;
}

export function appointmentToItem(
  e: ApiCalendarEvent,
  tz: string | null,
): CalendarItem {
  const start = localParts(e.startTime, tz);
  const end = localParts(e.endTime, tz);
  return {
    id: `appointment:${e.id}`,
    source: "appointment",
    title: e.title,
    subtitle: e.contactName,
    date: start.date,
    startMinutes: start.minutes,
    endMinutes: end.minutes,
    timeLabel: start.minutes == null ? "" : minutesToLabel(start.minutes),
    status: e.status,
    amount: null,
    location: e.address,
    meetingUrl: e.meetingUrl,
    contactId: e.contactId,
  };
}

export function jobToItem(j: Job): CalendarItem {
  return {
    id: `job:${j.id}`,
    source: "job",
    title: j.customer,
    subtitle: j.service,
    date: j.date,
    startMinutes: j.startMinutes,
    endMinutes: null,
    timeLabel: j.time,
    status: j.status,
    amount: j.amount,
    location: `${j.city}, ${j.zip}`,
    meetingUrl: "",
    contactId: "",
  };
}

export function filterBySources(
  items: CalendarItem[],
  active: Set<CalendarSource>,
): CalendarItem[] {
  return items.filter((i) => active.has(i.source));
}

// Timed items ascending by start, then all-day items after.
function bySchedule(a: CalendarItem, b: CalendarItem): number {
  if (a.startMinutes == null && b.startMinutes == null) return 0;
  if (a.startMinutes == null) return 1;
  if (b.startMinutes == null) return -1;
  return a.startMinutes - b.startMinutes;
}

export function itemsOnDay(items: CalendarItem[], iso: string): CalendarItem[] {
  return items.filter((i) => i.date === iso).sort(bySchedule);
}

export function groupItemsByDay(
  items: CalendarItem[],
): { iso: string; items: CalendarItem[] }[] {
  const byDay = new Map<string, CalendarItem[]>();
  for (const i of items) {
    if (!i.date) continue;
    const arr = byDay.get(i.date) ?? [];
    arr.push(i);
    byDay.set(i.date, arr);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([iso, its]) => ({ iso, items: its.sort(bySchedule) }));
}

export function layoutWeek(
  items: CalendarItem[],
  weekIsos: string[],
): { iso: string; timed: CalendarItem[]; allDay: CalendarItem[] }[] {
  return weekIsos.map((iso) => {
    const day = itemsOnDay(items, iso);
    return {
      iso,
      timed: day.filter((i) => i.startMinutes != null),
      allDay: day.filter((i) => i.startMinutes == null),
    };
  });
}

// Re-export so consumers get the local-date helper without importing jobsPipeline.
export { isoToLocalDate };
