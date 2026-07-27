import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { SALES_CALL_OUTCOMES, isSalesCallOutcome } from "../../../lib/salesCalls";

// GET   /api/admin/cold-call/meetings            -> booked meetings and what became of them
// PATCH /api/admin/cold-call/meetings            -> record one meeting's outcome
//
// The step after Booked. Every row here was created by cold-call/book.ts at the
// moment a call turned into a meeting; this endpoint is only ever about saying
// what happened at one.
//
// Two rules, and both are about not letting the numbers lie:
//
//   1. `showed` is never sent by the browser. It is derived from the outcome
//      here, exactly as spoke/pitched are derived on a dial. A show rate is a
//      number somebody could otherwise inflate, and the one place it is decided
//      is the server.
//   2. Recording an outcome is an UPDATE of an existing meeting and never an
//      insert. A meeting that is not on the calendar cannot have happened, so
//      there is deliberately no way to type one into being from this screen.
//
// Scoping: a caller sees the meetings of the prospects on their own queue, which
// is the same rule every other Cold Call page follows. An owner sees everyone's,
// or one person's with ?callerId=.

interface MeetingRow {
  id: string;
  ghl_appointment_id: string;
  lead_id: string | null;
  prospect_name: string;
  business_name: string;
  phone: string;
  email: string;
  scheduled_at: string | null;
  appointment_status: string;
  outcome: string | null;
  not_a_fit_reason: string | null;
  follow_up_at: string | null;
  cash_collected: number | null;
  updated_at: string;
  leads: { assigned_to: string | null } | null;
}

function shape(row: MeetingRow) {
  return {
    id: row.id,
    appointmentId: row.ghl_appointment_id,
    leadId: row.lead_id,
    prospectName: row.prospect_name,
    businessName: row.business_name,
    phone: row.phone,
    email: row.email,
    scheduledAt: row.scheduled_at,
    appointmentStatus: row.appointment_status,
    outcome: row.outcome,
    notAFitReason: row.not_a_fit_reason,
    followUpAt: row.follow_up_at,
    cashCollected: row.cash_collected,
    assignedTo: row.leads?.assigned_to ?? null,
    updatedAt: row.updated_at,
  };
}

// The join is what makes scoping possible at all: sales_calls records the
// meeting, and whose prospect it is lives on the lead.
const SELECT =
  "id, ghl_appointment_id, lead_id, prospect_name, business_name, phone, email," +
  " scheduled_at, appointment_status, outcome, not_a_fit_reason, follow_up_at," +
  " cash_collected, updated_at, leads(assigned_to)";

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
    .select(SELECT)
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
    .map(shape);

  return Response.json({ meetings });
};

interface PatchBody {
  id?: string;
  outcome?: unknown;
  notAFitReason?: unknown;
  // "YYYY-MM-DD" or a full ISO timestamp. Required by a follow_up and ignored
  // by everything else.
  followUpAt?: unknown;
  cashCollected?: unknown;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<PatchBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const id = str(body.id);
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  if (!isSalesCallOutcome(body.outcome)) {
    return Response.json({ error: "bad_outcome" }, { status: 400 });
  }
  const outcome = body.outcome;
  const meta = SALES_CALL_OUTCOMES[outcome];

  const followUpRaw = str(body.followUpAt);
  if (meta.needsFollowUp && !followUpRaw) {
    return Response.json({ error: "A follow-up needs a date to come back on." }, { status: 400 });
  }
  // A bare date means the start of that day. Anything unparseable is refused
  // rather than stored as null, which would read as "no follow-up agreed".
  const followUpAt = followUpRaw
    ? new Date(followUpRaw.length === 10 ? `${followUpRaw}T09:00:00.000Z` : followUpRaw)
    : null;
  if (followUpAt && Number.isNaN(followUpAt.getTime())) {
    return Response.json({ error: "That follow-up date is not a date." }, { status: 400 });
  }

  let cash: number | null = null;
  if (body.cashCollected !== undefined && body.cashCollected !== null && body.cashCollected !== "") {
    const parsed = Number(body.cashCollected);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return Response.json({ error: "That is not an amount." }, { status: 400 });
    }
    cash = parsed;
  }

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const admin = ctx.data.admin!;

  // Read first, so a caller cannot record an outcome on somebody else's meeting
  // by guessing an id. Owners skip the check, not the read.
  const { data: existing } = await client
    .from("sales_calls")
    .select("id, lead_id, leads(assigned_to)")
    .eq("id", id)
    .maybeSingle();
  const row = existing as { id: string; leads: { assigned_to: string | null } | null } | null;
  if (!row) return Response.json({ error: "meeting not found" }, { status: 404 });
  if (admin.role !== "owner" && row.leads?.assigned_to !== admin.id) {
    return Response.json({ error: "meeting not found" }, { status: 404 });
  }

  const { data, error } = await client
    .from("sales_calls")
    .update({
      outcome,
      // Only ever a fit reason on a not-a-fit, and only ever a follow-up date on
      // a follow-up: an outcome changed from one to the other must not leave the
      // previous answer's detail behind, still being read as current.
      not_a_fit_reason: outcome === "not_a_fit" ? str(body.notAFitReason) || null : null,
      follow_up_at: meta.needsFollowUp && followUpAt ? followUpAt.toISOString() : null,
      // Cash rides with a close, and nothing else. See the column comment.
      cash_collected: outcome === "closed" ? cash : null,
      qualified: meta.showed ? outcome !== "not_a_fit" : null,
      logged_by: admin.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(SELECT)
    .maybeSingle();
  if (error || !data) {
    console.error("[cold-call/meetings] update failed", error?.message);
    return Response.json({ error: "could not record that outcome" }, { status: 500 });
  }

  await logAdminAction(client, admin.id, "coldcall.meeting_outcome", null, {
    meetingId: id,
    outcome,
    cash,
  });

  return Response.json({ meeting: shape(data as unknown as MeetingRow) });
};
