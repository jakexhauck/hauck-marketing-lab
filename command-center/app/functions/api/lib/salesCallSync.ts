import type { SupabaseClient } from "@supabase/supabase-js";
import type { GhlContext } from "../../lib/ghl";
import { isColdCallCalendar } from "../../lib/coldCallCalendar";
import { isDeadStatus as isDead } from "../../lib/salesCalls";
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
  // Meetings joined back to the prospect in the cold call book.
  linked: number;
  // Leads this sync moved to Booked because GoHighLevel says they have a
  // meeting. Counted rather than done quietly: a sync that rewrites lead
  // statuses without saying so is the kind of thing nobody finds out about for
  // a month.
  booked: number;
}

interface ExistingRow {
  id: string;
  ghl_appointment_id: string;
  scheduled_at: string | null;
  appointment_status: string;
  prospect_name: string;
  ghl_contact_id: string | null;
  lead_id: string | null;
}

// A cancelled meeting is still a fact worth keeping (it was booked, and it did
// not happen), so nothing is ever deleted here. The list itself moved to
// lib/salesCalls.ts once the Sales Data rollup needed to count cancellations
// too; re-exported so this module's existing callers are unchanged.
export { isDeadStatus } from "../../lib/salesCalls";

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
// Which meetings belong in Sales Data.
//
// This used to be decided per CALENDAR, and twice that was the wrong shape.
// First lesson: the agency account's Onboarding calendar is linked to a
// personal Google account, so reading everything put four flights and a school
// prom on the sales page. The answer then was a name test
// (/demo|discovery|sales/), which kept the flights out.
//
// Second lesson, Jake, 2026-08-24: real discovery calls were being booked onto
// that same Onboarding calendar, and the name test hid every one of them. So
// the rule moved down to the EVENT:
//
//   a meeting comes into Sales Data when its calendar says sales OR the event
//   is attached to a CRM contact.
//
// Personal entries (flights, proms, haircuts) carry no contact, whatever
// calendar somebody typed them into, so they stay out without the page ever
// having to know which calendar is sacred. An explicit AGENCY_SALES_CALENDAR_IDS
// list still wins outright: those calendars are read alone and adopted whole,
// which is how you say "this entire calendar is calls" without renaming it.

export interface NamedCalendar {
  id: string;
  // Optional because GoHighLevel's calendar list sometimes is. A nameless
  // calendar simply fails the name test, which is the safe direction.
  name?: string;
}

export const SALES_CALENDAR = /demo|discovery|sales/i;

// An explicit list always wins, so a calendar that is a sales calendar without
// saying so in its name can be named in AGENCY_SALES_CALENDAR_IDS rather than
// requiring a rename in GoHighLevel.
export function pickSalesCalendars(
  calendars: NamedCalendar[],
  configuredIds?: string | null,
): string[] {
  const configured = splitCalendarIds(configuredIds);
  if (configured.length) {
    // Only ids that actually exist. A stale id in the config would otherwise
    // read as "this calendar had no meetings" forever.
    const known = new Set(calendars.map((c) => c.id));
    return configured.filter((id) => known.has(id));
  }
  return calendars.filter((c) => SALES_CALENDAR.test(c.name ?? "")).map((c) => c.id);
}

