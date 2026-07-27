import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { agencyTimezone } from "../../../lib/agencyGhl";
import { pushColdCallOutcome, type LeadForPush } from "../../../lib/agencyCrm";
import { dateStringInZone } from "../../../lib/tz";
import {
  DIAL_OUTCOMES,
  NOT_INTERESTED_REASONS,
  isDialOutcome,
  isNotInterestedReason,
} from "../../../lib/coldCallDials";

// POST /api/admin/cold-call/dials (admin session gated in _middleware.ts).
// Appends one row to cold_call_dials for an attempt just made on the Leads or
// Callbacks page. This is the single write path for the agency's dialing
// numbers: the Cold Call tracker's counts are derived from these rows
// (functions/lib/coldCallDials.ts), never stored twice.
//
// Three things are decided HERE rather than taken from the body, because each
// is a number someone could otherwise inflate:
//   - the caller (always the signed-in session; there is deliberately no way to
//     log a dial in somebody else's name, not even for an owner),
//   - the day (the agency's calendar day, not the browser's, not UTC's),
//   - spoke/pitched (fixed per outcome, so a "no answer" can never arrive
//     claiming a pickup).
//
// No audit-log entry: a dial IS its own record, and one row per call would
// double the audit table's volume for no added accountability.

interface Body {
  leadId?: string | null;
  outcome?: string;
  // Why they said no. Only sent with a no, and it DECIDES the outcome: the
  // client never gets to say whether a call reached the pitch.
  reason?: string | null;
  note?: string | null;
  // The agreed callback date, "YYYY-MM-DD". Only sent with a callback, and what
  // turns it into a task on the contact in GHL.
  followUpDate?: string | null;
  // Which dialing variation was on screen (0058). Checked against the table
  // below rather than trusted: this is the column the script test is read from,
  // so a browser must not be able to attribute a booking to whichever script it
  // fancies.
  scriptId?: string | null;
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<Body>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const reason = body.reason ?? null;
  if (reason !== null && !isNotInterestedReason(reason)) {
    return Response.json({ error: "bad_reason" }, { status: 400 });
  }
  // A reason outranks whatever outcome was sent with it, so the pair can never
  // disagree in the table.
  const outcome = reason ? NOT_INTERESTED_REASONS[reason].outcome : body.outcome;
  if (!isDialOutcome(outcome)) {
    return Response.json({ error: "bad_outcome" }, { status: 400 });
  }

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const callerId = ctx.data.admin!.id;
  const { spoke, pitched } = DIAL_OUTCOMES[outcome];
  const day = dateStringInZone(agencyTimezone(ctx.env), Date.now());
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

  // Which script this was dialed from. Verified to name a live variation, and
  // dropped to null if it does not: a dial that quietly credits a deleted or
  // invented script is worse than one that admits it does not know.
  const scriptId = await resolveScriptId(client, body.scriptId ?? null);

  const { data, error } = await client
    .from("cold_call_dials")
    .insert({
      lead_id: body.leadId ?? null,
      caller_id: callerId,
      day,
      spoke,
      pitched,
      outcome,
      reason,
      note,
      script_id: scriptId,
    })
    .select("id, day, outcome, reason, spoke, pitched")
    .single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "could not log dial" }, { status: 500 });
  }

  // Then GHL. In this order on purpose: the dial is the agency's own record and
  // must survive whatever the CRM does, so it is committed before anything
  // leaves the building. A push that fails is written onto the lead and shown in
  // the console; it never turns into an error the caller has to read mid-call.
  const ghl = body.leadId
    ? await pushLead(ctx.env, client, body.leadId, outcome, body.followUpDate ?? null)
    : null;

  return Response.json({ dial: data, ghl }, { status: 201 });
};

// Confirm the id names a real, live dialing script, or return null.
//
// Refusing the whole dial over a bad script id would be the wrong trade: the
// call happened, and losing the record of it to protect an attribution is a
// worse outcome than an unattributed dial. So a bad id is dropped, not fatal.
async function resolveScriptId(
  client: NonNullable<ReturnType<typeof getServiceClient>>,
  scriptId: string | null,
): Promise<string | null> {
  if (!scriptId) return null;
  const { data } = await client
    .from("cold_call_assets")
    .select("id")
    .eq("id", scriptId)
    .eq("kind", "script")
    .is("archived_at", null)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

interface LeadPushSummary {
  ok: boolean;
  error: string | null;
}

// Look the lead up, push it, and record what happened on the row itself.
async function pushLead(
  env: Env,
  client: ReturnType<typeof getServiceClient>,
  leadId: string,
  outcome: string,
  followUpDate: string | null,
): Promise<LeadPushSummary | null> {
  if (!client) return null;

  const { data } = await client
    .from("leads")
    .select("id, first_name, last_name, phone, email, source, ghl_contact_id, business_name, website")
    .eq("id", leadId)
    .maybeSingle();
  if (!data) return null;

  const row = data as Record<string, string | null>;
  const lead: LeadForPush = {
    id: row.id as string,
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    source: row.source ?? "",
    businessName: row.business_name ?? "",
    website: row.website ?? "",
    ghlContactId: row.ghl_contact_id,
  };

  const result = await pushColdCallOutcome(env, {
    lead,
    outcome,
    attempt: outcome === "no_answer" ? await countNoAnswers(client, leadId) : 1,
    followUpDate,
  });

  // The account not being connected is not a failure to report on the lead: it
  // is a state of the whole install, and stamping every prospect with it would
  // be noise on 44 rows all saying the same thing.
  if (result.notConfigured) return null;

  await client
    .from("leads")
    .update({
      ghl_contact_id: result.contactId,
      // Only a clean push counts as synced; a half-push (contact made, tags
      // refused) leaves the old timestamp so it still reads as out of date.
      ...(result.ok ? { ghl_synced_at: new Date().toISOString() } : {}),
      ghl_error: result.error,
    })
    .eq("id", leadId);

  return { ok: result.ok, error: result.error };
}

// How many times this prospect has gone unanswered, including the dial just
// written. Counted from cold_call_dials rather than the lead's own no_answer
// column: that column is written by a separate request racing this one, and the
// tag it would pick is the difference between day 1 and day 2 follow-up.
//
// A failed count falls back to 1, which tags day 1: repeating the first day of a
// sequence is recoverable, skipping to day 2 on a first call is not.
async function countNoAnswers(
  client: NonNullable<ReturnType<typeof getServiceClient>>,
  leadId: string,
): Promise<number> {
  const { count, error } = await client
    .from("cold_call_dials")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .eq("outcome", "no_answer");
  if (error || count === null) return 1;
  return Math.max(1, count);
}
