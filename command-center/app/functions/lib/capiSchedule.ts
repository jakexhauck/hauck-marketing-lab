import type { SupabaseClient } from "@supabase/supabase-js";
import { ghlJson, type GhlContext } from "./ghl";
import { lookupIdentity } from "./capiIdentity";
import {
  sendScheduleEvent,
  type FunnelCapi,
  type LeadEventResult,
} from "./metaCapi";

// Reporting a booked appointment back to Meta.
//
// Meta knows what it billed for and nothing else. It reported 51 leads for
// Willis Windows in thirty days and has no idea whether any of them booked, so
// the campaign optimises toward whoever fills in a form rather than whoever
// turns up. This is the other half of that loop.
//
// TWO PATHS IN, ONE EVENT OUT. A booking can reach us either instantly, from
// the GHL AppointmentCreate webhook, or later, from the polling sync. Willis's
// webhook is not wired (their activity log holds three test rows from June), so
// the poll is what actually runs today; the webhook path is here so it becomes
// instant the moment those workflows exist, with no second implementation to
// keep in step. Both key the event on the GHL appointment id, so firing both
// counts one booking rather than two, and the capi_sent ledger means a re-run
// sends nothing at all.
//
// THE SEVEN DAY WALL. Meta rejects any event more than seven days old. That is
// not a tuning parameter, it is why this cannot be backfilled: every booking
// made before this shipped is unreportable, and Meta's Bookings figure
// therefore starts at zero and fills in from today. The poll's default window
// is deliberately well inside that wall.

// How far back the poll looks for newly created appointments. Comfortably
// inside Meta's seven-day limit, so a sync that fails for a day or two still
// catches up rather than silently dropping the bookings it missed.
export const SCHEDULE_LOOKBACK_DAYS = 5;

// How far either side of today to ask GHL for appointments. A job booked months
// out was still BOOKED today, and it is the booking we are reporting, not the
// appointment, so the search has to be wide even though the filter is narrow.
const EVENT_WINDOW_DAYS = 180;

export interface GhlAppointment {
  id: string;
  contactId: string;
  // When the booking was MADE. This, never startTime: Meta wants the moment the
  // conversion happened, and an estimate booked today for next month would
  // otherwise be reported with a timestamp weeks in the future and rejected.
  dateAdded: string;
  startTime: string;
  title: string;
  status: string;
  // GHL's own note of where the booking came from ("booking_widget" for the
  // funnel's own step). Used to decide action_source.
  source: string;
}

