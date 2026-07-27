import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import {
  MEETING_SELECT,
  recordSalesCallOutcome,
  shapeMeeting,
  type MeetingRow,
  type RecordBody,
} from "../../lib/recordSalesCall";

// GET   /api/admin/cold-call/meetings            -> booked meetings and what became of them
// PATCH /api/admin/cold-call/meetings            -> record one meeting's outcome
//
// The step after Booked, from the caller's end. Every row this page shows was
// created by cold-call/book.ts at the moment a call turned into a meeting.
//
// The rules about what an outcome means, and the push that moves the card on the
// agency Sales Pipeline, live in api/lib/recordSalesCall.ts and are shared with
// Sales > Sales Calls. Two pages recording the same fact must not each own a
// copy of the arithmetic: a show rate that means one thing here and something
// else there is worse than no show rate at all.
//
// The one thing this endpoint owns is SCOPE. A caller sees the meetings of the
// prospects on their own queue, which is the rule every other Cold Call page
// follows. An owner sees everyone's, or one person's with ?callerId=. Sales >
// Sales Calls is the unscoped view of the same table, and is owner-only.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const admin = ctx.data.admin!;
  const url = new URL(ctx.request.url);
  // A caller is pinned to themselves regardless of what the browser asks for.
  const scope =
    admin.role === "owner" ? (url.searchParams.get("callerId") ?? "").trim() : admin.id;

  const { data, error } = await client
    .from("sales_calls")
    .select(MEETING_SELECT)
    .order("scheduled_at", { ascending: false, nullsFirst: false });
  if (error) {
    console.error("[cold-call/meetings] read failed", error.message);
    return Response.json({ error: "could not read the meetings" }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as MeetingRow[];
  // Filtered here rather than in the query: the assignee lives on the joined
  // row, and PostgREST cannot filter the parent by an embedded column without
  // turning the join into an inner one, which would silently drop every meeting
  // whose lead has since been purged.
  const meetings = rows
    .filter((r) => (scope ? r.leads?.assigned_to === scope : true))
    .map(shapeMeeting);

  return Response.json({ meetings });
};

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<RecordBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const result = await recordSalesCallOutcome(ctx.env, client, ctx.data.admin!, body);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json({ meeting: result.meeting });
};
