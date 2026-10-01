import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../../lib/env";
import { readJsonBody } from "../../lib/body";
import { getServiceClient } from "../../lib/supabase";
import { readToken, tokenMatches } from "../../lib/webhookAuth";
import { agencyTimezone, isAgencyGhlConfigured } from "../../lib/agencyGhl";
import { dateStringInZone } from "../../lib/tz";
import { logErrorBestEffort } from "../../lib/errorLog";
import { DIAL_OUTCOMES, type DialOutcome } from "../../lib/coldCallDials";
import { DEFAULT_WINDOW_MINUTES, PENDING_OUTCOME } from "../../lib/powerDialer";
import {
  readWindowRows,
  resolveCronCaller,
  resolveLead,
  runPowerDialerSync,
} from "../../lib/powerDialerSync";
import { pushLead } from "../../lib/coldCallOutcomePush";
import {
  PENDING_LOOKBACK_MS,
  leadFieldsForOutcome,
  parseDisposition,
  pickDispositionDial,
  type CandidateDial,
} from "../../lib/coldCallDisposition";

// POST /api/crm/call-disposition?token=<WEBHOOK_SECRET>  (public, own secret)
//
// GoHighLevel's dialer says what a cold call became. One workflow per Custom
// Disposition (Call Details trigger, outbound, disposition = X) posts the
// contact and a fixed outcome key here, and the contact's pending dial is
// completed exactly as the app's button would complete it: the row, the lead's
// stage, the tags, and off the dialer's list. See lib/coldCallDisposition.ts.
//
// Same shared secret as /api/webhook. Both are GoHighLevel workflows in an
// account the agency owns, so a second secret would add a thing to rotate and no
// protection. Fail closed: no secret configured, nothing is processed.
//
// Answers 200 for anything that will never succeed (unknown disposition, wrong
// account, no contact), because GoHighLevel retries a failure and a retry of a
// bad payload is only noise. Those are written to error_log instead.

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const secret = (ctx.env.WEBHOOK_SECRET ?? "").trim();
  if (!secret) return Response.json({ error: "not configured" }, { status: 503 });
  const supplied = readToken(ctx.request);
  if (!supplied || !(await tokenMatches(supplied, secret))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody<unknown>(ctx.request);
  // The Call Details payload is undocumented, so every one is visible in the
  // Pages log until the first live call has proved its shape.
  console.log("[call-disposition] payload", JSON.stringify(body)?.slice(0, 2000));

  const parsed = parseDisposition(body);
  if (!parsed.ok) {
    logErrorBestEffort(ctx.env, "call-disposition", `ignored: ${parsed.error}`, {
      body: JSON.stringify(body)?.slice(0, 1500) ?? null,
    });
    return Response.json({ ignored: parsed.error });
  }

  const agencyLocation = (ctx.env.AGENCY_GHL_LOCATION_ID ?? "").trim();
  if (parsed.locationId && agencyLocation && parsed.locationId !== agencyLocation) {
    return Response.json({ ignored: "wrong_location" });
  }

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  if (!isAgencyGhlConfigured(ctx.env)) {
    return Response.json({ error: "agency crm not configured" }, { status: 503 });
  }

  try {
    const result = await record(ctx.env, client, parsed);
    // The CRM half runs after the answer. GoHighLevel is waiting on this
    // response and the dial is already the agency's record; tags that land a
    // second later change nothing it needs to know.
    if (result.status === "recorded" && result.leadId) {
      const leadId = result.leadId;
      ctx.waitUntil(
        pushLead(ctx.env, client, leadId, parsed.outcome, null, null).then(
          () => undefined,
          (err) => {
            logErrorBestEffort(ctx.env, "call-disposition", `crm push failed: ${String(err)}`, { leadId });
          },
        ),
      );
    }
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[call-disposition] failed", message);
    logErrorBestEffort(ctx.env, "call-disposition", `failed: ${message}`, {
      contactId: parsed.contactId,
      outcome: parsed.outcome,
    });
    // A real failure is worth GoHighLevel's retry.
    return Response.json({ error: "could not record" }, { status: 500 });
  }
};

interface Recorded {
  status: "recorded" | "already_recorded";
  dialId: string;
  leadId: string | null;
  outcome: DialOutcome;
}

