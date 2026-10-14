import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { getAgencyGhlContext, isAgencyGhlConfigured } from "../../../lib/agencyGhl";
import { fetchAllContacts, ghlJson } from "../../../lib/ghl";
import { upsertAgencyContact, type LeadForPush } from "../../../lib/agencyCrm";
import { planContactTags, tagForStatus } from "../../../lib/coldCallTags";

// POST /api/admin/cold-call/reconcile  (admin session gated in _middleware.ts)
//
// Push the whole book into GoHighLevel so a Smart List can BE a page of it.
//
// The two systems were already joined by tags, but only for prospects somebody
// had touched: a lead was pushed when it was imported and re-tagged when an
// outcome was pressed. Anything else drifted. A status changed from the
// management table never reached GoHighLevel at all, a push that failed left a
// prospect in the book and nowhere else, and `cc new lead` was never removed, so
// the New Lead list still held people who had been called five times.
//
// This makes the whole book true at once: every live lead gets a contact, and
// every contact gets exactly one cold call tag, the one its status means. A
// Smart List filtered on that single tag is then the same set of people as the
// page, with no "does not have" conditions holding it together.
//
// BY HAND ONLY (Jake's call, 2026-08-17). Nothing here runs on a timer or on
// page load: it writes to live contact records, and the moment it does so should
// be a moment somebody chose.
//
// Idempotent, and cheap when there is nothing to do. It reads every contact
// once, in bulk, and only then decides; a settled book costs a handful of reads
// and no writes at all, which is what makes it safe to press twice.

// Statuses that live in the cold call book. Anything else is not this system's
// business and is left alone entirely.
const BOOK_STATUSES = [
  "New Lead",
  "No Answer Day 1",
  "No Answer Day 2",
  "Call Back",
  "Not Interested",
  "Booked",
];

// A ceiling on one press, not an expectation. The book is in the hundreds; this
// is the guard that stops a runaway from spending an afternoon of rate limit.
// When it bites, the answer says so and pressing again picks up where it left
// off, because everything already done is now a no-op.
const MAX_PER_RUN = 400;

interface LeadRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  business_name: string | null;
  website: string | null;
  status: string | null;
  ghl_contact_id: string | null;
}

interface Report {
  configured: boolean;
  // Leads looked at.
  checked: number;
  // Contacts created in GoHighLevel for a prospect that had none.
  created: number;
  // Contacts whose tags were changed.
  retagged: number;
  // Contacts that were already right. On a settled book this is all of them.
  unchanged: number;
  // Prospects that could not be pushed, with the reason, capped for reading.
  failed: { name: string; error: string }[];
  // True when MAX_PER_RUN stopped the run early.
  truncated: boolean;
  // True when nothing was written and the numbers are what a real run WOULD do.
  preview: boolean;
}

// `?preview=1` answers the same report having written nothing at all.
//
// Worth its own mode rather than a leap of faith: this is a bulk write onto
// live contact records, and "how many is it about to change" is a fair question
// to ask before the first press on a book somebody has been keeping by hand.
function isPreview(url: URL): boolean {
  const raw = url.searchParams.get("preview");
  return raw !== null && raw !== "0" && raw !== "false";
}

