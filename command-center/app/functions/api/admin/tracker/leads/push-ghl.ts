import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";
import { pushImportedLead, type LeadForPush } from "../../../../lib/agencyCrm";

// POST /api/admin/tracker/leads/push-ghl  (owner-only)
//
// Push a batch of prospects into GoHighLevel and tag them `cc new lead`, the
// same thing the import does on the way in.
//
// This endpoint exists because the import's push is best-effort by design: it
// runs after the insert and never fails the import, so a CRM that was down (or
// simply not connected) leaves prospects in the book and nowhere else. A lead
// with no contact in GoHighLevel is invisible to the workflow that puts it on
// the board, which means nobody ever calls it. Re-importing the file does not
// fix that either: those rows are duplicates now, and get skipped.
//
// So: the same push, on demand, against rows the owner picked. It is
// deliberately the same `pushImportedLead` and not a second implementation, and
// it stamps the same three columns, so a row pushed from here is
// indistinguishable from one pushed at import.
//
// Rows that already carry a ghl_contact_id are pushed again on purpose. The
// upsert keys on phone and email, so it updates the contact rather than
// doubling it, and "push these again" is the honest answer to a tag that went
// missing over there.

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
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const admin = ctx.data.admin!;
  if (admin.role !== "owner") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

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
    return Response.json({ error: "Select at least one lead." }, { status: 400 });
  }
  // A lower cap than assign's, because each of these is a pair of calls to
  // somebody else's rate-limited API rather than one statement against our own
  // database. Two hundred is about a minute; more than that and the request
  // starts gambling with the Functions timeout.
  if (ids.length > MAX_IDS) {
    return Response.json(
      { error: `Push at most ${MAX_IDS} at a time.` },
      { status: 400 },
    );
  }

  const { data, error } = await client
    .from("leads")
    .select("id, first_name, last_name, phone, email, source, ghl_contact_id")
    .in("id", ids)
    .is("deleted_at", null);
  if (error) {
    console.error("[leads/push-ghl] read failed", error.message);
    return Response.json({ error: "Could not read those leads." }, { status: 500 });
  }

  const rows = (data ?? []) as LeadRow[];
  if (rows.length === 0) {
    return Response.json({ error: "None of those leads are still in the book." }, { status: 404 });
  }

  // Sequential, like the import: GoHighLevel rate limits, and a burst that trips
  // the limit fails rows that would otherwise have landed.
  let pushed = 0;
  let failed = 0;
  let notConfigured = false;
  // The first thing that went wrong, shown to whoever pressed the button. One
  // reason is useful; forty copies of it are not.
  let firstError: string | null = null;

  for (const row of rows) {
    const lead: LeadForPush = {
      id: row.id,
      firstName: row.first_name ?? "",
      lastName: row.last_name ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      source: row.source ?? "",
      ghlContactId: row.ghl_contact_id,
    };

    const result = await pushImportedLead(ctx.env, lead);
    if (result.notConfigured) {
      notConfigured = true;
      break;
    }
    if (result.ok) {
      pushed += 1;
    } else {
      failed += 1;
      if (!firstError) firstError = result.error;
    }

    await client
      .from("leads")
      .update({
        ghl_contact_id: result.contactId,
        ...(result.ok ? { ghl_synced_at: new Date().toISOString() } : {}),
        ghl_error: result.error,
      })
      .eq("id", row.id);
  }

  await logAdminAction(client, admin.id, "leads.push_ghl", null, {
    requested: rows.length,
    pushed,
    failed,
    notConfigured,
  });

  return Response.json({ pushed, failed, notConfigured, error: firstError });
};