async function record(
  env: Env,
  client: SupabaseClient,
  parsed: Extract<ReturnType<typeof parseDisposition>, { ok: true }>,
): Promise<Recorded> {
  const { contactId, outcome, callId } = parsed;
  const now = Date.now();

  // The contact's dials, across EVERY lead on that contact. Looking under one
  // lead missed the call on 2026-10-01: the sync filed it under one copy of the
  // company and this endpoint under another, and one call became two dials.
  let found = await candidates(client, contactId);
  let pick = pickDispositionDial(found, { callId, now });

  // The disposition can arrive before the sync has noticed the call (it runs
  // once a minute). Read the dialer's wake now rather than inventing a row the
  // sync would then have to reconcile.
  if (pick.kind === "none") {
    const caller = await resolveCronCaller(client);
    if (caller) {
      const since = now - DEFAULT_WINDOW_MINUTES * 60_000;
      const { dials, leads } = await readWindowRows(client, since);
      await runPowerDialerSync(env, client, { dials, leads, since, callerId: caller });
      found = await candidates(client, contactId);
      pick = pickDispositionDial(found, { callId, now });
    }
  }

  // The lead is the one the dial is already filed under. Only a call with no
  // row anywhere resolves (or creates) one, the same way the sync does.
  const picked = pick.kind === "none" ? null : found.find((d) => d.id === pick.dialId);
  const leadId = picked ? picked.leadId : await resolveLead(env, client, contactId, {});

  if (pick.kind === "judged") {
    return { status: "already_recorded", dialId: pick.dialId, leadId, outcome };
  }

  const callerId = await resolveCaller(client, parsed.userEmail, pick.kind === "pending" ? pick.dialId : null);
  const { spoke, pitched } = DIAL_OUTCOMES[outcome];

  let dialId: string;
  if (pick.kind === "pending") {
    // Guarded on pending, as the button is: an answer already given is never
    // overwritten, whichever side gave it first.
    const { data, error } = await client
      .from("cold_call_dials")
      .update({
        spoke,
        pitched,
        outcome,
        ...(callerId ? { caller_id: callerId } : {}),
      })
      .eq("id", pick.dialId)
      .eq("outcome", PENDING_OUTCOME)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`could not complete the dial: ${error.message}`);
    if (!data) return { status: "already_recorded", dialId: pick.dialId, leadId, outcome };
    dialId = pick.dialId;
  } else {
    // No row anywhere for this call. The call happened (GoHighLevel just told
    // us so), so it is written; the sync later stamps this row with the call
    // rather than adding a second one (matchCall in powerDialer.ts).
    if (!callerId) throw new Error("nobody to attribute the call to");
    const { data, error } = await client
      .from("cold_call_dials")
      .insert({
        lead_id: leadId,
        caller_id: callerId,
        day: dateStringInZone(agencyTimezone(env), now),
        dialed_at: new Date(now).toISOString(),
        spoke,
        pitched,
        outcome,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`could not write the dial: ${error?.message ?? "no row"}`);
    dialId = (data as { id: string }).id;
  }

  if (leadId) await moveLead(env, client, leadId, outcome, now);

  return { status: "recorded", dialId, leadId, outcome };
}

// This contact's recent dials, newest first, whichever of its leads they are
// filed under (2,000 contacts have more than one lead).
async function candidates(
  client: SupabaseClient,
  contactId: string,
): Promise<(CandidateDial & { leadId: string | null })[]> {
  const { data: leads, error: leadError } = await client
    .from("leads")
    .select("id")
    .eq("ghl_contact_id", contactId)
    .is("deleted_at", null);
  if (leadError) throw new Error(`could not read the leads: ${leadError.message}`);
  const leadIds = ((leads ?? []) as { id: string }[]).map((l) => l.id);
  if (leadIds.length === 0) return [];

  const since = new Date(Date.now() - PENDING_LOOKBACK_MS).toISOString();
  const { data, error } = await client
    .from("cold_call_dials")
    .select("id, lead_id, outcome, call_message_id, dialed_at")
    .in("lead_id", leadIds)
    .gte("dialed_at", since)
    .order("dialed_at", { ascending: false });
  if (error) throw new Error(`could not read the dials: ${error.message}`);
  return (
    (data ?? []) as {
      id: string;
      lead_id: string | null;
      outcome: string;
      call_message_id: string | null;
      dialed_at: string;
    }[]
  ).map((d) => ({
    id: d.id,
    leadId: d.lead_id,
    outcome: d.outcome,
    callMessageId: d.call_message_id,
    dialedAtMs: Date.parse(d.dialed_at),
  }));
}

// Who made the call. The GoHighLevel user's email when the workflow sends one
// and it is an admin here; otherwise whoever the pending row already names
// (the sync's best guess, left alone); otherwise the sync's own rule.
async function resolveCaller(
  client: SupabaseClient,
  email: string | null,
  pendingDialId: string | null,
): Promise<string | null> {
  if (email) {
    // ilike for case; its two wildcards escaped so an email is matched literally.
    const literal = email.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data } = await client.from("admin_accounts").select("id").ilike("email", literal).maybeSingle();
    const id = (data as { id: string } | null)?.id;
    if (id) return id;
  }
  if (pendingDialId) return null; // keep the row's caller
  return resolveCronCaller(client);
}

async function moveLead(
  env: Env,
  client: SupabaseClient,
  leadId: string,
  outcome: DialOutcome,
  now: number,
): Promise<void> {
  const { data, error } = await client
    .from("leads")
    .select("no_answer, first_contact_date")
    .eq("id", leadId)
    .maybeSingle();
  if (error || !data) return;
  const today = dateStringInZone(agencyTimezone(env), now);
  const fields = leadFieldsForOutcome(outcome, data as { no_answer: number | null; first_contact_date: string | null }, today);
  const { error: updateError } = await client
    .from("leads")
    .update({ ...fields, updated_at: new Date(now).toISOString() })
    .eq("id", leadId);
  if (updateError) {
    logErrorBestEffort(env, "call-disposition", `lead update failed: ${updateError.message}`, { leadId });
  }
}
