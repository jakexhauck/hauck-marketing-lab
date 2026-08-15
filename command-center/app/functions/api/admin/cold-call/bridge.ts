import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { ghlJson } from "../../../lib/ghl";
import {
  agencyGhlUserId,
  getAgencyGhlContext,
  isAgencyGhlConfigured,
} from "../../../lib/agencyGhl";
import { readableError, toE164, upsertAgencyContact, type LeadForPush } from "../../../lib/agencyCrm";
import {
  bridgeFailureMessage,
  bridgeWorkflowName,
  pickBridgeWorkflow,
  type BridgeFailure,
  type GhlWorkflowSummary,
} from "../../../lib/coldCallBridge";

// POST /api/admin/cold-call/bridge (admin session gated in _middleware.ts).
//
// The Call button on the call card. Drops the prospect into the one workflow
// whose only action is GoHighLevel's Call action, which rings the caller's own
// phone, plays the whisper, takes the keypress and then bridges the prospect from
// the agency number.
//
// Why a workflow and not a call API: GoHighLevel has no endpoint that places a
// call, and its softphone cannot be embedded (x-frame-options SAMEORIGIN). The
// Call action is the only path to LC Phone that a third party can reach, and the
// only way into it is enrolling a contact. See functions/lib/coldCallBridge.ts.
//
// This route writes nothing to our database. The dial row is still written by the
// outcome button, as it always has been: a call placed is not a call made, and
// counting the button that starts a call would inflate every number on the
// tracker by the ones that never connected.

interface Body {
  leadId?: string;
}

interface WorkflowsResponse {
  workflows?: GhlWorkflowSummary[];
}

// The failure shape, identical whichever step fell over, so the card has one
// thing to render. 200 rather than an error status: none of these is a broken
// request, they are all states of the agency's GHL account that the caller is
// being told about mid-shift.
function failed(error: BridgeFailure, workflow: string, detail: string | null = null) {
  return Response.json(
    { ok: false, error, message: bridgeFailureMessage(error, workflow), detail },
    { status: 200 },
  );
}

// Both reasons on one line when there are two, because the earlier one is
// often the cause of the later one.
function detailWith(upsertError: string | null, error: string): string {
  return upsertError ? `${error} (the contact also failed to sync: ${upsertError})` : error;
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<Body>(ctx.request);
  const leadId = (body?.leadId ?? "").trim();
  if (!leadId) return Response.json({ error: "bad_request" }, { status: 400 });

  const workflowName = bridgeWorkflowName(ctx.env);
  if (!isAgencyGhlConfigured(ctx.env)) return failed("not_configured", workflowName);

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data } = await client
    .from("leads")
    .select("id, first_name, last_name, phone, email, source, ghl_contact_id, business_name, website")
    .eq("id", leadId)
    .maybeSingle();
  if (!data) return Response.json({ error: "not_found" }, { status: 404 });

  const row = data as Record<string, string | null>;
  if (!toE164(row.phone ?? "")) return failed("no_phone", workflowName);

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

  // The contact has to exist before it can be enrolled. Upserted rather than
  // required: the first call to a freshly imported prospect is exactly the case
  // where the contact may not be over there yet, and refusing to dial because of
  // a sync that has not run would be the app getting in the way.
  const contact = await upsertAgencyContact(ctx.env, lead);
  const contactId = contact.contactId;
  if (!contactId) return failed("no_contact", workflowName, contact.error);

  // A FAILED upsert still hands back the id we already had on file, so the dial
  // can go ahead on a contact that is merely out of date rather than refusing to
  // ring over a name change. But the reason it failed has to survive: if the
  // enrolment then falls over too, that first error is usually the one that
  // explains it (a deleted contact, a token that has lost a scope), and
  // swallowing it is what left "GoHighLevel refused the call" with nothing after
  // it. Carried, not raised.
  const upsertError = contact.ok ? null : contact.error;

  // Remember it, so the next dial and the outcome push skip the upsert.
  if (contactId !== row.ghl_contact_id) {
    await client.from("leads").update({ ghl_contact_id: contactId }).eq("id", leadId);
  }

  const ghl = getAgencyGhlContext(ctx.env);

  // The Call action rings THE USER ASSIGNED TO THE CONTACT, and falls back to the
  // company phone number when nobody is assigned. That is GHL's rule and there is
  // no way to pass a recipient with the enrolment, so the assignment IS the
  // routing: set it first or the call rings the main line instead of the person
  // who pressed the button.
  const userId = agencyGhlUserId(ctx.env);
  let assignError: string | null = null;
  try {
    await ghlJson(ghl, `/contacts/${encodeURIComponent(contactId)}`, {
      method: "PUT",
      body: JSON.stringify({ assignedTo: userId }),
    });
  } catch (err) {
    // Not fatal. An unassigned contact still gets called, just from the company
    // number, and a caller who hears their phone ring does not care which of the
    // two placed it. Reported so a wrong recipient is diagnosable.
    assignError = readableError(err);
  }

  let workflows: GhlWorkflowSummary[];
  try {
    const res = await ghlJson<WorkflowsResponse>(
      ghl,
      `/workflows/?locationId=${encodeURIComponent(ghl.locationId)}`,
    );
    workflows = res.workflows ?? [];
  } catch (err) {
    return failed("enroll_failed", workflowName, detailWith(upsertError, readableError(err)));
  }

  const pick = pickBridgeWorkflow(workflows, workflowName);
  if (!pick.ok) return failed(pick.error, workflowName);

  try {
    await ghlJson(
      ghl,
      `/contacts/${encodeURIComponent(contactId)}/workflow/${encodeURIComponent(pick.id)}`,
      { method: "POST", body: JSON.stringify({ eventStartTime: new Date().toISOString() }) },
    );
  } catch (err) {
    return failed("enroll_failed", workflowName, detailWith(upsertError, readableError(err)));
  }

  // startedAt is handed back so the outcome press can ask GoHighLevel for calls
  // no older than this one. Without it, a prospect dialled last week would stamp
  // today's row with last week's duration.
  return Response.json({
    ok: true,
    contactId,
    workflow: workflowName,
    startedAt: new Date().toISOString(),
    assignError,
  });
};
