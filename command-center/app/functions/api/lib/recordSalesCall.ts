import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../../lib/env";
import { logAdminAction } from "../../lib/adminAuth";
import { getAgencyGhlContext, AgencyGhlError } from "../../lib/agencyGhl";
import { SALES_CALL_OUTCOMES, isSalesCallOutcome } from "../../lib/salesCalls";
import { resolveAgencySalesPipeline, routeSalesCall } from "./agencySales";

// Recording what a sales meeting became, in one place.
//
// Two surfaces record an outcome: Cold Call > Booked (a caller's own bookings)
// and Sales > Sales Calls (every meeting, Jake's page). They must not each own
// a copy of these rules. A show rate that means one thing on one page and
// something else on another is worse than no show rate.
//
// Two invariants live here and nowhere else:
//
//   1. `showed` is never sent by the browser. It is derived from the outcome,
//      exactly as spoke/pitched are on a dial. A number somebody argues a
//      commission over is decided on the server.
//   2. Recording is an UPDATE and never an insert. A meeting that is not on a
//      calendar cannot have happened, so there is no way to type one into
//      being from an outcome button.
//
// New in Stage 2: after the row is written, the card moves on the agency's own
// Sales Pipeline. That push is BEST EFFORT and deliberately after the write.
// The meeting is over by the time anybody presses a button; failing the request
// because a CRM was unreachable would throw away the answer somebody just gave.

export interface AdminRef {
  id: string;
  role: string;
}

export interface RecordBody {
  id?: string;
  outcome?: unknown;
  notAFitReason?: unknown;
  // "YYYY-MM-DD" or a full ISO timestamp. Required by a follow_up, ignored by
  // everything else.
  followUpAt?: unknown;
  cashCollected?: unknown;
}

export interface MeetingRow {
  id: string;
  ghl_appointment_id: string;
  ghl_contact_id: string | null;
  ghl_opportunity_id: string | null;
  ghl_error: string | null;
  ghl_stage: string | null;
  lead_id: string | null;
  prospect_name: string;
  business_name: string;
  phone: string;
  email: string;
  source: string;
  scheduled_at: string | null;
  appointment_status: string;
  outcome: string | null;
  not_a_fit_reason: string | null;
  follow_up_at: string | null;
  cash_collected: number | null;
  synced_at: string | null;
  updated_at: string;
  leads: { assigned_to: string | null } | null;
}

// The join is what makes scoping possible at all: sales_calls records the
// meeting, and whose prospect it is lives on the lead.
export const MEETING_SELECT =
  "id, ghl_appointment_id, ghl_contact_id, ghl_opportunity_id, ghl_error, ghl_stage," +
  " lead_id, prospect_name, business_name, phone, email, source, scheduled_at," +
  " appointment_status, outcome, not_a_fit_reason, follow_up_at, cash_collected," +
  " synced_at, updated_at, leads(assigned_to)";

