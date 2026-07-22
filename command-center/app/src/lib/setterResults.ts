// Pure model for the Setter Suite Results tab: what happened after the
// estimate. Everything is a plain function of the Sales Pipeline's leads plus
// the client's booked calendar events, so it stays unit-testable without a
// server (same rule as setterModel.ts).
//
// Buckets:
//   upcoming - in Estimate Scheduled with a visit still ahead on the calendar
//   awaiting - in Estimate Scheduled with the visit passed (or never booked):
//              somebody quoted this prospect and nobody has recorded what
//              happened. The list the whole tab exists for; it is also the
//              future owner close-out queue once the client app grows the
//              write side.
//   won      - sitting in Job Booked / Job Completed
//
// Outcomes are read purely from stage position. Dollar values arrive later,
// when the owner close-out writes them; nothing here should need to change.

import { appointmentFor, type LeadAppointment } from "./setterApptConfirm";
import type { ApiSetterEvent, ApiSetterLead } from "./api";

const DAY_MS = 24 * 60 * 60 * 1000;
export const WON_RECENT_WINDOW_MS = 30 * DAY_MS;

// "Estimate Scheduled" on the live board. Excludes the retired "Estimate
// Completed" stage, which some CRM configs may still carry: a lead parked
// there already has its outcome recorded and is not waiting on anyone.
export function isEstimateStage(stageName: string): boolean {
  const s = stageName.trim().toLowerCase();
  return s.includes("estimate") && !s.includes("completed");
}

export function isWonStage(stageName: string): boolean {
  const s = stageName.trim().toLowerCase();
  return s.includes("job booked") || s.includes("job completed");
}

export interface ResultRow {
  lead: ApiSetterLead;
  // The estimate visit this row is about (null when none is on the calendar).
  appt: LeadAppointment | null;
}

export interface ResultsModel {
  upcoming: ResultRow[];
  awaiting: ResultRow[];
  won: ResultRow[];
  // Won leads whose last move falls inside WON_RECENT_WINDOW_MS.
  wonRecentCount: number;
  // won / (won + awaiting). Upcoming is excluded on purpose: those prospects
  // have not been quoted yet, so they can neither convert nor fail. Null
  // until at least one lead reaches a countable state.
  convRate: number | null;
}

// When a won lead last moved. GHL's opportunity search has no per-stage-entry
// time, so lastStatusChangeAt/updatedAt (serialized as updatedAt) is the
// proxy, falling back to createdAt rather than dropping the lead from the
// recency sort entirely.
function wonMovedMs(lead: ApiSetterLead): number {
  const t = new Date(lead.updatedAt ?? lead.createdAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}

// The instant an awaiting row has been waiting since: the passed visit when
// one exists, else when the lead was created. Exported for the row label.
export function waitingSinceMs(row: ResultRow): number {
  if (row.appt) return row.appt.startMs;
  const t = new Date(row.lead.createdAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function buildResults(
  leads: ApiSetterLead[],
  events: ApiSetterEvent[],
  now: number,
): ResultsModel {
  const upcoming: ResultRow[] = [];
  const awaiting: ResultRow[] = [];
  const won: ResultRow[] = [];

  for (const lead of leads) {
    if (isWonStage(lead.stageName)) {
      won.push({ lead, appt: null });
      continue;
    }
    if (!isEstimateStage(lead.stageName)) continue;
    const appt = appointmentFor(lead.contactId, events, now);
    const row: ResultRow = { lead, appt };
    if (appt && appt.startMs > now) upcoming.push(row);
    else awaiting.push(row);
  }

  upcoming.sort((a, b) => (a.appt?.startMs ?? 0) - (b.appt?.startMs ?? 0));
  awaiting.sort((a, b) => waitingSinceMs(a) - waitingSinceMs(b));
  won.sort((a, b) => wonMovedMs(b.lead) - wonMovedMs(a.lead));

  const wonRecentCount = won.filter((r) => now - wonMovedMs(r.lead) <= WON_RECENT_WINDOW_MS).length;
  const denominator = won.length + awaiting.length;

  return {
    upcoming,
    awaiting,
    won,
    wonRecentCount,
    convRate: denominator > 0 ? won.length / denominator : null,
  };
}
