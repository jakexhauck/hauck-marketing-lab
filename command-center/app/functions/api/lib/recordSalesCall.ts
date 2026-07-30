import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../../lib/env";
import { logAdminAction } from "../../lib/adminAuth";
import { getAgencyGhlContext, AgencyGhlError } from "../../lib/agencyGhl";
import {
  SALES_CALL_OUTCOMES,
  isSalesCallOutcome,
  isSalesNoReason,
  parseDeal,
  type SalesDeal,
} from "../../lib/salesCalls";
import { createFollowUpTask, pushSalesCallTag } from "./salesCallPush";

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
// After the row is written, the contact is TAGGED in the agency's own
// GoHighLevel, and Jake's workflow moves the card from there. That push is BEST
// EFFORT and deliberately after the write: the meeting is over by the time
// anybody presses a button, and failing the request because a CRM was
// unreachable would throw away the answer somebody just gave.

export interface AdminRef {
  id: string;
  role: string;
}

export interface RecordBody {
  id?: string;
  outcome?: unknown;
  // Why they said no. A key from SALES_NO_REASONS, required by BOTH kinds of no
  // (0068): the reason counts on Sales Data are only worth reading if every no
  // carries one.
  reason?: unknown;
  // The old name for the same field, from before the reason applied to both nos.
  // Still accepted so a browser holding the previous bundle keeps working.
  notAFitReason?: unknown;
  // "YYYY-MM-DD" or a full ISO timestamp. Required by a follow_up, ignored by
  // everything else.
  followUpAt?: unknown;
  cashCollected?: unknown;
  // What was sold, on a close: dollars a month and how many months were agreed.
  // The term is optional (month-to-month is a real deal); without a monthly
  // figure no deal is stored at all.
  monthly?: unknown;
  months?: unknown;
  // Whatever was said on the call, in words. Optional on every outcome.
  notes?: unknown;
}

export interface MeetingRow {
  id: string;
  ghl_appointment_id: string;
  ghl_contact_id: string | null;
  ghl_opportunity_id: string | null;
  ghl_error: string | null;
  ghl_stage: string | null;
  // The sc tag last applied for this meeting (0065). What the app actually
  // wrote, now that it writes no stage.
  ghl_tag: string | null;
  lead_id: string | null;
  prospect_name: string;
  business_name: string;
  phone: string;
  email: string;
  source: string;
  scheduled_at: string | null;
  appointment_status: string;
  // Which calendar this meeting was booked under (0066). Null on rows written
  // before it; the next sync fills them.
  calendar_id: string | null;
  calendar_name: string | null;
  outcome: string | null;
  not_a_fit_reason: string | null;
  follow_up_at: string | null;
  cash_collected: number | null;
  // What was sold (0057's jsonb column, first written in 0068's release). Shape
  // is not trusted: parseDeal decides what counts as a deal.
  deal: unknown;
  // Notes taken on the call. The column has existed since 0057 and held '' on
  // every row until the record panel started writing it.
  scratchpad: string | null;
  synced_at: string | null;
  updated_at: string;
  leads: { assigned_to: string | null } | null;
  // Who set the appointment. Written once at booking (0057's column) and never
  // overwritten since. Null on a meeting the sync adopted off the calendar:
  // nobody set that one from inside this app.
  logged_by: string | null;
}

// The join is what makes scoping possible at all: sales_calls records the
// meeting, and whose prospect it is lives on the lead.
//
// logged_by rides along as the booker's id. It is only an id here: the column
// carries no foreign key, so PostgREST cannot embed the name and attachBookers
// below resolves it in one extra query rather than per row.
export const MEETING_SELECT =
  "id, ghl_appointment_id, ghl_contact_id, ghl_opportunity_id, ghl_error, ghl_stage," +
  " ghl_tag," +
  " lead_id, prospect_name, business_name, phone, email, source, scheduled_at," +
  " appointment_status, calendar_id, calendar_name," +
  " outcome, not_a_fit_reason, follow_up_at, cash_collected, deal, scratchpad," +
  " synced_at, updated_at, logged_by, leads(assigned_to)";

