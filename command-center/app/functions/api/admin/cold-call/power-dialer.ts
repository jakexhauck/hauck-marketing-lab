import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { getAgencyGhlContext, isAgencyGhlConfigured } from "../../../lib/agencyGhl";
import { ghlJson } from "../../../lib/ghl";
import { readableError, upsertAgencyContact, type LeadForPush } from "../../../lib/agencyCrm";
import { POWER_DIALER_TAG } from "../../../lib/coldCallTags";

// POST /api/admin/cold-call/power-dialer  (admin session gated in _middleware.ts)
//
// Hand a selection of the book to GoHighLevel's power dialer.
//
// The dialer works a list on its side, and a list over there is a filter on a
// tag. So "send these to the dialer" is exactly one thing: make sure each of
// them is a contact in the agency account, and put `Power Dialer` on it. Jake's
// workflow watches for that tag and does the rest.
//
// The tag is not one of the exclusive stage tags (coldCallTags.ts). A prospect
// keeps whichever stage tag they already carry while they sit in the dialer's
// list, because the two answer different questions: the stage says where they
// are in the book, this says they are next on the phone.
//
// Nothing here removes the tag. What becomes of the list after the dialer has
// worked through it is decided in GoHighLevel, and a second system quietly
// taking people off a list somebody is dialling is how a dialer ends up ringing
// half of what it was given.
//
// BY HAND ONLY, like the reconcile: it writes to live contact records, so the
// moment it happens is a moment somebody chose.

// Each id is a pair of calls to somebody else's rate-limited API, so this is
// lower than a database-only bulk action. Pressing again picks up where it left
// off, because everything already done is an idempotent no-op.
const MAX_IDS = 200;

interface Body {
  ids?: unknown;
}

interface LeadRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  ghl_contact_id: string | null;
  business_name: string | null;
  website: string | null;
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const admin = ctx.data.admin!;

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  if (!isAgencyGhlConfigured(ctx.env)) {
    return Response.json({ sent: 0, failed: 0, notConfigured: true, error: null });
  }

  let body: Body;
  try {
    body = (await ctx.request.json()) as Body;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((v): v is string => typeof v === "string" && v.trim() !== ""))]
    : [];
  if (ids.length === 0) {
    return Response.json({ error: "Select at least one prospect." }, { status: 400 });
  }
  if (ids.length > MAX_IDS) {
    return Response.json({ error: `Send at most ${MAX_IDS} at a time.` }, { status: 400 });
  }

  const { data, error } = await client
    .from("leads")
    .select(
      "id, first_name, last_name, phone, email, source, ghl_contact_id, business_name, website",
    )
    .in("id", ids)
    .is("deleted_at", null);
  if (error) {
    console.error("[cold-call/power-dialer] read failed", error.message);
    return Response.json({ error: "Could not read those prospects." }, { status: 500 });
  }

  const rows = (data ?? []) as LeadRow[];
  if (rows.length === 0) {
    return Response.json({ error: "None of those are still in the book." }, { status: 404 });
  }

  const agency = getAgencyGhlContext(ctx.env);
  let sent = 0;
  let failed = 0;
  // The first thing that went wrong, shown to whoever pressed the button. One
  // reason is useful; forty copies of it are not.
  let firstError: string | null = null;

  // Sequential, like every other agency push: GoHighLevel rate limits, and a
  // burst that trips the limit fails rows that would otherwise have landed.
  for (const row of rows) {
    const lead: LeadForPush = {
      id: row.id,
      firstName: row.first_name ?? "",
      lastName: row.last_name ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      source: row.source ?? "",
      businessName: row.business_name ?? "",
      website: row.website ?? "",
      ghlContactId: row.ghl_contact_id,
    };

    // A prospect with no contact over there cannot be dialled, so the contact is
    // made rather than the row skipped. The upsert keys on phone and email, so
    // one that is already there is updated instead of doubled.
    const upserted = await upsertAgencyContact(ctx.env, lead);
    const contactId = upserted.contactId ?? row.ghl_contact_id;
    if (!contactId) {
      failed += 1;
      firstError ??= upserted.error ?? "No contact in GoHighLevel to tag.";
      continue;
    }

    try {
      await ghlJson(agency, `/contacts/${encodeURIComponent(contactId)}/tags`, {
        method: "POST",
        body: JSON.stringify({ tags: [POWER_DIALER_TAG] }),
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      firstError ??= readableError(err);
      continue;
    }

    // Learned on the way past: a prospect whose contact we just made is joined
    // to it here, so the next call from the dialer resolves on the id alone.
    if (!row.ghl_contact_id && upserted.contactId) {
      await client
        .from("leads")
        .update({ ghl_contact_id: upserted.contactId, ghl_synced_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }

  await logAdminAction(client, admin.id, "cold_call.power_dialer_send", null, {
    asked: ids.length,
    sent,
    failed,
  });

  return Response.json({ sent, failed, notConfigured: false, error: firstError });
};
