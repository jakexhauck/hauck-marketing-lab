// GHL calendar → HML sync orchestrator.
//
// One direction: GHL is the source of truth for bookings. When the user (or
// a booking page) creates / reschedules / cancels an appointment, we react:
//
//   * New booking  → advance sales opportunity to "Call Booked"
//                  → create Google Calendar event on `primary`
//                  → persist row in ops/appointments.json
//   * Reschedule   → update the Google Calendar event time
//                  → update the persisted row
//   * Cancellation → delete the Google Calendar event
//                  → advance opportunity to "Call Canceled"
//                  → mark row `status: "cancelled"` and clear gcalEventId
//
// All paths are idempotent: the diff is keyed by GHL appointment id and the
// cached row tells us what we've already done. Re-running the sync should be
// a no-op for unchanged appointments.

import { api } from "./tauri";
import type { GCalEvent } from "./googleCalendar";
import type { GhlAppointment, OpsAppointmentRow, OpsAppointmentsFile } from "./types";

const BOOKED_STAGE_NAME = "Call Booked";
const CANCELED_STAGE_NAME = "Call Canceled";

/** Convert HML-cached appointment rows to the same shape `CalendarPage` /
 *  `BookedToday` consume. Cancelled rows are filtered out (the Google
 *  Calendar event was already deleted on cancel). */
export function appointmentsToEvents(rows: OpsAppointmentRow[]): GCalEvent[] {
  const out: GCalEvent[] = [];
  for (const row of rows) {
    if (row.status === "cancelled") continue;
    const start = new Date(row.startIso);
    const end = new Date(row.endIso);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    out.push({
      id: row.gcalEventId ?? `ghl:${row.ghlAppointmentId}`,
      title: row.title?.trim() || `Call: ${row.contactName ?? "GHL Lead"}`,
      start,
      end,
      allDay: false,
    });
  }
  return out;
}

/** Merge HML appointments alongside Google Calendar events, deduped by
 *  event id so a primary-calendar read doesn't show the same booking twice. */
export function mergeEvents(
  gcalEvents: GCalEvent[],
  apptEvents: GCalEvent[],
): GCalEvent[] {
  const seen = new Set(gcalEvents.map((e) => e.id));
  const out = [...gcalEvents];
  for (const a of apptEvents) {
    if (seen.has(a.id)) continue;
    out.push(a);
    seen.add(a.id);
  }
  return out;
}

/** Convenience: load appointments from ops/appointments.json and return as
 *  GCalEvent[]. Returns empty on read failure. */
export async function loadAppointmentEvents(
  root: string | null,
): Promise<GCalEvent[]> {
  if (!root) return [];
  try {
    const file = await api.readOpsAppointments(root);
    return appointmentsToEvents(Object.values(file.appointments));
  } catch {
    return [];
  }
}

/** GHL appointmentStatus values that count as an active booking (not yet
 *  cancelled). "noshow" and "showed" still occupy the calendar slot. */
const ACTIVE_STATUSES = new Set(["confirmed", "showed", "noshow"]);

export interface SyncSummary {
  ok: boolean;
  processed: number;
  created: number;
  rescheduled: number;
  cancelled: number;
  skipped: number;
  errors: string[];
  /** Human-readable status line for surfacing in the UI. */
  message: string;
}

/** Window event name fired whenever runSync mutates ops/appointments.json.
 *  Listeners (dashboard Today panel, CalendarPage) use this to reload without
 *  waiting for their own poll interval. The detail carries the SyncSummary
 *  so banners can also reflect ok/error state. */
export const SYNC_EVENT = "hml:ghl-calendar-sync";

export type SyncEventDetail = SyncSummary;

const EMPTY_SUMMARY = (message: string, ok = true): SyncSummary => ({
  ok,
  processed: 0,
  created: 0,
  rescheduled: 0,
  cancelled: 0,
  skipped: 0,
  errors: [],
  message,
});

/** Window we pull from GHL each poll. Tight enough that the response stays
 *  cheap; wide enough to catch reschedules pushed out a few weeks. */