// `?limit=N` does the first N and stops, which is how a first run on a book
// somebody has kept by hand gets tried on one prospect before it gets tried on
// three hundred. Absent, the ceiling is the per-run cap.
function readLimit(url: URL): number {
  const raw = url.searchParams.get("limit");
  if (raw === null || raw.trim() === "") return MAX_PER_RUN;
  const n = Number(raw);
  if (!Number.isFinite(n)) return MAX_PER_RUN;
  return Math.min(MAX_PER_RUN, Math.max(1, Math.trunc(n)));
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const admin = ctx.data.admin!;

  const url = new URL(ctx.request.url);
  const preview = isPreview(url);
  const limit = readLimit(url);

  if (!isAgencyGhlConfigured(ctx.env)) {
    return Response.json({
      configured: false,
      checked: 0,
      created: 0,
      retagged: 0,
      unchanged: 0,
      failed: [],
      truncated: false,
      preview,
    } satisfies Report);
  }

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await client
    .from("leads")
    .select(
      "id, first_name, last_name, phone, email, source, business_name, website, status, ghl_contact_id",
    )
    .is("deleted_at", null)
    .in("status", BOOK_STATUSES)
    .order("created_at", { ascending: true })
    .limit(limit + 1);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const all = (data ?? []) as LeadRow[];
  const truncated = all.length > limit;
  const leads = truncated ? all.slice(0, limit) : all;

  // Every contact's tags, in one paginated read rather than one request per
  // prospect. On a book of 400 that is the difference between four requests and
  // four hundred, and it is the reason this can be pressed on a whim.
  const agency = getAgencyGhlContext(ctx.env);
  const tagsByContact = new Map<string, string[]>();
  try {
    for (const contact of await fetchAllContacts(agency)) {
      if (contact.id) tagsByContact.set(contact.id, contact.tags ?? []);
    }
  } catch (err) {
    return Response.json(
      { error: `Could not read contacts from GoHighLevel: ${readable(err)}` },
      { status: 502 },
    );
  }

  const report: Report = {
    configured: true,
    checked: leads.length,
    created: 0,
    retagged: 0,
    unchanged: 0,
    failed: [],
    truncated,
    preview,
  };

  for (const lead of leads) {
    const status = lead.status ?? "";
    // A status with no tag meaning is skipped rather than guessed at. It cannot
    // happen through the UI; it can happen through a hand-edited row.
    if (tagForStatus(status) === undefined) continue;

    let contactId = lead.ghl_contact_id;

    if (!contactId) {
      // In preview the prospect has no contact yet and therefore no tags, so
      // the count is "would create, and would then tag". Nothing is written and
      // the loop moves on rather than pretending to know an id.
      if (preview) {
        report.created += 1;
        report.retagged += 1;
        continue;
      }
      const push = await upsertAgencyContact(ctx.env, toPushShape(lead));
      if (!push.ok || !push.contactId) {
        report.failed.push({ name: displayName(lead), error: push.error ?? "unknown" });
        await stampLead(client, lead.id, null, push.error ?? "could not create the contact");
        continue;
      }
      contactId = push.contactId;
      report.created += 1;
      await stampLead(client, lead.id, contactId, null);
    }

    // A contact we have never seen in the bulk read is one created seconds ago,
    // so it carries no tags yet. Treating it as empty is right, and it is also
    // what makes a freshly created prospect get its tag on this same run.
    const plan = planContactTags(status, tagsByContact.get(contactId) ?? []);
    if (plan.apply.length === 0 && plan.remove.length === 0) {
      report.unchanged += 1;
      continue;
    }

    if (preview) {
      report.retagged += 1;
      continue;
    }

    try {
      await writeTags(ctx.env, contactId, plan.apply, plan.remove);
      report.retagged += 1;
    } catch (err) {
      report.failed.push({ name: displayName(lead), error: readable(err) });
    }
  }

  if (preview) return Response.json({ ...report, failed: report.failed.slice(0, 5) });

  // Worth an audit line: it is a bulk write onto live contact records, and the
  // counts are what somebody would want when asking why a list changed shape.
  await logAdminAction(client, admin.id, "cold_call.reconcile_tags", null, {
    checked: report.checked,
    created: report.created,
    retagged: report.retagged,
    failed: report.failed.length,
  });

  // Only the first few failures travel: the caller needs to know what broke and
  // roughly how much, not a list of 300 identical sentences.
  return Response.json({ ...report, failed: report.failed.slice(0, 5) });
};

// Apply then remove, in that order. If the second half fails the contact is in
// two lists, which is visible and fixed by pressing again; the other order
// leaves it in none, which looks like the prospect has vanished.
async function writeTags(
  env: Env,
  contactId: string,
  apply: string[],
  remove: string[],
): Promise<void> {
  const agency = getAgencyGhlContext(env);
  if (apply.length > 0) {
    await ghlJson(agency, `/contacts/${encodeURIComponent(contactId)}/tags`, {
      method: "POST",
      body: JSON.stringify({ tags: apply }),
    });
  }
  if (remove.length > 0) {
    await ghlJson(agency, `/contacts/${encodeURIComponent(contactId)}/tags`, {
      method: "DELETE",
      body: JSON.stringify({ tags: remove }),
    });
  }
}

async function stampLead(
  client: SupabaseClient,
  leadId: string,
  contactId: string | null,
  error: string | null,
): Promise<void> {
  await client
    .from("leads")
    .update({
      ...(contactId ? { ghl_contact_id: contactId, ghl_synced_at: new Date().toISOString() } : {}),
      ghl_error: error,
    })
    .eq("id", leadId);
}

function toPushShape(lead: LeadRow): LeadForPush {
  return {
    id: lead.id,
    firstName: lead.first_name ?? "",
    lastName: lead.last_name ?? "",
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    source: lead.source ?? "",
    businessName: lead.business_name ?? "",
    website: lead.website ?? "",
    ghlContactId: lead.ghl_contact_id,
  };
}

function displayName(lead: LeadRow): string {
  return (
    (lead.business_name ?? "").trim() ||
    `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() ||
    lead.phone ||
    "Unnamed prospect"
  );
}

function readable(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