export function shapeMeeting(row: MeetingRow) {
  return {
    id: row.id,
    appointmentId: row.ghl_appointment_id,
    contactId: row.ghl_contact_id,
    opportunityId: row.ghl_opportunity_id,
    // What the board says, and why it might not say it.
    crmStage: row.ghl_stage,
    crmError: row.ghl_error,
    leadId: row.lead_id,
    prospectName: row.prospect_name,
    businessName: row.business_name,
    phone: row.phone,
    email: row.email,
    source: row.source,
    scheduledAt: row.scheduled_at,
    appointmentStatus: row.appointment_status,
    outcome: row.outcome,
    notAFitReason: row.not_a_fit_reason,
    followUpAt: row.follow_up_at,
    cashCollected: row.cash_collected,
    syncedAt: row.synced_at,
    assignedTo: row.leads?.assigned_to ?? null,
    updatedAt: row.updated_at,
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// Push the card to where the outcome says it belongs. Never throws: every
// failure comes back as a sentence to store on the row and show on the page.
async function pushToPipeline(
  env: Env,
  row: MeetingRow,
  outcome: keyof typeof SALES_CALL_OUTCOMES,
  cash: number | null,
): Promise<{ opportunityId: string | null; stage: string | null; error: string | null }> {
  if (!row.ghl_contact_id) {
    // A meeting synced off a calendar can arrive without one. Not an error
    // worth alarming anybody about; there is simply nobody to hang a card on.
    return {
      opportunityId: row.ghl_opportunity_id,
      stage: row.ghl_stage,
      error: "No GoHighLevel contact on this meeting, so no card was moved.",
    };
  }

  let gctx;
  try {
    gctx = getAgencyGhlContext(env);
  } catch (err) {
    if (err instanceof AgencyGhlError) {
      // Not connected is a state of the install, not a fact about this meeting.
      // Recorded as null so the row does not carry a permanent complaint.
      return { opportunityId: row.ghl_opportunity_id, stage: row.ghl_stage, error: null };
    }
    throw err;
  }

  try {
    const pipeline = await resolveAgencySalesPipeline(gctx);
    if (!pipeline) {
      return {
        opportunityId: row.ghl_opportunity_id,
        stage: row.ghl_stage,
        error: "No Sales Pipeline found in GoHighLevel, so the card was not moved.",
      };
    }

    const name =
      [row.prospect_name, row.business_name].filter(Boolean).join(" - ") || "Sales call";
    const result = await routeSalesCall(gctx, pipeline, {
      opportunityId: row.ghl_opportunity_id,
      contactId: row.ghl_contact_id,
      name,
      outcome,
      cash,
    });

    if (!result.ok) {
      return { opportunityId: row.ghl_opportunity_id, stage: row.ghl_stage, error: result.error };
    }
    return { opportunityId: result.opportunityId, stage: result.stage, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      opportunityId: row.ghl_opportunity_id,
      stage: row.ghl_stage,
      error: message.split("\n")[0].slice(0, 200),
    };
  }
}

export type RecordResult =
  | { ok: true; meeting: ReturnType<typeof shapeMeeting> }
  | { ok: false; status: number; error: string };

export async function recordSalesCallOutcome(
  env: Env,
  client: SupabaseClient,
  admin: AdminRef,
  body: RecordBody,
): Promise<RecordResult> {
  const id = str(body.id);
  if (!id) return { ok: false, status: 400, error: "id is required" };
  if (!isSalesCallOutcome(body.outcome)) {
    return { ok: false, status: 400, error: "bad_outcome" };
  }
  const outcome = body.outcome;
  const meta = SALES_CALL_OUTCOMES[outcome];

  const followUpRaw = str(body.followUpAt);
  if (meta.needsFollowUp && !followUpRaw) {
    return { ok: false, status: 400, error: "A follow-up needs a date to come back on." };
  }
  // A bare date means the morning of that day. Anything unparseable is refused
  // rather than stored as null, which would read as "no follow-up agreed".
  const followUpAt = followUpRaw
    ? new Date(followUpRaw.length === 10 ? `${followUpRaw}T09:00:00.000Z` : followUpRaw)
    : null;
  if (followUpAt && Number.isNaN(followUpAt.getTime())) {
    return { ok: false, status: 400, error: "That follow-up date is not a date." };
  }

  let cash: number | null = null;
  if (body.cashCollected !== undefined && body.cashCollected !== null && body.cashCollected !== "") {
    const parsed = Number(body.cashCollected);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { ok: false, status: 400, error: "That is not an amount." };
    }
    cash = parsed;
  }

  // Read first, so a caller cannot record an outcome on somebody else's meeting
  // by guessing an id. Owners skip the check, not the read: the row is needed
  // either way to know which card to move.
  const { data: existing } = await client
    .from("sales_calls")
    .select(MEETING_SELECT)
    .eq("id", id)
    .maybeSingle();
  const row = existing as unknown as MeetingRow | null;
  if (!row) return { ok: false, status: 404, error: "meeting not found" };
  if (admin.role !== "owner" && row.leads?.assigned_to !== admin.id) {
    // Same answer as a missing row, so an id cannot be probed for existence.
    return { ok: false, status: 404, error: "meeting not found" };
  }

  const push = await pushToPipeline(env, row, outcome, outcome === "closed" ? cash : null);

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
      ghl_opportunity_id: push.opportunityId,
      ghl_stage: push.stage,
      // Cleared on a success, so a stale complaint never sits beside a card
      // that is now correct.
      ghl_error: push.error,
      logged_by: admin.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(MEETING_SELECT)
    .maybeSingle();
  if (error || !data) {
    console.error("[recordSalesCall] update failed", error?.message);
    return { ok: false, status: 500, error: "could not record that outcome" };
  }

  await logAdminAction(client, admin.id, "salescall.outcome", null, {
    meetingId: id,
    outcome,
    cash,
    routedTo: push.stage,
    routeError: push.error,
  });

  return { ok: true, meeting: shapeMeeting(data as unknown as MeetingRow) };
}
