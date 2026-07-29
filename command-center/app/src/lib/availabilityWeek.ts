// Pure week + slot maths behind Cold Call > Availability. No React, no router,
// no Date.now(): "today" is always injected, so the whole thing is deterministic
// and unit-testable.
//
// A slot is a 30-minute index from local midnight (0 = 00:00, 16 = 08:00,
// 47 = 23:30), which is exactly what 0057 stores. The rendered window is a
// separate decision made here, so widening the grid touches this file and
// nothing in the database.

// The window the grid draws. Cold calling happens inside a business day; drawing
// midnight to midnight would spend two thirds of the screen on hours nobody
// dials in.
export const GRID_START_SLOT = 16; // 08:00
export const GRID_END_SLOT = 40; // 20:00, exclusive

export const SLOT_MINUTES = 30;
export const SLOTS_PER_DAY = 48;

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// A date-only value, parsed at local noon. Noon rather than midnight so a
// daylight-saving shift can never roll the date backwards a day.
function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function toISO(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// The Monday of the week containing `iso`. Weeks start Monday: a cold-calling
// week is Monday to Friday with the weekend hanging off the end, not a Sunday
// sitting on its own at the front.
export function weekStart(iso: string): string {
  const date = parseISO(iso);
  // getDay(): 0 = Sunday. Shift so Monday is 0 and Sunday is 6.
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return toISO(date);
}

export function addWeeks(mondayISO: string, weeks: number): string {
  const date = parseISO(mondayISO);
  date.setDate(date.getDate() + weeks * 7);
  return toISO(date);
}

export interface WeekDay {
  iso: string;
  dowLabel: string; // "Mon"
  dayNum: number; // 1..31
  isWeekend: boolean;
  isToday: boolean;
  isPast: boolean;
}

// The seven days of a week, with weekend / today / past flags. `todayISO` is
// injected so tests pass a fixed day.
export function buildWeek(mondayISO: string, todayISO: string): WeekDay[] {
  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = parseISO(mondayISO);
    date.setDate(date.getDate() + i);
    const iso = toISO(date);
    days.push({
      iso,
      dowLabel: DOW_LABELS[i],
      dayNum: date.getDate(),
      isWeekend: i >= 5,
      isToday: iso === todayISO,
      // String compare is safe on "YYYY-MM-DD" and needs no parsing.
      isPast: iso < todayISO,
    });
  }
  return days;
}

// "Jul 27 - Aug 2, 2026", collapsing the month when both ends share one, and
// the year when the week does not cross New Year.
export function weekLabel(days: WeekDay[]): string {
  const first = parseISO(days[0].iso);
  const last = parseISO(days[6].iso);
  const from = `${MONTH_SHORT[first.getMonth()]} ${first.getDate()}`;
  const to =
    first.getMonth() === last.getMonth()
      ? `${last.getDate()}`
      : `${MONTH_SHORT[last.getMonth()]} ${last.getDate()}`;
  const year =
    first.getFullYear() === last.getFullYear()
      ? `${last.getFullYear()}`
      : `${first.getFullYear()}/${last.getFullYear()}`;
  return `${from} - ${to}, ${year}`;
}

