import { type Job, jobKind, isoToLocalDate, toIso } from "./jobsPipeline";

// One event on the Jobs calendar, whatever stream it came from. Every view
// (month/week/agenda) reads only this shape, so a new stream is just a new
// mapper plus a source entry, never a change to the views. This surface carries
// the sales work only: scheduled estimates and booked/completed jobs.
export type CalendarSource = "estimate" | "job" | "busy" | "appointment";

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
  estimate: {
    label: "Estimate",
    plural: "Estimates",
    varName: "--source-estimate",
    tintVar: "--source-estimate-tint",
  },
  job: {
    label: "Job",
    plural: "Jobs",
    varName: "--source-job",
    tintVar: "--source-job-tint",
  },
  appointment: {
    label: "Appointment",
    plural: "Appointments",
    varName: "--source-appointment",
    tintVar: "--source-appointment-tint",
  },
  busy: {
    label: "Busy",
    plural: "Busy",
    varName: "--source-busy",
    tintVar: "--source-busy-tint",
  },
};

// Busy sorts last: it is background context, not the client's own work.
// Appointment sits just ahead of it so booked blocks render above busy bands.
export const CALENDAR_SOURCE_ORDER: CalendarSource[] = [
  "estimate",
  "job",
  "appointment",
  "busy",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function minutesToLabel(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad2(m)} ${ampm}`;
}

export function jobToItem(j: Job): CalendarItem {
  // An estimate visit rides its own source so it colors distinctly from booked
  // and completed work; everything else is a "job".
  const source: CalendarSource = jobKind(j) === "estimate" ? "estimate" : "job";
  return {
    id: `job:${j.id}`,
    source,
    title: j.customer,
    subtitle: j.service,
    date: j.date,
    startMinutes: j.startMinutes,
    endMinutes: j.endMinutes ?? null,
    timeLabel: j.time,
    status: j.status,
    amount: j.amount,
    location: `${j.city}, ${j.zip}`,
    meetingUrl: "",
    contactId: "",
  };
}

// Wall-clock literal out of an ISO timestamp. The busy route asks Google for
// intervals in the viewer's own zone, so the literal in the string IS the
// intended local time; converting through Date would drift it. Mirrors
// partsFromIso on the API side.
function localPartsFromIso(iso: string): { date: string; minutes: number } | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  return { date: m[1], minutes: Number(m[2]) * 60 + Number(m[3]) };
}

// A block of time the client's own Google Calendar reports as taken. The
// admin setter route supplies the event's title; the anonymous freebusy
// fallback (and the client-facing route) do not, and those blocks render as
// plain "Busy".
export function busyToItem(
  b: { start: string; end: string; title?: string },
  index: number,
): CalendarItem {
  const s = localPartsFromIso(b.start);
  const e = localPartsFromIso(b.end);
  return {
    id: `busy:${index}`,
    source: "busy",
    title: b.title?.trim() || "Busy",
    subtitle: "",
    date: s?.date ?? "",
    startMinutes: s?.minutes ?? null,
    endMinutes: e?.minutes ?? null,
    timeLabel: s ? minutesToLabel(s.minutes) : "",
    status: "busy",
    amount: null,
    location: "",
    meetingUrl: "",
    contactId: "",
  };
}

// A booked GHL appointment. Written for the Setter Suite Calendar tab, where
// the person matters more than the calendar the booking landed on, so the
// contact name is the headline and the event title drops to the subtitle.
//
// Unlike busy, these timestamps are real instants with an offset, not wall
// clock literals, so they go through Date and are read in the viewer's own
// zone. toIso (from jobsPipeline) is the same local-date derivation the rest
// of this surface uses, so the day column and the minutes agree.
export interface ApiSetterEventLike {
  id: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  contactId: string;
  contactName: string;
}

export function appointmentToItem(e: ApiSetterEventLike): CalendarItem {
  const start = e.startTime ? new Date(e.startTime) : null;
  const end = e.endTime ? new Date(e.endTime) : null;
  const validStart = start !== null && !Number.isNaN(start.getTime());
  const validEnd = end !== null && !Number.isNaN(end.getTime());

  const startMinutes = validStart ? start.getHours() * 60 + start.getMinutes() : null;
  const endMinutes = validEnd ? end.getHours() * 60 + end.getMinutes() : null;

  const named = (e.contactName ?? "").trim();

  return {
    id: `appointment:${e.id}`,
    source: "appointment",
    title: named || e.title,
    subtitle: named ? e.title : "",
    date: validStart ? toIso(start) : "",
    startMinutes,
    endMinutes,
    timeLabel: startMinutes === null ? "" : minutesToLabel(startMinutes),
    status: e.status,
    amount: null,
    location: "",
    meetingUrl: "",
    contactId: e.contactId,
  };
}

// Busy blocks are a background layer, never a lane peer. Views split them out
// before packing so a client with a full personal calendar does not push their
// own jobs into slivers.
export function splitBusy(items: CalendarItem[]): {
  busy: CalendarItem[];
  rest: CalendarItem[];
} {
  return {
    busy: items.filter((i) => i.source === "busy"),
    rest: items.filter((i) => i.source !== "busy"),
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

// A timed item placed into a horizontal lane so overlapping items sit side by
// side instead of on top of each other. `col` is the lane index (0-based) and
// `cols` is how many lanes its overlap cluster needs.
export interface PlacedItem {
  item: CalendarItem;
  start: number;
  end: number;
  col: number;
  cols: number;
}

// Default slot length (minutes) for an item with no explicit end. Exported so
// the Setter Suite booking panel books the same length the grid draws for an
// open-ended item, rather than carrying a second literal that can drift.
export const DEFAULT_DURATION = 60;

// Pack a day's timed items into lanes: items whose [start,end) overlap share a
// cluster and each gets its own lane; the cluster's width is its max concurrency.
// Greedy interval partitioning, stable by start then end.
export function packDayColumns(timed: CalendarItem[]): PlacedItem[] {
  const spans = timed
    // Busy blocks render behind the day, so they never consume a lane.
    .filter((i) => i.startMinutes != null && i.source !== "busy")
    .map((item) => {
      const start = item.startMinutes as number;
      return { item, start, end: item.endMinutes ?? start + DEFAULT_DURATION };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const placed: PlacedItem[] = [];
  let cluster: PlacedItem[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const cols = cluster.reduce((m, p) => Math.max(m, p.col + 1), 0);
    for (const p of cluster) p.cols = cols;
    placed.push(...cluster);
    cluster = [];
  };

  for (const span of spans) {
    // A gap from every item so far starts a fresh cluster.
    if (span.start >= clusterEnd && cluster.length) flush();
    // First free lane whose last item has ended.
    const laneEnds: number[] = [];
    for (const p of cluster) laneEnds[p.col] = Math.max(laneEnds[p.col] ?? -Infinity, p.end);
    let col = laneEnds.findIndex((e) => e <= span.start);
    if (col === -1) col = cluster.length ? laneEnds.length : 0;
    cluster.push({ ...span, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, span.end);
  }
  if (cluster.length) flush();
  return placed;
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