interface EventsResp {
  events?: Record<string, unknown>[];
}
interface CalendarsResp {
  calendars?: { id: string; name?: string }[];
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// A cancelled appointment is not a booking. GHL spells the field two ways on
// the same payload (`appointmentStatus` and the misspelled `appoinmentStatus`),
// so both are read; a deleted event is excluded outright.
export function isRealBooking(row: Record<string, unknown>): boolean {
  if (row.deleted === true) return false;
  const status = (
    str(row.appointmentStatus) || str(row.appoinmentStatus) || str(row.status) || "booked"
  ).toLowerCase();
  return status !== "cancelled" && status !== "canceled" && status !== "noshow";
}

export function toAppointment(row: Record<string, unknown>): GhlAppointment | null {
  const id = str(row.id) || str(row._id);
  const contactId = str(row.contactId);
  const dateAdded = str(row.dateAdded) || str(row.dateUpdated);
  // Without an id there is nothing to deduplicate on, without a contact there
  // is nobody to match, and without a creation time the event cannot be dated.
  // Any of the three missing means the booking is not reportable.
  if (!id || !contactId || !dateAdded) return null;

  const createdBy = (row.createdBy ?? {}) as Record<string, unknown>;
  return {
    id,
    contactId,
    dateAdded,
    startTime: str(row.startTime),
    title: str(row.title) || "Appointment",
    status: str(row.appointmentStatus) || str(row.appoinmentStatus) || "booked",
    source: str(createdBy.source),
  };
}

// Every appointment BOOKED since `since`, across all of the client's calendars.
export async function fetchRecentBookings(
  gctx: GhlContext,
  sinceMs: number,
  nowMs: number,
): Promise<GhlAppointment[]> {
  let calendars: CalendarsResp["calendars"] = [];
  try {
    const data = await ghlJson<CalendarsResp>(
      gctx,
      `/calendars/?locationId=${encodeURIComponent(gctx.locationId)}`,
    );
    calendars = data.calendars ?? [];
  } catch (err) {
    console.warn("[capi/schedule] calendar discovery failed", err);
    return [];
  }

  const from = nowMs - EVENT_WINDOW_DAYS * 86_400_000;
  const to = nowMs + EVENT_WINDOW_DAYS * 86_400_000;

  const perCalendar = await Promise.all(
    calendars.map(async (cal) => {
      try {
        const data = await ghlJson<EventsResp>(
          gctx,
          `/calendars/events?locationId=${encodeURIComponent(gctx.locationId)}&calendarId=${encodeURIComponent(cal.id)}&startTime=${from}&endTime=${to}`,
        );
        return data.events ?? [];
      } catch (err) {
        console.warn(`[capi/schedule] events failed for calendar ${cal.id}`, err);
        return [] as Record<string, unknown>[];
      }
    }),
  );

  const out: GhlAppointment[] = [];
  for (const rows of perCalendar) {
    for (const row of rows) {
      if (!isRealBooking(row)) continue;
      const appt = toAppointment(row);
      if (!appt) continue;
      const made = Date.parse(appt.dateAdded);
      if (!Number.isFinite(made) || made < sinceMs) continue;
      out.push(appt);
    }
  }
  return out;
}

// The contact behind a booking, for the hashed match.
export interface BookingContact {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export async function fetchContact(
  gctx: GhlContext,
  contactId: string,
): Promise<BookingContact | null> {
  try {
    const data = await ghlJson<{ contact?: Record<string, unknown> }>(
      gctx,
      `/contacts/${encodeURIComponent(contactId)}`,
    );
    const c = data.contact;
    if (!c) return null;
    return {
      email: str(c.email),
      phone: str(c.phone),
      firstName: str(c.firstName),
      lastName: str(c.lastName),
      city: str(c.city),
      state: str(c.state),
      zip: str(c.postalCode),
    };
  } catch (err) {
    console.warn(`[capi/schedule] contact ${contactId} failed`, err);
    return null;
  }
}

// Which appointment ids have already been reported for this funnel.
export async function alreadySent(
  client: SupabaseClient,
  funnelKey: string,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await client
    .from("capi_sent")
    .select("event_id")
    .eq("funnel", funnelKey)
    .eq("event_name", "Schedule")
    .in("event_id", ids);
  if (error) {
    // Fail CLOSED: without the ledger we cannot tell a new booking from one
    // already reported, and re-reporting every booking in the window would
    // inflate the client's own conversion figures. Sending nothing this run is
    // recoverable; double counting is not.
    console.warn("[capi/schedule] ledger read failed, skipping run", error.message);
    return new Set(ids);
  }
  return new Set((data ?? []).map((r) => String((r as { event_id: string }).event_id)));
}

export interface ScheduleReport {
  appointmentId: string;
  ok: boolean;
  error?: string;
  matched: boolean;
}

// Report ONE booking. Used by both the webhook and the poll.
export async function reportBooking(
  client: SupabaseClient,
  token: string,
  funnelKey: string,
  funnel: FunnelCapi,
  gctx: GhlContext,
  appt: GhlAppointment,
  tenantId: string | null,
  testEventCode?: string,
): Promise<ScheduleReport> {
  const who = (await fetchContact(gctx, appt.contactId)) ?? {};
  const signals = await lookupIdentity(client, funnelKey, who);

  const madeMs = Date.parse(appt.dateAdded);
  const result: LeadEventResult = await sendScheduleEvent(token, funnel, {
    // The GHL appointment id, so the webhook and the poll cannot double count.
    eventId: appt.id,
    eventTime: Math.floor((Number.isFinite(madeMs) ? madeMs : Date.now()) / 1000),
    who: { ...who, country: "us" },
    signals,
    // A booking taken on the funnel's own widget IS a website action. One the
    // office typed in by hand is not, and saying otherwise would misreport
    // where the conversion happened.
    actionSource: appt.source === "booking_widget" ? "website" : "system_generated",
    testEventCode,
  });

  // A TEST event never touches the ledger.
  //
  // It went to Events Manager's Test Events tab, not the live stream, so as far
  // as the client's reporting is concerned it never happened. Recording it
  // would mark the booking as reported and permanently suppress the real event
  // for that appointment: proving the wiring works would be the very thing that
  // stopped it working.
  if (!testEventCode) {
    // Written whether Meta accepted or refused, carrying the reason. A failed
    // event retried forever is how a broken pixel turns into a rate limit; a
    // failure recorded is one somebody can read later.
    const { error } = await client.from("capi_sent").upsert(
      {
        funnel: funnelKey,
        event_name: "Schedule",
        event_id: appt.id,
        tenant_id: tenantId,
        ok: result.ok,
        detail: result.ok
          ? null
          : [result.error, result.errorDetail].filter(Boolean).join(" | ").slice(0, 500),
      },
      { onConflict: "funnel,event_name,event_id" },
    );
    if (error) console.warn("[capi/schedule] ledger write failed", error.message);
  }

  return {
    appointmentId: appt.id,
    ok: result.ok,
    error: result.ok ? undefined : result.error,
    // Whether we had real click signals to match on, which is what separates a
    // booking Meta attributes to the ad from one it merely records.
    matched: Boolean(signals.fbc || signals.fbp),
  };
}

// Report every booking made since the lookback, for one client.
export async function reportBookingsForTenant(input: {
  client: SupabaseClient;
  token: string;
  funnelKey: string;
  funnel: FunnelCapi;
  gctx: GhlContext;
  tenantId: string | null;
  nowMs?: number;
  lookbackDays?: number;
  testEventCode?: string;
}): Promise<{ found: number; sent: number; failed: number; skipped: number; reports: ScheduleReport[] }> {
  const now = input.nowMs ?? Date.now();
  const since = now - (input.lookbackDays ?? SCHEDULE_LOOKBACK_DAYS) * 86_400_000;

  const bookings = await fetchRecentBookings(input.gctx, since, now);

  // A test run ignores the ledger in both directions: it does not skip a
  // booking already reported live, and it does not record what it sends. The
  // point of a test run is to watch an event land in the Test Events tab, and
  // that is impossible if every real booking is filtered out first.
  const seen = input.testEventCode
    ? new Set<string>()
    : await alreadySent(
        input.client,
        input.funnelKey,
        bookings.map((b) => b.id),
      );
  const fresh = bookings.filter((b) => !seen.has(b.id));

  const reports: ScheduleReport[] = [];
  for (const appt of fresh) {
    reports.push(
      await reportBooking(
        input.client,
        input.token,
        input.funnelKey,
        input.funnel,
        input.gctx,
        appt,
        input.tenantId,
        input.testEventCode,
      ),
    );
  }

  return {
    found: bookings.length,
    sent: reports.filter((r) => r.ok).length,
    failed: reports.filter((r) => !r.ok).length,
    skipped: bookings.length - fresh.length,
    reports,
  };
}
