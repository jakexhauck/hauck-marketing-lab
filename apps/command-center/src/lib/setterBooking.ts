// Pure helpers for the Setter Suite booking slide-over
// (src/components/admin/setter/BookSlotPanel.tsx). No I/O, no React.
//
// This file exists because the panel itself has no test: the repo runs vitest
// in a node environment with no testing-library, so a component test is not
// possible here. The two things in that panel that can be silently wrong are
// both pure, so they live here with real tests instead of being buried in
// JSX where nothing would catch them:
//
//   1. Turning a clicked grid cell into the ISO instants GHL is booked with.
//      Get the timezone wrong and every appointment lands hours off, and it
//      looks correct in the UI because the UI reads back the same wrong value.
//   2. The slot header label, which is the only confirmation the setter gets
//      that they clicked the cell they meant to.

import { DEFAULT_DURATION } from "./calendarModel";
import type { ApiSetterContact } from "./api";

// A "book this contact" hand-off from the cockpit to the Calendar tab: the
// setter picks the appointment type (a calendar) in the cockpit and clicks
// Book, and the Calendar tab opens its booking panel pre-filled with this
// contact and calendar, ready for a slot to be picked.
export interface BookingIntent {
  contact: ApiSetterContact;
  calendarId: string;
}

// The grid reports a clicked cell as a local calendar date plus minutes from
// midnight. startMinutes of -1 is the toolbar Book button: no time was picked
// at all, so the panel shows a slot list instead (see BookSlotPanel).
export interface SetterSlot {
  iso: string;
  startMinutes: number;
}

export const NO_TIME_PICKED = -1;

export function hasPickedTime(slot: SetterSlot | null): boolean {
  return !!slot && slot.startMinutes >= 0;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIsoDate(iso: string): { y: number; m: number; d: number } | null {
  const match = ISO_DATE.exec(iso);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

export interface SlotInstants {
  startTime: string;
  endTime: string;
}

// A clicked cell as the two absolute instants GHL wants.
//
// The week grid draws every block in the VIEWER'S OWN timezone: busyToItem
// reads the wall-clock literal out of intervals the busy route already asked
// Google for in that zone, and appointmentToItem uses Date#getHours, which is
// local by definition. So "13:00" on the grid means 13:00 local, and the only
// correct reading of a click is a local Date. Constructing one with the
// Date(y, m, d, h, min) form and letting it serialise to UTC is what keeps
// that true across DST: on a spring-forward day the offset differs either
// side of the transition, and the runtime applies the right one. Building the
// string by hand with a single cached offset would not, which is exactly the
// silent hours-off bug this function exists to avoid.
//
// Returns null rather than a guess for input that is not a real slot: a bad
// date, or the -1 sentinel that means no time was picked. A booking is a real
// customer in a real calendar, so there is nothing safe to fall back to.
export function slotToInstants(
  slot: SetterSlot,
  durationMinutes: number = DEFAULT_DURATION,
): SlotInstants | null {
  const parts = parseIsoDate(slot.iso);
  if (!parts) return null;
  if (!Number.isFinite(slot.startMinutes) || slot.startMinutes < 0) return null;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;

  const hours = Math.floor(slot.startMinutes / 60);
  const minutes = slot.startMinutes % 60;
  const start = new Date(parts.y, parts.m - 1, parts.d, hours, minutes, 0, 0);
  if (Number.isNaN(start.getTime())) return null;

  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Minutes from midnight as a 24-hour clock label, wrapping past midnight so a
// late slot reads "23:45 to 00:45" rather than "23:45 to 24:45".
export function minutesToClock(minutes: number): string {
  const wrapped = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(wrapped / 60))}:${pad2(wrapped % 60)}`;
}

// "2026-07-24" -> "Fri 24 July". Parsed as UTC and formatted in UTC, the same
// trick setterCockpit.ts:formatSlotDay uses, so the calendar date the setter
// clicked never slides a day under their own offset.
export function formatSlotDate(iso: string): string {
  const parts = parseIsoDate(iso);
  if (!parts) return "";
  const dt = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
  if (Number.isNaN(dt.getTime())) return "";
  const weekday = dt.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  const month = dt.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  return `${weekday} ${parts.d} ${month}`;
}

// The panel's one-line confirmation of what is about to be booked, e.g.
// "Fri 24 July, 13:00 to 14:00". With no time picked it degrades to the date
// alone, because the toolbar Book button opens the panel on a day with no
// chosen slot yet and inventing one would be a lie.
export function formatSlotHeader(
  slot: SetterSlot,
  durationMinutes: number = DEFAULT_DURATION,
): string {
  const day = formatSlotDate(slot.iso);
  if (!day) return "";
  if (!hasPickedTime(slot)) return day;
  const end = slot.startMinutes + Math.max(0, Math.floor(durationMinutes));
  return `${day}, ${minutesToClock(slot.startMinutes)} to ${minutesToClock(end)}`;
}