export function shapeMeeting(row: MeetingRow) {
  return {
    id: row.id,
    appointmentId: row.ghl_appointment_id,
    contactId: row.ghl_contact_id,
    opportunityId: row.ghl_opportunity_id,
    // What was written to the CRM, and why it might not have been. crmStage is
    // historic: nothing has asserted a stage since 0065, so a row recorded
    // since then carries a tag instead.
    crmStage: row.ghl_stage,
    crmTag: row.ghl_tag,
    crmError: row.ghl_error,
    leadId: row.lead_id,
    prospectName: row.prospect_name,
    businessName: row.business_name,
    phone: row.phone,
    email: row.email,
    source: row.source,
    scheduledAt: row.scheduled_at,
    appointmentStatus: row.appointment_status,
    calendarId: row.calendar_id,
    calendarName: row.calendar_name,
    outcome: row.outcome,
    // One column, two questions it can answer: why a not_qualified meeting was
    // never a prospect, and why a not_interested one said no. `reason` is the
    // name the page reads; notAFitReason is kept beside it so nothing that still
    // asks for the old name breaks.
    reason: row.not_a_fit_reason,
    notAFitReason: row.not_a_fit_reason,
    followUpAt: row.follow_up_at,
    cashCollected: row.cash_collected,
    // Parsed here, once, at the boundary: every page downstream gets a deal or
    // null and never has to wonder what shape the jsonb was.
    deal: parseDeal(row.deal),
    notes: row.scratchpad ?? "",
    syncedAt: row.synced_at,
    assignedTo: row.leads?.assigned_to ?? null,
    // Who set the appointment. The id is what the row stores; the name is filled
    // in by attachBookers, which is the only thing that can resolve it. Null
    // here rather than absent, so a caller that forgets to attach shows a row
    // with no setter instead of one claiming the wrong shape.
    bookedById: row.logged_by ?? null,
    bookedBy: null as string | null,
    updatedAt: row.updated_at,
  };
}

