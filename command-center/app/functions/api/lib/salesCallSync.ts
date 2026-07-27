import type { SupabaseClient } from "@supabase/supabase-js";
import type { GhlContext } from "../../lib/ghl";
import { listCalendarEvents, listCalendars, type CalendarEvent } from "./appointments";

// Reading the agency's calendars into sales_calls.
//
// Stage 4 of command-center/docs/build-plans/agency-ghl-connection.md. Before
// this, a row existed here only if cold-call/book.ts created it, so the console
// knew about exactly the meetings it had booked itself and nothing else. A
// meeting Jake booked from his phone, one a workflow booked off a form, or one
// somebody moved to next Tuesday inside GoHighLevel: all invisible.
//
// The direction of trust, which is the whole design:
//
//   GoHighLevel owns WHEN the meeting is and whether it is still on the
//   calendar. Those fields are overwritten from the calendar on every sync.
//
//   This app owns WHAT HAPPENED at it. outcome, cash, follow-up and the rest
//   are never touched here, so a sync can run as often as it likes and can
//   never wipe an answer somebody recorded.
//
// That split is why this is a safe thing to do on page load rather than a job
// somebody has to remember to run.

export interface SyncResult {
  // Meetings the console had never seen, now on the page.
  added: number;
  // Rows whose time or calendar status moved underneath us.
  updated: number;
  // Rows already correct.
  unchanged: number;
  // Calendars GoHighLevel would not read. Named rather than swallowed: a
  // meetings page missing one calendar looks exactly like a quiet day.
  failedCalendarIds: string[];
  // How many calendars were treated as sales calendars. Zero means the account
  // has none this app recognises, which the page must say out loud rather than
  // rendering as a week with no meetings in it.
  calendarsRead: number;
}

interface ExistingRow {
  id: string;
  ghl_appointment_id: string;
  scheduled_at: string | null;
  appointment_status: string;
  prospect_name: string;
  ghl_contact_id: string | null;
}

// A cancelled meeting is still a fact worth keeping (it was booked, and it did
// not happen), so nothing is ever deleted here. GHL's own vocabulary varies by
// endpoint; lowercased, these are the ones that mean "not going ahead".
const DEAD_STATUSES = new Set(["cancelled", "canceled", "invalid", "noshow", "no-show"]);

export function isDeadStatus(status: string): boolean {
  return DEAD_STATUSES.has(status.trim().toLowerCase().replace(/\s+/g, ""));
}

// The name to put on a row the app did not book.
//
// The calendar gives a contact name and a title like "Discovery call - Tom
// Hale". Prefer the contact: the title is whatever the booking form or the
// person typing it felt like, and a page of rows called "Discovery call" is a
// page nobody can scan.
export function nameFromEvent(event: CalendarEvent): string {
  const contact = (event.contactName ?? "").trim();
  if (contact) return contact;
  const title = (event.title ?? "").trim();
  // "Discovery call - Tom Hale" -> "Tom Hale". Only when there is something
  // after the dash worth having.
  const tail = title.split(/\s+-\s+/).slice(1).join(" - ").trim();
  return tail || title || "Unnamed prospect";
}

// Has anything GoHighLevel owns actually moved?
export function needsUpdate(row: ExistingRow, event: CalendarEvent): boolean {
  const sameTime =
    (row.scheduled_at === null && event.startTime === null) ||
    (row.scheduled_at !== null &&
      event.startTime !== null &&
      Date.parse(row.scheduled_at) === Date.parse(event.startTime));
  return !sameTime || row.appointment_status !== event.status;
}

// ---------------------------------------------------------------------------
// Which calendars hold sales meetings.
//
// This is not "all of them", and finding that out the hard way is why the rule
// is written down here. The agency account has two calendars, and the
// Onboarding one is linked to a personal Google account: reading everything
// produced a sales meetings page listing four flights and a school prom.
//
// The test is the one BookingPanel already uses to decide where a discovery
// call goes, deliberately, so the calendar the app books into is the calendar
// the app reads back. Two different answers to "which one is the sales
// calendar" is how a booking lands somewhere the page will never show it.

export interface NamedCalendar {
  id: string;
  // Optional because GoHighLevel's calendar list sometimes is. A nameless
  // calendar simply fails the name test, which is the safe direction.
  name?: string;
}

const SALES_CALENDAR = /demo|discovery|sales/i;

