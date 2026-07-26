import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { getAgencyGhlContext, AgencyGhlError, agencyTimezone } from "../../../lib/agencyGhl";
import { fetchCalendarEvents } from "../../lib/appointments";
import { reconcileRow, type LeadFacts, type DemoAppointment } from "../../../lib/salesCalls";

// GET /api/admin/sales-calls?start=&end=  (admin session gated in
// _middleware.ts; owner-only by default, since lib/adminRoles allowlists
// nothing under this prefix for a cold caller or a setter).
//
// A window of demo calls: what is on the agency's demo calendar, reconciled
// into sales_calls so the log table alone can answer everything afterwards,
// including the Sales Data counts.
//
// ONE nominated calendar, never "every active calendar". The agency account
// also carries an Onboarding calendar that a personal Google account syncs
// flight bookings into, and the per-client Setter Calendar's read-them-all
// approach would list a flight to Atlanta here as a demo call with a Start Call
// button on it. Which calendar is the demo calendar is a setting
// (agency_settings.demo_calendar_id) chosen on the Cold Call Settings page.
//
// Read-only against GoHighLevel. Nothing here writes back: every pipeline move
// and every automation stays Jake's, driven from tags inside GHL, which is the
// same rule functions/lib/agencyGhl.ts already states for the cold caller.

// A window wider than this is a fan-out nobody asked for, and the page never
// needs one: its widest view is history, which paginates by month.
const MAX_RANGE_MS = 186 * 24 * 60 * 60_000;

// The columns the page reads back. Deliberately explicit rather than `*` so a
// column added later has to be opted into rather than silently shipped.
const SELECT = `
  id, ghl_appointment_id, ghl_contact_id, lead_id,
  prospect_name, business_name, phone, email, timezone, source,
  scheduled_at, appointment_status,
  started_at, ended_at, duration_seconds,
  outcome, qualified, not_a_fit_reason, follow_up_at,
  sections, scratchpad, deal, cash_collected,
  created_at, updated_at
`;

interface LeadRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  timezone: string | null;
  source: string | null;
  ghl_contact_id: string | null;
  assigned_to: string | null;
}

export type ParsedRange =
  | { ok: true; startMs: number; endMs: number }
  | { ok: false; code: string };

// Pure: validate the window and convert to epoch milliseconds, which is what
// the GHL events route wants. An unparseable date left alone interpolates NaN
// into the query and comes back empty, which reads on screen as "no demo calls
// booked" rather than as the bad request it is.
export function parseRange(params: URLSearchParams): ParsedRange {
  const start = (params.get("start") ?? "").trim();
  const end = (params.get("end") ?? "").trim();
  if (!start || !end) return { ok: false, code: "missing_range" };

  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { ok: false, code: "invalid_range" };
  }
  if (endMs <= startMs) return { ok: false, code: "invalid_range" };
  if (endMs - startMs > MAX_RANGE_MS) return { ok: false, code: "range_too_wide" };

  return { ok: true, startMs, endMs };
}

// businessName is deliberately blank: the lead book has no business-name
// column (see migration 0034 and the columns 0053 added), so there is nothing
// truthful to put here yet. The sales_calls column exists and is written the
// moment a source for it does; inventing one from the lead's notes would put a
// guess on a card somebody reads out loud on a call.
function leadFacts(row: LeadRow): LeadFacts {
  return {
    id: row.id,
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    businessName: "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    timezone: row.timezone ?? "",
    source: row.source ?? "",
  };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const range = parseRange(url.searchParams);
  if (!range.ok) return Response.json({ error: range.code }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });

  // Both "not connected" answers are 200 with a flag, not an error status. The
  // page renders a sentence explaining what to do about it, and a 503 would
  // instead give it a generic failure to render.
  let gctx;
  try {
    gctx = getAgencyGhlContext(ctx.env);
  } catch (err) {
    if (err instanceof AgencyGhlError) {
      return Response.json({ configured: false, calendarChosen: false, calls: [] });
    }
    throw err;
  }

  const { data: settings } = await client
    .from("agency_settings")
    .select("demo_calendar_id")
    .eq("id", "agency")
    .maybeSingle();

  const calendarId = (settings as { demo_calendar_id: string | null } | null)?.demo_calendar_id;
  if (!calendarId) {
    return Response.json({ configured: true, calendarChosen: false, calls: [] });
  }

  // ---- The calendar, for this window.
  let events: DemoAppointment[];
  try {
    events = await fetchCalendarEvents(gctx, calendarId, range.startMs, range.endMs);
  } catch (e) {
    const body = e instanceof Error ? e.message : String(e);
    console.error("[sales-calls] calendar read failed", body);
    return Response.json({ error: "ghl_error", body }, { status: 502 });
  }

  // ---- Reconcile what is on the calendar into rows.
  //
  // A write on a read, which is worth being explicit about. The alternative is
  // asking GoHighLevel for the month every time the Sales Data tab renders, and
  // a month of counts that depends on a live third-party call is a month of
  // counts that can disagree with itself between two page loads. The upsert is
  // idempotent, and it only ever touches the columns describing the BOOKING:
  // notes, outcome and deal are never in the payload, so reconciling can not
  // wipe what somebody typed on the call.
  if (events.length) {
    const contactIds = [...new Set(events.map((e) => e.contactId).filter(Boolean))];

    let leadsByContact = new Map<string, LeadRow>();
    if (contactIds.length) {
      const { data: leads } = await client
        .from("leads")
        .select(
          "id, first_name, last_name, phone, email, timezone, source, ghl_contact_id, assigned_to",
        )
        .in("ghl_contact_id", contactIds)
        .is("deleted_at", null);
      leadsByContact = new Map(
        ((leads ?? []) as LeadRow[])
          .filter((l) => l.ghl_contact_id)
          .map((l) => [l.ghl_contact_id as string, l]),
      );
    }

    const rows = events.map((ev) => {
      const lead = ev.contactId ? (leadsByContact.get(ev.contactId) ?? null) : null;
      return reconcileRow(ev, lead ? leadFacts(lead) : null);
    });

    const { error: upsertError } = await client
      .from("sales_calls")
      .upsert(rows, { onConflict: "ghl_appointment_id" });
    if (upsertError) {
      console.error("[sales-calls] reconcile failed", upsertError.message);
      // Not fatal. The rows already stored are still worth showing, and losing
      // the page entirely because one upsert failed is the worse outcome.
    }
  }

  // ---- Read back the window.
  //
  // From the table, not from `events`, so a call whose appointment was later
  // deleted from the calendar still appears with its notes intact. A recorded
  // conversation should not vanish because somebody tidied a calendar.
  const { data, error } = await client
    .from("sales_calls")
    .select(SELECT)
    .gte("scheduled_at", new Date(range.startMs).toISOString())
    .lte("scheduled_at", new Date(range.endMs).toISOString())
    .order("scheduled_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    configured: true,
    calendarChosen: true,
    timezone: agencyTimezone(ctx.env),
    calls: data ?? [],
  });
};