function pollWindow(): { startIso: string; endIso: string } {
  const now = Date.now();
  const start = new Date(now - 24 * 60 * 60 * 1000);
  const end = new Date(now + 30 * 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function isCancelled(appt: GhlAppointment): boolean {
  return appt.appointmentStatus === "cancelled" || appt.appointmentStatus === "invalid";
}

function timesChanged(appt: GhlAppointment, prior: OpsAppointmentRow | undefined): boolean {
  if (!prior) return false;
  return appt.startIso !== prior.startIso || appt.endIso !== prior.endIso;
}

async function resolveContactName(appt: GhlAppointment): Promise<{
  name: string;
  email: string | null;
}> {
  if (appt.contactName && appt.contactName.trim()) {
    return { name: appt.contactName.trim(), email: appt.contactEmail ?? null };
  }
  if (!appt.contactId) {
    return { name: appt.title?.trim() || "GHL Lead", email: null };
  }
  try {
    const c = await api.ghlGetContact(appt.contactId);
    const composed =
      c.name?.trim() ||
      [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
      c.email ||
      c.phone ||
      "GHL Lead";
    return { name: composed, email: c.email ?? null };
  } catch {
    return { name: appt.title?.trim() || "GHL Lead", email: null };
  }
}

function gcalArgsFor(
  appt: GhlAppointment,
  contactName: string,
): {
  title: string;
  startIso: string;
  endIso: string;
  description: string;
  allDay: boolean;
} {
  const title = appt.title?.trim() || `Call: ${contactName}`;
  const lines: string[] = [];
  lines.push(`Source: GoHighLevel booking`);
  lines.push(`Contact: ${contactName}`);
  if (appt.contactEmail) lines.push(`Email: ${appt.contactEmail}`);
  if (appt.contactId) {
    lines.push(`GHL contact: ${appt.contactId}`);
  }
  lines.push(`GHL appointment: ${appt.id}`);
  return {
    title,
    startIso: appt.startIso,
    endIso: appt.endIso,
    description: lines.join("\n"),
    allDay: false,
  };
}

interface SyncEnv {
  root: string;
  calendarId: string;
  salesPipelineId: string;
  gcalConnected: boolean;
}

/** Process one appointment against its cached row. Mutates `rows` in place
 *  and returns a verb describing what happened (or null on no-op). Errors are
 *  thrown to the caller so the outer loop can record them. */
async function processOne(
  env: SyncEnv,
  appt: GhlAppointment,
  rows: Record<string, OpsAppointmentRow>,
): Promise<"created" | "rescheduled" | "cancelled" | null> {
  const prior = rows[appt.id];
  const cancelledNow = isCancelled(appt);
  const wasCancelled = prior?.status === "cancelled";

  // ── Cancel branch ──────────────────────────────────────
  if (cancelledNow) {
    if (wasCancelled) return null; // already handled
    // Delete the Google Calendar event if we made one.
    if (prior?.gcalEventId && env.gcalConnected) {
      try {
        await api.googleCalendarDeleteEvent(prior.gcalEventId);
      } catch {
        // Already gone or network glitch — proceed regardless.
      }
    }
    // Advance opportunity to "Call Canceled" if we know which one.
    if (prior?.opportunityId || prior?.contactId) {
      const name = prior?.contactName || appt.contactName || "GHL Lead";
      try {
        await api.ghlAdvanceOpportunity({
          clientName: name,
          clientEmail: prior?.contactEmail ?? appt.contactEmail ?? null,
          pipelineId: env.salesPipelineId,
          pipelineName: null,
          stageName: CANCELED_STAGE_NAME,
          knownContactId: prior?.contactId ?? null,
          knownOpportunityId: prior?.opportunityId ?? null,
        });
      } catch {
        // Stage move failure shouldn't block the bookkeeping update.
      }
    }
    rows[appt.id] = {
      ghlAppointmentId: appt.id,
      gcalEventId: null,
      opportunityId: prior?.opportunityId ?? null,
      contactId: prior?.contactId ?? appt.contactId ?? null,
      contactName: prior?.contactName ?? appt.contactName ?? null,
      contactEmail: prior?.contactEmail ?? appt.contactEmail ?? null,
      startIso: appt.startIso,
      endIso: appt.endIso,
      status: "cancelled",
      calendarId: appt.calendarId,
      syncedAt: new Date().toISOString(),
      title: appt.title ?? prior?.title ?? null,
    };
    return "cancelled";
  }

  // ── Active appointment ────────────────────────────────
  if (!ACTIVE_STATUSES.has(appt.appointmentStatus) && !prior) {
    // Unknown status with no prior record — leave alone.
    return null;
  }

  // Reschedule (or just resurfaced after a previous cancel).
  if (prior && prior.status === "booked" && !timesChanged(appt, prior)) {
    return null;
  }

  // First-time booking OR reschedule OR reactivation after cancel.
  const { name, email } = await resolveContactName(appt);
  const effectiveEmail = email ?? prior?.contactEmail ?? null;

  // Advance the sales opportunity (creates one if it doesn't exist).
  let opportunityId = prior?.opportunityId ?? null;
  let contactId = prior?.contactId ?? appt.contactId ?? null;
  try {
    const advance = await api.ghlAdvanceOpportunity({
      clientName: name,
      clientEmail: effectiveEmail,
      pipelineId: env.salesPipelineId,
      pipelineName: null,
      stageName: BOOKED_STAGE_NAME,
      knownContactId: contactId,
      knownOpportunityId: opportunityId,
    });
    opportunityId = advance.opportunityId;
    contactId = advance.contactId;
  } catch (err) {
    // Re-throw with context so the outer loop logs it.
    throw new Error(
      `advance opportunity for ${name}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Mirror to Google Calendar.
  let gcalEventId = prior?.gcalEventId ?? null;
  if (env.gcalConnected) {
    const gcalArgs = gcalArgsFor(appt, name);
    if (gcalEventId) {
      try {
        await api.googleCalendarUpdateEvent(gcalEventId, gcalArgs);
      } catch {
        // Event might have been deleted manually — fall back to recreate.
        gcalEventId = null;
      }
    }
    if (!gcalEventId) {
      try {
        gcalEventId = await api.googleCalendarCreateEvent(gcalArgs);
      } catch (err) {
        throw new Error(
          `create Google Calendar event for ${name}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  const verb: "created" | "rescheduled" =
    prior && prior.status === "booked" ? "rescheduled" : "created";
  rows[appt.id] = {
    ghlAppointmentId: appt.id,
    gcalEventId,
    opportunityId,
    contactId,
    contactName: name,
    contactEmail: effectiveEmail,
    startIso: appt.startIso,
    endIso: appt.endIso,
    status: "booked",
    calendarId: appt.calendarId,
    syncedAt: new Date().toISOString(),
    title: appt.title ?? null,
  };
  return verb;
}

/** Run one full sync tick. Safe to call repeatedly; no-ops when GHL or the
 *  booking calendar isn't configured. */
export async function runSync(root: string | null): Promise<SyncSummary> {
  if (!root) return EMPTY_SUMMARY("No workspace selected");

  // Config gate.
  let calendarId: string;
  let salesPipelineId: string;
  try {
    const status = await api.ghlGetConfigStatus();
    if (!status.configured) return EMPTY_SUMMARY("GHL not configured");
    if (!status.bookingCalendarId)
      return EMPTY_SUMMARY("No booking calendar picked");
    if (!status.salesPipelineId)
      return EMPTY_SUMMARY("Sales pipeline not picked");
    calendarId = status.bookingCalendarId;
    salesPipelineId = status.salesPipelineId;
  } catch (err) {
    return EMPTY_SUMMARY(
      `GHL config check failed: ${err instanceof Error ? err.message : String(err)}`,
      false,
    );
  }

  let gcalConnected = false;
  try {
    gcalConnected = await api.googleCalendarIsConnected();
  } catch {
    gcalConnected = false;
  }

  // Pull current GHL state + our prior view.
  const { startIso, endIso } = pollWindow();
  let appointments: GhlAppointment[] = [];
  try {
    appointments = await api.ghlListAppointments(calendarId, startIso, endIso);
  } catch (err) {
    return EMPTY_SUMMARY(
      `GHL fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      false,
    );
  }

  let cache: OpsAppointmentsFile = { appointments: {} };
  try {
    cache = await api.readOpsAppointments(root);
  } catch {
    cache = { appointments: {} };
  }
  const rows: Record<string, OpsAppointmentRow> = { ...cache.appointments };

  const env: SyncEnv = { root, calendarId, salesPipelineId, gcalConnected };
  const errors: string[] = [];
  let created = 0;
  let rescheduled = 0;
  let cancelled = 0;
  let skipped = 0;

  for (const appt of appointments) {
    try {
      const verb = await processOne(env, appt, rows);
      if (verb === "created") created++;
      else if (verb === "rescheduled") rescheduled++;
      else if (verb === "cancelled") cancelled++;
      else skipped++;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  // Persist only if anything actually changed.
  const dirty = created + rescheduled + cancelled > 0;
  if (dirty) {
    try {
      await api.writeOpsAppointments(root, { appointments: rows });
    } catch (err) {
      errors.push(
        `persist appointments: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const total = created + rescheduled + cancelled;
  const message =
    total === 0
      ? appointments.length === 0
        ? "No bookings in window"
        : `Up to date · ${appointments.length} appt${appointments.length === 1 ? "" : "s"}`
      : `${created} new · ${rescheduled} moved · ${cancelled} cancelled`;

  const summary: SyncSummary = {
    ok: errors.length === 0,
    processed: appointments.length,
    created,
    rescheduled,
    cancelled,
    skipped,
    errors,
    message,
  };

  // Fire on any real change OR on error, so listeners can refresh their view
  // / surface a failure. Quiet no-ops stay quiet to avoid log spam.
  if (typeof window !== "undefined" && (dirty || !summary.ok)) {
    window.dispatchEvent(
      new CustomEvent<SyncEventDetail>(SYNC_EVENT, { detail: summary }),
    );
  }

  return summary;
}
