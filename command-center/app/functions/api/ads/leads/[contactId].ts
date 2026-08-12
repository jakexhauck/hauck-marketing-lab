import type { Env, ApiData } from "../../../lib/env";
import { tenantTimezone } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient, resolveTenantId } from "../../../lib/supabase";
import { dateStringInZone } from "../../../lib/tz";
import { isManualLeadStatus } from "../../../lib/leadStatus";
import {
  parseJobValue,
  saveManualStatus,
  saveTrackerJobValue,
} from "../../../lib/manualStatusStore";

// PATCH /api/ads/leads/:contactId
//
// The owner marking their own lead on the Paid Ads tracker: the status, and the
// value of the job if it closed. One request, because it is one edit of one row
// and two half-saved cells is the worst outcome available.
//
// Only on a tenant with manual_lead_status (0102). Everywhere else the status
// is derived from the live GHL stage and there is nothing here to write; a
// request against such a tenant is refused rather than quietly stored, because
// a stored value nothing reads is how a client comes to believe they have been
// updating a system that never saw them.
//
// Keyed on the GHL CONTACT id, not an opportunity id: a contact holds cards in
// several pipelines at once and the owner is marking the person, not the card.
//
// See docs/build-plans/willis-manual-lead-status.md.

interface PatchBody {
  status?: unknown;
  // Dollars as typed, string or number. null or "" clears the value, which is
  // not the same as zero. See parseJobValue.
  jobValue?: unknown;
}

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const contactId = String(ctx.params.contactId ?? "").trim();
  if (!contactId) return Response.json({ error: "contact_required" }, { status: 400 });

  if (!ctx.data.tenant.manual_lead_status) {
    return Response.json({ error: "status_is_automatic" }, { status: 409 });
  }

  const body = await readJsonBody<PatchBody>(ctx.request);
  if (!body) return Response.json({ error: "bad_body" }, { status: 400 });

  const wantsStatus = body.status !== undefined;
  const wantsValue = Object.prototype.hasOwnProperty.call(body, "jobValue");
  if (!wantsStatus && !wantsValue) {
    return Response.json({ error: "nothing_to_change" }, { status: 400 });
  }

  if (wantsStatus && !isManualLeadStatus(body.status)) {
    return Response.json({ error: "unknown_status" }, { status: 400 });
  }

  const parsed = wantsValue ? parseJobValue(body.jobValue) : null;
  if (parsed && "error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const client = getServiceClient(ctx.env);
  const tenantId = client ? await resolveTenantId(client, ctx.data.tenant.slug) : null;
  if (!client || !tenantId) {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }

  // Who typed it. The staff row when there is one, otherwise the shared owner
  // login, which is most of them.
  const setBy = ctx.data.staff?.id ?? (ctx.data.isOwner ? "owner" : null);

  if (wantsStatus) {
    const { error } = await saveManualStatus(
      client,
      tenantId,
      contactId,
      body.status as Parameters<typeof saveManualStatus>[3],
      setBy,
    );
    if (error) return Response.json({ error: "save_failed", detail: error }, { status: 500 });
  }

  if (parsed && "cents" in parsed) {
    // Dated today in the client's own timezone, not UTC: a job closed at 8pm in
    // Detroit is today's revenue, and a UTC date would file it as tomorrow's
    // and move it out of the range the dashboard is showing.
    const today = dateStringInZone(tenantTimezone(ctx.env), Date.now());
    const { error } = await saveTrackerJobValue(
      client,
      tenantId,
      contactId,
      parsed.cents,
      today,
      setBy,
    );
    if (error) return Response.json({ error: "save_failed", detail: error }, { status: 500 });
  }

  return Response.json({
    contactId,
    status: wantsStatus ? body.status : undefined,
    jobValueCents: parsed && "cents" in parsed ? parsed.cents : undefined,
  });
};