// An explicit list always wins, so a calendar that is a sales calendar without
// saying so in its name can be named in AGENCY_SALES_CALENDAR_IDS rather than
// requiring a rename in GoHighLevel.
export function pickSalesCalendars(
  calendars: NamedCalendar[],
  configuredIds?: string | null,
): string[] {
  const configured = (configuredIds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (configured.length) {
    // Only ids that actually exist. A stale id in the config would otherwise
    // read as "this calendar had no meetings" forever.
    const known = new Set(calendars.map((c) => c.id));
    return configured.filter((id) => known.has(id));
  }
  return calendars.filter((c) => SALES_CALENDAR.test(c.name ?? "")).map((c) => c.id);
}

export interface SyncOptions {
  // The window to read, as epoch milliseconds. Defaults to the last 90 days and
  // the next 90: far enough back to pick up a meeting whose outcome was never
  // recorded, far enough forward to show what is coming.
  fromMs?: number;
  toMs?: number;
  nowMs?: number;
  // AGENCY_SALES_CALENDAR_IDS, when the account has a sales calendar whose name
  // does not say so.
  calendarIds?: string | null;
}

const DAY = 24 * 60 * 60 * 1000;

// Reconcile the agency calendars into sales_calls. Additive and idempotent:
// running it twice in a row changes nothing the second time.
export async function syncAgencyMeetings(
  gctx: GhlContext,
  client: SupabaseClient,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const now = options.nowMs ?? Date.now();
  const fromMs = options.fromMs ?? now - 90 * DAY;
  const toMs = options.toMs ?? now + 90 * DAY;

  const calendarIds = pickSalesCalendars(await listCalendars(gctx), options.calendarIds);
  if (calendarIds.length === 0) {
    // Nothing to read is not the same as nothing booked, and the page has to be
    // able to tell the difference rather than showing a confident empty week.
    return {
      added: 0,
      updated: 0,
      unchanged: 0,
      failedCalendarIds: [],
      calendarsRead: 0,
    };
  }

  const { events, failedCalendarIds } = await listCalendarEvents(
    gctx,
    fromMs,
    toMs,
    calendarIds,
  );
  const result: SyncResult = {
    added: 0,
    updated: 0,
    unchanged: 0,
    failedCalendarIds,
    calendarsRead: calendarIds.length,
  };
  if (events.length === 0) return result;

  const ids = events.map((e) => e.id);
  const { data, error } = await client
    .from("sales_calls")
    .select("id, ghl_appointment_id, scheduled_at, appointment_status, prospect_name, ghl_contact_id")
    .in("ghl_appointment_id", ids);
  if (error) throw new Error(`could not read the existing meetings: ${error.message}`);

  const existing = new Map<string, ExistingRow>(
    ((data ?? []) as ExistingRow[]).map((r) => [r.ghl_appointment_id, r]),
  );
  const syncedAt = new Date(now).toISOString();

  const inserts: Record<string, unknown>[] = [];
  const updates: { id: string; fields: Record<string, unknown> }[] = [];

  for (const event of events) {
    const row = existing.get(event.id);

    if (!row) {
      inserts.push({
        ghl_appointment_id: event.id,
        ghl_contact_id: event.contactId || null,
        prospect_name: nameFromEvent(event),
        scheduled_at: event.startTime,
        appointment_status: event.status,
        // Where this row came from. Rows the app booked say "Cold call"; this
        // one arrived off the calendar and should not claim otherwise.
        source: "Calendar",
        synced_at: syncedAt,
      });
      continue;
    }

    if (!needsUpdate(row, event)) {
      result.unchanged += 1;
      // Still stamp the sync, so "last checked" is honest even when nothing
      // moved. Cheap, and it is what makes a stale page detectable.
      updates.push({ id: row.id, fields: { synced_at: syncedAt } });
      continue;
    }

    updates.push({
      id: row.id,
      fields: {
        scheduled_at: event.startTime,
        appointment_status: event.status,
        synced_at: syncedAt,
        // Deliberately NOT touched: outcome, cash_collected, follow_up_at,
        // qualified, logged_by. The calendar has no opinion about what
        // happened in the room.
      },
    });
    result.updated += 1;
  }

  if (inserts.length) {
    // Keyed on the appointment id, which 0057 made unique, so two syncs racing
    // each other produce one row rather than a duplicate.
    const { error: insertError } = await client
      .from("sales_calls")
      .upsert(inserts, { onConflict: "ghl_appointment_id", ignoreDuplicates: false });
    if (insertError) {
      throw new Error(`could not add the new meetings: ${insertError.message}`);
    }
    result.added = inserts.length;
  }

  // One at a time: each row gets different values, and a batch upsert here would
  // need every not-null column restated, which is how a sync starts blanking
  // fields it was never meant to touch.
  for (const update of updates) {
    await client.from("sales_calls").update(update.fields).eq("id", update.id);
  }

  return result;
}
