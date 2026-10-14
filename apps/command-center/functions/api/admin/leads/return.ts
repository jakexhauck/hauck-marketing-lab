import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { getAgencyGhlContext, isAgencyGhlConfigured } from "../../../lib/agencyGhl";
import { ghlJson } from "../../../lib/ghl";
import { POWER_DIALER_TAG, powerDialerWorkflowName } from "../../../lib/coldCallTags";
import { pickBridgeWorkflow, type GhlWorkflowSummary } from "../../../lib/coldCallBridge";
import {
  MAX_PER_RETURN,
  planReturn,
  returnedLeadPatch,
  type BookEntry,
  type ReturnCandidate,
  type ReturnRejection,
} from "../../../lib/leadReturn";

// POST /api/admin/leads/return -> take companies off the power dialer and put
// them back on the Leads page.
//
// The exact reverse of send.ts, and it runs in the reverse order for the same
// reason that one runs in the order it does:
//
//   1. the contact comes out of the `1. | Power Dialer` workflow, which is what
//      empties its manual action out of the queue
//   2. the `Power Dialer` tag comes off, so the workflow cannot re-enrol it
//   3. only THEN is the book row soft-deleted and the scraper row reset
//
// GoHighLevel first, us last. A company marked "back on the Leads page" whose
// removal over there failed is the worst of both: it is offered to be sent again
// while still sitting in the queue to be dialled. A company removed over there
// but not reset here is merely untidy, and pressing the button again fixes it.
//
// Untagging alone is NOT enough and this is the whole trap. The tag is the
// TRIGGER: a manual action the workflow has already created outlives the tag
// that caused it. Removing the contact from the workflow is what takes them out
// of manual actions.
//
// THE BUDGET IS FIFTY OUTBOUND CALLS, the same ceiling that governs send.ts:
//
//   3 fixed reads   the ticked rows, their book rows, the dials against those
//   1 fixed read    the workflow list, to find the dialer workflow by name
//   2 per company   the workflow removal, and the tag removal
//   2 batch writes  the book soft-delete, and the reset
//   1 tail          the admin log
//
// Fifteen companies is about thirty-six. Anything added to the per-company loop
// multiplies by the batch size, so add it to a fixed read or a batch write.

interface PostBody {
  ids?: unknown;
}

export interface ReturnResult {
  returned: number;
  // Companies taken out of the workflow but whose local reset failed. Reported
  // rather than swallowed: they are off the dialer and still look sent, which is
  // a state somebody needs to know about even though pressing again fixes it.
  resetFailed: boolean;
  rejected: ReturnRejection[];
  notConfigured: boolean;
}

