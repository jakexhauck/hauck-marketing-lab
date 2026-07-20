// Pure model + reducer helpers for the Setter Suite cockpit
// (src/components/admin/setter/SetterCockpit.tsx, DialLogger.tsx,
// SlotPicker.tsx). No I/O, no React: everything here is a plain function of
// the API's own shapes, so the outcome-to-spoke default, the optimistic dial
// reducer, and the slot/day formatting stay unit-testable without a server,
// a browser, or React Query.

import type { ApiSetterDial, ApiSetterLead } from "./api";

// Jake's five outcomes, exact wording and order, mapped to the API's own
// enum (functions/api/admin/setter/dials.ts OUTCOMES). Never reworded, never
// a sixth added: the DB has a check constraint on these exact values.
export const OUTCOMES = [
  { value: "booked", label: "Booked" },
  { value: "not_interested", label: "Not interested" },
  { value: "no_answer", label: "No answer" },
  { value: "reschedule", label: "Reschedule" },
  { value: "bad_lead", label: "Bad lead" },
] as const;

export type SetterOutcome = (typeof OUTCOMES)[number]["value"];

// The API rejects outcome "no_answer" paired with spoke: true (see
// functions/api/admin/setter/dials.ts:validateDialBody, code
// "contradictory"): nobody picked up, so nobody was spoken to. Every other
// outcome defaults to spoke: true, someone was reached. The setter can still
// flip the visible override before submitting.
export function defaultSpokeForOutcome(outcome: string): boolean {
  return outcome !== "no_answer";
}

// Mirrors the server's own contradiction check, so the client can block a
// bad submit before it ever reaches the network and can recognize the
// server's "contradictory" error code if one slips through anyway (a stale
// tab, a race with another setter).
export function isContradictoryDial(outcome: string, spoke: boolean): boolean {
  return outcome === "no_answer" && spoke === true;
}

// Every optimistic dial's id carries this prefix so it is unambiguous which
// rows in a cached dial list are provisional. A real setter_dials row is a
// Postgres uuid and can never collide with it.
export const OPTIMISTIC_DIAL_PREFIX = "optimistic-";

export function isOptimisticDial(id: string): boolean {
  return id.startsWith(OPTIMISTIC_DIAL_PREFIX);
}

export interface OptimisticDialInput {
  contactId: string;
  opportunityId?: string | null;
  pipelineName?: string | null;
  stageName?: string | null;
  spoke: boolean;
  outcome: string;
  note?: string | null;
  tagsApplied?: string[];
}

// Shapes a freshly logged dial exactly like the server's ApiSetterDial
// (functions/api/admin/setter/dials.ts:shapeDialRow), before the real row
// exists, so it renders in the timeline with no special-casing.
export function buildOptimisticDial(
  input: OptimisticDialInput,
  nowIso: string,
  tempId: string,
): ApiSetterDial {
  return {
    id: tempId,
    contactId: input.contactId,
    opportunityId: input.opportunityId ?? null,
    pipelineName: input.pipelineName ?? null,
    stageName: input.stageName ?? null,
    dialedAt: nowIso,
    spoke: input.spoke,
    outcome: input.outcome,
    note: input.note ?? null,
    tagsApplied: input.tagsApplied ?? [],
    createdBy: null,
    createdAt: nowIso,
  };
}

// The lead detail's dial-history reducer: newest first, matching the
// server's own `.order("dialed_at", { ascending: false })`, so a fresh dial
// lands exactly where the next real fetch would put it.
export function prependOptimisticDial(
  dials: ApiSetterDial[],
  dial: ApiSetterDial,
): ApiSetterDial[] {
  return [dial, ...dials];
}

// The board card's own reducer for one new dial. Mirrors
// functions/lib/setterMetrics.ts:rollUpByContact applied to a single append,
// so the optimistic bump agrees with what the server will compute on the
// next real fetch: attempts always increments; contacted only ever turns on
// (never off, a past spoke-with stays true); lastOutcome always becomes the
// new dial's outcome, since by construction it is the newest; firstDialedAt
// is set only the first time.
export function bumpLeadForDial(
  lead: ApiSetterLead,
  dial: { spoke: boolean; outcome: string; dialedAt: string },
): ApiSetterLead {
  return {
    ...lead,
    attempts: lead.attempts + 1,
    contacted: lead.contacted || dial.spoke,
    lastOutcome: dial.outcome,
    firstDialedAt: lead.firstDialedAt ?? dial.dialedAt,
  };
}

// Display the wall-clock time encoded in the slot's own offset (e.g. the
// "12:00" in "2026-07-08T12:00:00-04:00"), so the label matches the
// business's local calendar regardless of the viewer's timezone. Mirrors
// src/components/SlotPickerModal.tsx's slotLabel; kept separate rather than
// imported so this admin surface never touches that client-facing modal.
export function formatSlotTime(iso: string): string {
  const hm = iso.slice(11, 16);
  const [hRaw, m] = hm.split(":");
  let h = Number(hRaw);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ap}`;
}

// "YYYY-MM-DD" -> "Wed, Jul 8", parsed as UTC so the calendar date never
// shifts a day under the viewer's own timezone offset.
export function formatSlotDay(date: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// End time = start instant + duration, as an ISO string. GHL parses any
// valid ISO 8601 instant, so a UTC end paired with an offset start is
// accepted (mirrors SlotPickerModal's endFrom).
export function computeSlotEnd(startIso: string, minutes: number): string {
  return new Date(new Date(startIso).getTime() + minutes * 60_000).toISOString();
}
