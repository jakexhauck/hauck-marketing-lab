import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { getAgencyGhlContext, AgencyGhlError } from "../../../lib/agencyGhl";
import { syncAgencyMeetings, type SyncResult } from "../../lib/salesCallSync";
import { resolveAgencySalesPipeline } from "../../lib/agencySales";
import {
  MEETING_SELECT,
  recordSalesCallOutcome,
  shapeMeeting,
  attachBookers,
  type MeetingRow,
  type RecordBody,
} from "../../lib/recordSalesCall";

// GET   /api/admin/sales/calls  -> every sales meeting, calendar-first
// PATCH /api/admin/sales/calls  -> record one meeting's outcome and route it
//
// Sales > Sales Calls. Cold Call > Booked shows a caller the meetings they set;
// this is the same record from the other end, and it is Jake's page: every
// meeting on the agency calendars, whoever booked it and whether or not this
// app was involved.
//
// The difference that matters is the sync. Cold Call's page can only ever show
// what the app booked, because that is all the app wrote. Here the calendars
// are read first and anything new is adopted, so a meeting booked on a phone,
// by a workflow, or moved to next Tuesday inside GoHighLevel is on the page
// without anybody re-typing it.
//
// Owner only. The pillar's tab list already refuses a cold caller (ROLE_TABS in
// PillarPage), and this refuses them independently, because a UI that hides a
// page is not a permission.

interface GetResponse {
  meetings: ReturnType<typeof shapeMeeting>[];
  // Whether the agency account is connected at all. False makes every count on
  // the page a statement about our own database rather than about the business.
  configured: boolean;
  sync: (SyncResult & { ok: true }) | { ok: false; error: string } | null;
  // The board the outcomes route to, so the page can warn BEFORE somebody
  // presses a button that has nowhere to land.
  pipeline: { id: string; name: string; missing: string[] } | null;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const admin = ctx.data.admin!;
  if (admin.role !== "owner") {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const url = new URL(ctx.request.url);
  // ?sync=0 reads what is already stored. Used by the page's own refresh after
  // recording an outcome, where re-reading two calendars to redraw one row is
  // a round trip nobody asked for.
  const wantSync = url.searchParams.get("sync") !== "0";

  let gctx = null;
  try {
    gctx = getAgencyGhlContext(ctx.env);
  } catch (err) {
    if (!(err instanceof AgencyGhlError)) throw err;
  }

  let sync: GetResponse["sync"] = null;
  let pipeline: GetResponse["pipeline"] = null;

  if (gctx) {
    // Both of these are best effort. A CRM that cannot be reached must still
    // leave a readable page: the meetings already recorded are real, and
    // blanking them because a calendar timed out would be the wrong answer.
    if (wantSync) {
      try {
        const result = await syncAgencyMeetings(gctx, client, {
          calendarIds: ctx.env.AGENCY_SALES_CALENDAR_IDS ?? null,
        });
        sync = { ok: true, ...result };
      } catch (err) {
        console.error("[sales/calls] sync failed", err);
        sync = { ok: false, error: readable(err) };
      }
    }
    try {
      const resolved = await resolveAgencySalesPipeline(gctx);
      pipeline = resolved
        ? { id: resolved.id, name: resolved.name, missing: resolved.missing }
        : null;
    } catch (err) {
      console.error("[sales/calls] pipeline read failed", err);
    }
  }

  const { data, error } = await client
    .from("sales_calls")
    .select(MEETING_SELECT)
    .order("scheduled_at", { ascending: false, nullsFirst: false });
  if (error) {
    console.error("[sales/calls] read failed", error.message);
    return Response.json({ error: "could not read the meetings" }, { status: 500 });
  }

  const meetings = ((data ?? []) as unknown as MeetingRow[]).map(shapeMeeting);
  // Who set each appointment. Jake's view of every meeting is the one where it
  // matters most: agency-wide, the setter is the only thing on the row that
  // says whose booking it was.
  await attachBookers(client, meetings);
  const body: GetResponse = { meetings, configured: Boolean(gctx), sync, pipeline };
  return Response.json(body);
};

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const admin = ctx.data.admin!;
  if (admin.role !== "owner") {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const body = await readJsonBody<RecordBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const result = await recordSalesCallOutcome(ctx.env, client, admin, body);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json({ meeting: result.meeting });
};

function readable(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.split("\n")[0].slice(0, 200) || "GoHighLevel could not be reached.";
}