// "8:00 AM" for a slot index. 12-hour because the rest of the console speaks it.
export function slotLabel(slot: number): string {
  const minutes = slot * SLOT_MINUTES;
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${pad2(minute)} ${suffix}`;
}

// The row labels down the left edge. Only the top of each hour is named: a
// label on every half hour doubles the ink for no added information.
export function gridSlots(): number[] {
  const slots: number[] = [];
  for (let s = GRID_START_SLOT; s < GRID_END_SLOT; s++) slots.push(s);
  return slots;
}

export function isHourStart(slot: number): boolean {
  return slot % 2 === 0;
}

// A week of availability: day ISO -> the slots marked on that day. Days with no
// entry have never been answered; a day mapped to [] was answered "none".
export type WeekAvailability = Record<string, number[]>;

export function slotsFor(map: WeekAvailability, day: string): number[] {
  return map[day] ?? [];
}

export function hasSlot(map: WeekAvailability, day: string, slot: number): boolean {
  return slotsFor(map, day).includes(slot);
}

// Set or clear one cell, returning a new map. Slots are kept sorted so two equal
// days always serialise identically, which keeps the "did this actually change?"
// check downstream a simple comparison rather than a set difference.
export function setSlot(
  map: WeekAvailability,
  day: string,
  slot: number,
  on: boolean,
): WeekAvailability {
  const current = slotsFor(map, day);
  const has = current.includes(slot);
  if (on === has) return map;
  const next = on
    ? [...current, slot].sort((a, b) => a - b)
    : current.filter((s) => s !== slot);
  return { ...map, [day]: next };
}

// Total marked hours for a day, for the count under each column header.
export function dayHours(map: WeekAvailability, day: string): number {
  return (slotsFor(map, day).length * SLOT_MINUTES) / 60;
}

export function weekHours(map: WeekAvailability, days: WeekDay[]): number {
  return days.reduce((sum, d) => sum + dayHours(map, d.iso), 0);
}

// "6" or "6.5": half hours are real, trailing ".0" is noise.
export function formatHours(hours: number): string {
  return Number.isInteger(hours) ? `${hours}` : hours.toFixed(1);
}

// Contiguous runs of marked slots on a day, as [startSlot, endSlotExclusive].
// Used for the plain-English summary ("8:00 AM - 11:30 AM") and for the screen
// reader, which should hear the blocks a person works rather than 24 cells.
export function blocksFor(map: WeekAvailability, day: string): [number, number][] {
  const slots = [...slotsFor(map, day)].sort((a, b) => a - b);
  const blocks: [number, number][] = [];
  for (const slot of slots) {
    const last = blocks[blocks.length - 1];
    if (last && last[1] === slot) last[1] = slot + 1;
    else blocks.push([slot, slot + 1]);
  }
  return blocks;
}

// "8:00 AM - 11:30 AM, 1:00 PM - 4:00 PM", or "" when nothing is marked.
export function describeDay(map: WeekAvailability, day: string): string {
  return blocksFor(map, day)
    .map(([from, to]) => `${slotLabel(from)} - ${slotLabel(to)}`)
    .join(", ");
}

// Whether a stored day and an edited day differ, so only touched days are sent.
export function sameSlots(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((slot, i) => slot === b[i]);
}

// ---------------------------------------------------------------------------
// Coverage: the same week read across the whole roster rather than one person.
// Used by Management > Team availability, where the question is "is anybody on
// the phones at 10am on Tuesday" rather than "when am I working".

export interface RosterWeek {
  id: string;
  name: string;
  days: WeekAvailability;
}

// Who is available in one cell, in roster order. The members themselves rather
// than their names: the agency grid colours a cell per person, so it needs the
// identity, and a name is not one (two hires can share a first name).
export function coverageIn(
  roster: RosterWeek[],
  day: string,
  slot: number,
): RosterWeek[] {
  return roster.filter((m) => hasSlot(m.days, day, slot));
}

// Who is available in one cell, in roster order. Names rather than a count,
// because the count is derivable from it and the names are not.
export function coveredBy(
  roster: RosterWeek[],
  day: string,
  slot: number,
): string[] {
  return coverageIn(roster, day, slot).map((m) => m.name);
}

// The roster flattened into one week: a slot is marked when ANYBODY has it.
//
// Deliberately a WeekAvailability, so every function above works on the agency's
// week unchanged: dayHours, weekHours and describeDay all then read "hours the
// phones are covered" rather than "hours one person is on". A merged week is the
// only honest thing to feed them, since three people on at 10am is still one
// covered half hour, not three.
export function unionWeek(roster: RosterWeek[]): WeekAvailability {
  const merged: WeekAvailability = {};
  for (const member of roster) {
    for (const [day, slots] of Object.entries(member.days)) {
      const seen = merged[day];
      if (!seen) {
        merged[day] = [...slots].sort((a, b) => a - b);
        continue;
      }
      // A day already merged: union, kept sorted so the block maths downstream
      // can keep assuming order.
      const set = new Set(seen);
      for (const slot of slots) set.add(slot);
      merged[day] = [...set].sort((a, b) => a - b);
    }
  }
  return merged;
}

// Person-hours across the drawn week: the capacity being offered, which is a
// different question from how much of the week is covered. Two people on the
// same morning is one covered morning and two person-hours.
export function rosterHours(roster: RosterWeek[], days: WeekDay[]): number {
  return roster.reduce((sum, m) => sum + weekHours(m.days, days), 0);
}

// The busiest cell in the drawn week, which sets the shading scale. Returns 0
// when nobody has marked anything, and callers must not divide by it.
export function peakCoverage(
  roster: RosterWeek[],
  days: WeekDay[],
  slots: number[],
): number {
  let peak = 0;
  for (const day of days) {
    for (const slot of slots) {
      const count = coveredBy(roster, day.iso, slot).length;
      if (count > peak) peak = count;
    }
  }
  return peak;
}

// Hours in the week where NOBODY is marked, inside the drawn window. The number
// worth acting on: it is the phone time the agency is not buying.
export function uncoveredHours(
  roster: RosterWeek[],
  days: WeekDay[],
  slots: number[],
): number {
  let empty = 0;
  for (const day of days) {
    for (const slot of slots) {
      if (coveredBy(roster, day.iso, slot).length === 0) empty++;
    }
  }
  return (empty * SLOT_MINUTES) / 60;
}

// Guard for anything arriving from the API or a URL: a clean, sorted, unique
// list of in-range slots. Anything else is dropped rather than trusted.
export function normalizeSlots(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  for (const raw of value) {
    // Coerce only from a number or a non-blank string. Number(null) is 0 and
    // Number([]) is 0, so a bare Number() here would quietly turn junk into
    // midnight, which is both in range and a whole number.
    let slot: number;
    if (typeof raw === "number") slot = raw;
    else if (typeof raw === "string" && raw.trim() !== "") slot = Number(raw);
    else continue;
    if (!Number.isInteger(slot) || slot < 0 || slot >= SLOTS_PER_DAY) continue;
    seen.add(slot);
  }
  return [...seen].sort((a, b) => a - b);
}