// Put a NAME on every meeting that has a booker id.
//
// One query for the whole page rather than a join, because logged_by carries no
// foreign key and PostgREST will not embed across one. Cheap: the ids are
// deduped first, and there are a handful of admins, not a handful per meeting.
//
// Best effort on purpose. A lookup that fails leaves the setter blank, which
// costs a line on the row; throwing here would cost the whole page, and the
// meetings are the thing anybody came for.
export async function attachBookers<T extends { bookedById: string | null; bookedBy: string | null }>(
  client: SupabaseClient,
  meetings: T[],
): Promise<T[]> {
  const ids = [...new Set(meetings.map((m) => m.bookedById).filter(Boolean))] as string[];
  if (ids.length === 0) return meetings;

  const { data, error } = await client.from("admin_accounts").select("id, name").in("id", ids);
  if (error) {
    console.error("[recordSalesCall] booker lookup failed", error.message);
    return meetings;
  }

  const names = new Map((data ?? []).map((a: { id: string; name: string }) => [a.id, a.name]));
  for (const m of meetings) {
    m.bookedBy = (m.bookedById && names.get(m.bookedById)) || null;
  }
  return meetings;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// Tell GoHighLevel what happened: ONE tag on the contact, and the cash figure
// on the card when a deal closed. Never throws: every failure comes back as a
// sentence to store on the row and show on the page.
//
// This used to move the card itself. It does not any more
// (docs/build-plans/sales-call-tags.md): Jake's workflow reads the tag and
// moves the opportunity, which is the same arrangement the Setter Suite and
// Cold Call already run on.
async function pushOutcome(
  env: Env,
  row: MeetingRow,
  outcome: keyof typeof SALES_CALL_OUTCOMES,
  cash: number | null,
  // The agreed return date as an ISO string, on a follow-up only.
  followUpAt: string | null,
): Promise<{ tag: string | null; opportunityId: string | null; error: string | null }> {
  let gctx;
  try {
    gctx = getAgencyGhlContext(env);
  } catch (err) {
    if (err instanceof AgencyGhlError) {
      // Not connected is a state of the install, not a fact about this meeting.
      // Recorded as null so the row does not carry a permanent complaint.
      return { tag: null, opportunityId: row.ghl_opportunity_id, error: null };
    }
    throw err;
  }

  const result = await pushSalesCallTag(gctx, {
    contactId: row.ghl_contact_id,
    event: outcome,
    cash,
    opportunityId: row.ghl_opportunity_id,
  });

  // A promised return date becomes a real task on the contact, so it reaches
  // whoever has to make the call rather than living only in this console.
  let taskError: string | null = null;
  if (outcome === "follow_up" && followUpAt && row.ghl_contact_id) {
    taskError = await createFollowUpTask(env, gctx, {
      contactId: row.ghl_contact_id,
      name: [row.prospect_name, row.business_name].filter(Boolean).join(" - "),
      phone: row.phone,
      followUpAt,
    });
  }
  return {
    tag: result.tag,
    // Keep the card we already knew about when the push found none: forgetting
    // an id because one lookup came back empty would orphan the row.
    opportunityId: result.opportunityId ?? row.ghl_opportunity_id,
    // The tag failing matters more than the task failing, so it is reported
    // first; both are shown rather than one silently winning.
    error: result.error ?? taskError,
  };
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

  // WHY THEY SAID NO, on either kind of no.
  //
  // Required, and validated against the list rather than stored as whatever
  // arrived: the counts on Sales Data are the reason the field exists, and a
  // month of free text or half-empty rows answers nothing. `notAFitReason` is
  // read as a fallback so a browser on the previous bundle still records.
  const reasonRaw = body.reason !== undefined ? body.reason : body.notAFitReason;
  const isNo = outcome === "not_interested" || outcome === "not_qualified";
  let reason: string | null = null;
  if (isNo) {
    if (!isSalesNoReason(reasonRaw)) {
      return { ok: false, status: 400, error: "Pick why they said no." };
    }
    reason = reasonRaw;
  }

  // WHAT WAS SOLD, on a close. Optional in the same way cash is: a close
  // recorded in a hurry is still a close, and refusing it would cost the outcome
  // to save the figure. No monthly means no deal stored, rather than a $0 one.
  let deal: SalesDeal | null = null;
  if (outcome === "closed") {
    const monthlyGiven =
      body.monthly !== undefined && body.monthly !== null && body.monthly !== "";
    if (monthlyGiven) {
      const monthly = Number(body.monthly);
      if (!Number.isFinite(monthly) || monthly < 0) {
        return { ok: false, status: 400, error: "That is not a monthly amount." };
      }
      const monthsGiven = body.months !== undefined && body.months !== null && body.months !== "";
      const months = monthsGiven ? Number(body.months) : null;
      if (months !== null && (!Number.isInteger(months) || months < 0)) {
        return { ok: false, status: 400, error: "That is not a number of months." };
      }
      // parseDeal has the final say on what a deal is, so the rule lives in one
      // place: a zero monthly comes back null here exactly as it would when read.
      deal = parseDeal({ monthly, months });
    }
  }

  // Whatever was said, on any outcome. Capped rather than refused: a long note
  // is somebody doing the right thing, and losing the outcome over it would be
  // the wrong trade.
  const notes = str(body.notes).slice(0, 4000);

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

  const followUpIso = meta.needsFollowUp && followUpAt ? followUpAt.toISOString() : null;
  const push = await pushOutcome(
    env,
    row,
    outcome,
    outcome === "closed" ? cash : null,
    followUpIso,
  );

  const { data, error } = await client
    .from("sales_calls")
    .update({
      outcome,
      // Only ever a reason on a no, and only ever a follow-up date on a
      // follow-up: an outcome changed from one to the other must not leave the
      // previous answer's detail behind, still being read as current.
      not_a_fit_reason: reason,
      follow_up_at: followUpIso,
      // Cash rides with a close, and nothing else. See the column comment.
      cash_collected: outcome === "closed" ? cash : null,
      // The retainer, on the same terms as the cash: cleared the moment the
      // outcome is something other than a close, so a corrected answer cannot
      // leave revenue behind on a deal that did not happen.
      deal: outcome === "closed" ? deal : null,
      // Notes belong to the meeting, not to the outcome, so they are NOT cleared
      // when an answer changes. Re-recording an outcome without retyping the
      // notes keeps what was written; sending new notes replaces them.
      ...(notes ? { scratchpad: notes } : {}),
      // Turned up AND was a real prospect. not_interested still counts as
      // qualified: they heard the pitch and said no, which is a fact about the
      // pitch. Only not_qualified says they were never a prospect.
      qualified: meta.showed ? outcome !== "not_qualified" : null,
      ghl_opportunity_id: push.opportunityId,
      // What was actually written to the CRM. The app asserts no stage now, so
      // ghl_stage is left as whatever the old routing put there rather than
      // being overwritten with a guess.
      ghl_tag: push.tag,
      // Cleared on a success, so a stale complaint never sits beside a card
      // that is now correct.
      ghl_error: push.error,
      // logged_by is deliberately NOT touched. It is written once, by
      // cold-call/book.ts, and it means WHO SET THE APPOINTMENT: the Booked page
      // names that person on the row. This used to overwrite it with whoever
      // recorded the outcome, which quietly erased the booker the moment anybody
      // answered for the meeting, and left one column trying to hold two
      // different people. Who recorded the outcome is already kept, properly, on
      // the audit line below.
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
    // The retainer is on the audit line too: it is the number a month's revenue
    // is read from, so who entered it and when is worth keeping.
    monthly: deal?.monthly ?? null,
    months: deal?.months ?? null,
    reason,
    tagged: push.tag,
    pushError: push.error,
  });

  // Attached here too, not only on the list reads: this row goes straight back
  // to the page that recorded the outcome, and a setter that vanished the moment
  // somebody answered would look exactly like the bug this replaced.
  const [meeting] = await attachBookers(client, [shapeMeeting(data as unknown as MeetingRow)]);
  return { ok: true, meeting };
}