function splitCalendarIds(configuredIds?: string | null): string[] {
  return (configuredIds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface AdoptableEvent {
  calendarId: string;
  // Null on a personal entry: nobody in the CRM is attending it.
  contactId?: string | null;
}

// The per-event half of the rule above.
export function shouldAdoptEvent(
  event: AdoptableEvent,
  salesCalendarIds: ReadonlySet<string>,
): boolean {
  return salesCalendarIds.has(event.calendarId) || Boolean(event.contactId);
}

// ---------------------------------------------------------------------------
// The prospect behind the appointment.
//
// cold-call/book.ts has always been the only thing that marks a lead Booked,
// which means a meeting made anywhere else, a booking widget, a workflow, Jake
// on his phone inside GHL, left the lead book saying "New Lead" while the
// prospect sat on a calendar. Honeycutt Heating booked itself a demo through
// the widget and the suite never noticed.
//
// The match is on ghl_contact_id and nothing else. A name or phone match would
// catch a few more, and would eventually book the wrong prospect; the lead book
// has stored the contact id since 0053 and it is exact.

export interface BookableLead {
  id: string;
  ghl_contact_id: string;
  status: string;
  appointment_date: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

// What to call an adopted meeting whose prospect is in the book.
//
// nameFromEvent falls back to the appointment title, because that is all an
// adopted row has ever had: GoHighLevel's events route returns no contact name.
// The titles read fine while they were "<prospect> x Hauck Marketing" and badly
// as soon as one is not, and "Hauck Marketing X  Rich Honey Cut Heating Rich"
// is not a name anybody can scan a page of. When the contact is a lead, the
// book's own name for them is better than anything parsed out of a title.
export function nameFromLead(lead: BookableLead | undefined): string {
  if (!lead) return "";
  return `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.replace(/\s+/g, " ").trim();
}

export interface LeadBooking {
  leadId: string;
  appointmentDate: string;
}

// A meeting that has been and gone is history, and the sync reads 90 days of
// it. One day of grace, so a meeting earlier today still lands.
const RECENT = 24 * 60 * 60 * 1000;

/**
 * Which leads this sync should move to Booked, and to what date.
 *
 * The rules, all of which have to hold:
 *
 *   - the appointment's contact is a lead in the book
 *   - it is on a cold call calendar. Cold Call > Booked filters on the same
 *     test, so a lead marked Booked off Jake's own demo calendar would claim a
 *     meeting the caller's page will never show.
 *   - it was not cancelled, and nobody failed to turn up
 *   - it has not already happened
 *   - the lead does not already say Booked on that same day, or every sync
 *     rewrites the same row forever. A meeting MOVED inside GoHighLevel does
 *     come through, which is the whole point of the calendar owning the when.
 *
 * A prospect with two meetings gets the nearer one, once.
 */
export function leadBookings(
  events: CalendarEvent[],
  leads: BookableLead[],
  nowMs: number,
): LeadBooking[] {
  const byContact = new Map(leads.filter((l) => l.ghl_contact_id).map((l) => [l.ghl_contact_id, l]));
  const chosen = new Map<string, { at: number; booking: LeadBooking }>();

  for (const event of events) {
    if (!event.contactId || !event.startTime) continue;
    if (!isColdCallCalendar(event.calendarName)) continue;
    if (isDead(event.status)) continue;

    const lead = byContact.get(event.contactId);
    if (!lead) continue;

    const at = Date.parse(event.startTime);
    if (!Number.isFinite(at) || at < nowMs - RECENT) continue;

    // The day where the meeting is, not the day in UTC: the calendar sends its
    // own offset, and a 4pm meeting in Detroit is not tomorrow because London
    // says so.
    const appointmentDate = event.startTime.slice(0, 10);
    if (lead.status === "Booked" && lead.appointment_date === appointmentDate) continue;

    const held = chosen.get(lead.id);
    if (!held || at < held.at) {
      chosen.set(lead.id, { at, booking: { leadId: lead.id, appointmentDate } });
    }
  }

  return [...chosen.values()].map((c) => c.booking);
}

export interface SyncOptions {
  // The window to read, as epoch milliseconds. Defaults to the last 90 days and
  // the next 90: far enough back to pick up a meeting whose outcome was never
  // recorded, far enough forward to show what is coming.
  fromMs?: number;
  toMs?: number;
  nowMs?: number;
  // AGENCY_SALES_CALENDAR_IDS. When set, those calendars alone are read and
  // adopted whole; when not, every calendar is read and shouldAdoptEvent
  // decides per event.
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

  const allCalendars = await listCalendars(gctx);
  const configuredIds = splitCalendarIds(options.calendarIds);
  const salesCalendarIds = new Set(pickSalesCalendars(allCalendars, options.calendarIds));
  // Explicit list: read only those, adopt everything on them. Otherwise read
  // everything and let the contact test sort meetings from personal life.
  const readIds = configuredIds.length
    ? [...salesCalendarIds]
    : allCalendars.map((c) => c.id);
  if (readIds.length === 0) {
    // Nothing to read is not the same as nothing booked, and the page has to be
    // able to tell the difference rather than showing a confident empty week.
    return {
      added: 0,
      updated: 0,
      unchanged: 0,
      failedCalendarIds: [],
      calendarsRead: 0,
      linked: 0,
      booked: 0,
    };
  }

  const { events: rawEvents, failedCalendarIds } = await listCalendarEvents(
    gctx,
    fromMs,
    toMs,
    readIds,
  );
  const events = configuredIds.length
    ? rawEvents
    : rawEvents.filter((e) => shouldAdoptEvent(e, salesCalendarIds));
  const result: SyncResult = {
    added: 0,
    updated: 0,
    unchanged: 0,
    failedCalendarIds,
    calendarsRead: readIds.length,
    linked: 0,
    booked: 0,
  };
  if (events.length === 0) return result;

  const ids = events.map((e) => e.id);
  const { data, error } = await client
    .from("sales_calls")
    .select(
      "id, ghl_appointment_id, scheduled_at, appointment_status, prospect_name, ghl_contact_id, lead_id",
    )
    .in("ghl_appointment_id", ids);
  if (error) throw new Error(`could not read the existing meetings: ${error.message}`);

  const existing = new Map<string, ExistingRow>(
    ((data ?? []) as ExistingRow[]).map((r) => [r.ghl_appointment_id, r]),
  );
  const syncedAt = new Date(now).toISOString();

  // The prospects behind these appointments, if they are in the cold call book
  // at all. One read for the whole pass.
  const contactIds = [...new Set(events.map((e) => e.contactId).filter(Boolean))];
  const leads: BookableLead[] = [];
  if (contactIds.length > 0) {
    const { data: leadRows, error: leadError } = await client
      .from("leads")
      .select("id, ghl_contact_id, status, appointment_date, first_name, last_name")
      .in("ghl_contact_id", contactIds)
      .is("deleted_at", null);
    if (leadError) throw new Error(`could not read the prospects: ${leadError.message}`);
    leads.push(...((leadRows ?? []) as BookableLead[]));
  }
  const leadByContact = new Map(leads.filter((l) => l.ghl_contact_id).map((l) => [l.ghl_contact_id, l]));

  const inserts: Record<string, unknown>[] = [];
  const updates: { id: string; fields: Record<string, unknown> }[] = [];

  for (const event of events) {
    const row = existing.get(event.id);

    // Which prospect this meeting is with. Rows the app booked have carried it
    // since the beginning; one adopted off the calendar never had it, and
    // without it Cold Call > Booked cannot tell whose meeting it is, because it
    // scopes by the lead's assignee.
    const lead = event.contactId ? leadByContact.get(event.contactId) : undefined;
    const leadId = lead?.id ?? null;

    if (!row) {
      if (leadId) result.linked += 1;
      inserts.push({
        ghl_appointment_id: event.id,
        ghl_contact_id: event.contactId || null,
        lead_id: leadId,
        prospect_name: nameFromLead(lead) || nameFromEvent(event),
        scheduled_at: event.startTime,
        appointment_status: event.status,
        calendar_id: event.calendarId,
        calendar_name: event.calendarName,
        // Where this row came from. Rows the app booked say "Cold call"; this
        // one arrived off the calendar and should not claim otherwise.
        source: "Calendar",
        synced_at: syncedAt,
      });
      continue;
    }

    // A row adopted before the sync knew how to look the prospect up. Filled in
    // once and never overwritten: a lead_id already on the row was put there by
    // cold-call/book.ts, which knew exactly whose booking it was.
    const link = !row.lead_id && leadId ? { lead_id: leadId } : null;
    if (link) result.linked += 1;

    if (!needsUpdate(row, event)) {
      result.unchanged += 1;
      // Still stamp the sync, so "last checked" is honest even when nothing
      // moved. Cheap, and it is what makes a stale page detectable.
      //
      // The calendar rides along on this branch too, which is what backfills
      // every row written before 0066 without a migration having to guess. It
      // also follows a calendar RENAME, since the name is re-read each pass.
      updates.push({
        id: row.id,
        fields: {
          synced_at: syncedAt,
          calendar_id: event.calendarId,
          calendar_name: event.calendarName,
          ...link,
        },
      });
      continue;
    }

    updates.push({
      id: row.id,
      fields: {
        scheduled_at: event.startTime,
        appointment_status: event.status,
        synced_at: syncedAt,
        calendar_id: event.calendarId,
        calendar_name: event.calendarName,
        ...link,
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

  // And the lead book hears about it. Same three fields cold-call/book.ts
  // writes, minus last_contact: the app did not dial anybody here, and stamping
  // an attempt it never made would put a phantom dial in the record.
  //
  // Last, and one lead at a time. A booking that lands on the calendar and not
  // in the book is the bug being fixed; one that lands in the book with no
  // meeting behind it is worse, because the caller moves on believing it.
  for (const booking of leadBookings(events, leads, now)) {
    const { error: leadError } = await client
      .from("leads")
      .update({
        status: "Booked",
        appointment_date: booking.appointmentDate,
        // A promise to call back is superseded by a meeting.
        follow_up_date: null,
        updated_at: syncedAt,
      })
      .eq("id", booking.leadId);
    if (leadError) {
      // Not fatal. The meetings are already written, and a page that refuses to
      // draw them because one lead row would not update is the wrong trade.
      console.error("[salesCallSync] could not mark a lead booked", booking.leadId, leadError.message);
      continue;
    }
    result.booked += 1;
  }

  return result;
}