async function readDialedBookIds(
  client: NonNullable<ReturnType<typeof getServiceClient>>,
  bookIds: string[],
): Promise<Set<string> | null> {
  if (bookIds.length === 0) return new Set();
  // supabase-js RESOLVES a failed read with { data: null, error }, so `data`
  // alone cannot tell "nobody has been called" from "the question could not be
  // asked". Guessing here would return a company that HAS been dialled, so a
  // read that could not run refuses the whole batch instead.
  const { data, error } = await client
    .from("cold_call_dials")
    .select("lead_id")
    .in("lead_id", bookIds);
  if (error) {
    console.error("[leads/return] dial read failed", error.message);
    return null;
  }
  const dialed = new Set<string>();
  for (const row of (data ?? []) as { lead_id: string | null }[]) {
    if (row.lead_id) dialed.add(row.lead_id);
  }
  return dialed;
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<PostBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.map((v) => String(v ?? "").trim()).filter(Boolean))]
    : [];
  if (ids.length === 0) {
    return Response.json({ error: "Tick at least one company." }, { status: 400 });
  }
  if (ids.length > MAX_PER_RETURN) {
    return Response.json(
      { error: `That is more than ${MAX_PER_RETURN} at once. Return them in smaller batches.` },
      { status: 400 },
    );
  }

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  if (!isAgencyGhlConfigured(ctx.env)) {
    // Nothing local is touched. Resetting the rows while the contacts stay
    // enrolled would leave every one of them queued to be dialled and back on
    // the Leads page at the same time.
    return Response.json({
      returned: 0,
      resetFailed: false,
      rejected: [],
      notConfigured: true,
    } satisfies ReturnResult);
  }

  const { data, error } = await client
    .from("cold_sms_outreach_numbers")
    .select("id, business_name, phone_e164, send_status, sent_to")
    .in("id", ids);
  if (error) {
    console.error("[leads/return] read failed", error.message);
    return Response.json({ error: "could not read those leads" }, { status: 500 });
  }

  const leads: ReturnCandidate[] = ((data ?? []) as {
    id: string;
    business_name: string | null;
    phone_e164: string;
    send_status: string;
    sent_to: string | null;
  }[]).map((r) => ({
    id: r.id,
    phoneE164: r.phone_e164,
    businessName: r.business_name,
    sendStatus: r.send_status,
    sentTo: r.sent_to,
  }));

  const phones = [...new Set(leads.map((l) => l.phoneE164).filter(Boolean))];
  const { data: bookRows, error: bookError } = await client
    .from("leads")
    .select("id, phone, ghl_contact_id")
    .is("deleted_at", null)
    .in("phone", phones.length > 0 ? phones : ["-"]);
  if (bookError) {
    console.error("[leads/return] book read failed", bookError.message);
    return Response.json({ error: "could not read the call list" }, { status: 500 });
  }

  const book = (bookRows ?? []) as { id: string; phone: string | null; ghl_contact_id: string | null }[];
  const dialed = await readDialedBookIds(client, book.map((b) => b.id));
  if (!dialed) {
    return Response.json(
      { error: "could not check which of these have been called" },
      { status: 503 },
    );
  }

  const bookByPhone = new Map<string, BookEntry>();
  for (const row of book) {
    const phone = (row.phone ?? "").trim();
    if (!phone) continue;
    bookByPhone.set(phone, {
      id: row.id,
      phone,
      ghlContactId: (row.ghl_contact_id ?? "").trim() || null,
      dialed: dialed.has(row.id),
    });
  }

  const plan = planReturn(leads, bookByPhone);
  const rejected = [...plan.rejected];

  if (plan.items.length === 0) {
    return Response.json({
      returned: 0,
      resetFailed: false,
      rejected,
      notConfigured: false,
    } satisfies ReturnResult);
  }

  // The workflow is found by NAME rather than carried as an id, the same way the
  // dial bridge finds its own: an id in the source is an id nobody can see is
  // wrong until a button stops working.
  const agency = getAgencyGhlContext(ctx.env);
  const workflowName = powerDialerWorkflowName(ctx.env);
  let workflows: GhlWorkflowSummary[];
  try {
    const res = await ghlJson<{ workflows?: GhlWorkflowSummary[] }>(
      agency,
      `/workflows/?locationId=${encodeURIComponent(agency.locationId)}`,
    );
    workflows = res.workflows ?? [];
  } catch (err) {
    console.error("[leads/return] workflow list failed", err);
    return Response.json(
      { error: "Could not reach GoHighLevel, so nothing was taken off the dialer." },
      { status: 502 },
    );
  }

  const pick = pickBridgeWorkflow(workflows, workflowName);
  if (!pick.ok) {
    return Response.json(
      {
        error:
          pick.error === "workflow_draft"
            ? `The "${workflowName}" workflow is a draft, so its manual actions cannot be cleared. Publish it in GoHighLevel.`
            : `No workflow named "${workflowName}" in GoHighLevel, so there is nothing to take them out of.`,
      },
      { status: 409 },
    );
  }

  // Sequential, because GoHighLevel rate limits per location, and because a
  // per-company result is what lets the page say exactly which ones did not
  // come off.
  const cleared: typeof plan.items = [];
  for (const item of plan.items) {
    const contact = encodeURIComponent(item.ghlContactId);
    try {
      // First, and this is the one that empties the queue.
      await ghlJson(agency, `/contacts/${contact}/workflow/${encodeURIComponent(pick.id)}`, {
        method: "DELETE",
      });
      // Then the trigger, so nothing puts them straight back.
      await ghlJson(agency, `/contacts/${contact}/tags`, {
        method: "DELETE",
        body: JSON.stringify({ tags: [POWER_DIALER_TAG] }),
      });
      cleared.push(item);
    } catch (err) {
      console.error("[leads/return] ghl removal failed", item.ghlContactId, err);
      rejected.push({
        id: item.leadId,
        businessName: item.businessName,
        reason: "GoHighLevel refused to take it off the dialer",
      });
    }
  }

  if (cleared.length === 0) {
    return Response.json({
      returned: 0,
      resetFailed: false,
      rejected,
      notConfigured: false,
    } satisfies ReturnResult);
  }

  const now = new Date().toISOString();
  let resetFailed = false;

  const { error: bookDeleteError } = await client
    .from("leads")
    .update({ deleted_at: now, updated_at: now })
    .in(
      "id",
      cleared.map((c) => c.bookId),
    )
    .is("deleted_at", null);
  if (bookDeleteError) {
    console.error("[leads/return] book soft delete failed", bookDeleteError.message);
    resetFailed = true;
  }

  const { error: resetError } = await client
    .from("cold_sms_outreach_numbers")
    .update(returnedLeadPatch())
    .in(
      "id",
      cleared.map((c) => c.leadId),
    );
  if (resetError) {
    console.error("[leads/return] reset failed", resetError.message);
    resetFailed = true;
  }

  const admin = ctx.data.admin!;
  await logAdminAction(client, admin.id, "leads.return_from_dialer", null, {
    returned: cleared.length,
    rejected: rejected.length,
    resetFailed,
  });

  return Response.json({
    returned: cleared.length,
    resetFailed,
    rejected,
    notConfigured: false,
  } satisfies ReturnResult);
};
