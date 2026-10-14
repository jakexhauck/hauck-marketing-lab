import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";
import { pushImportedLead } from "../../../../lib/agencyCrm";

// POST /api/admin/tracker/leads/import  (owner-only)
//
// Bulk-add prospects from a CSV the owner uploaded. The browser does the parsing
// and the column mapping, because that is where the file and the human are; this
// endpoint takes the finished rows and is the last word on what may land in the
// table.
//
// Two rules worth stating, because both protect the caller's day:
//
//  1. A row with no phone number is REJECTED, not imported blank. This is a
//     dialing list; a row nobody can call is not a lead, it is a gap in the
//     queue that someone has to notice and clean up mid-shift.
//  2. Phone numbers already in the book are skipped, and the response says how
//     many. Importing the same file twice is a thing people do, and dialing the
//     same prospect twice is how you lose them.
//
// Rows are inserted assigned (or unassigned) exactly as the owner chose in the
// import dialog, so a list can go straight onto someone's queue.
//
// Every row that lands is also pushed into GoHighLevel as a contact tagged
// `cc new lead`, which is what a workflow over there watches for. The push runs
// AFTER the insert and never fails the import: a prospect in the book but not
// yet in the CRM can be re-pushed, whereas a lost row has to be re-imported by
// hand. The response says how many made it, so the wizard can report it rather
// than implying silence means success.
//
// The browser sends this endpoint one BATCH at a time, not a whole file: a
// thousand-row list is a thousand GoHighLevel calls, which no single request
// can survive. Batching is what makes the progress bar honest, too.

const MAX_ROWS = 5000;

interface ImportRow {
  firstName?: unknown;
  lastName?: unknown;
  phone?: unknown;
  email?: unknown;
  timezone?: unknown;
  source?: unknown;
  notes?: unknown;
  // Who the business is (0059). Until these existed the importer folded a
  // company column into notes and an industry column into source, which is how
  // the two most useful facts on a bought list ended up unreadable.
  businessName?: unknown;
  niche?: unknown;
  website?: unknown;
  city?: unknown;
  state?: unknown;
}

// The columns read back after the insert, to push into GoHighLevel.
interface ImportedRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  business_name: string | null;
  website: string | null;
}

interface Body {
  rows?: unknown;
  assignedTo?: unknown;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// Compare numbers by their digits alone, so "(555) 010-9999", "555-010-9999"
// and "5550109999" are one prospect rather than three.
export function phoneKey(phone: string): string {
  return phone.replace(/\D/g, "");
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

  const rows = Array.isArray(body.rows) ? (body.rows as ImportRow[]) : null;
  if (!rows || rows.length === 0) {
    return Response.json({ error: "Nothing to import." }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return Response.json(
      { error: `That file has more than ${MAX_ROWS} rows. Split it and import again.` },
      { status: 400 },
    );
  }

  const assignedTo = str(body.assignedTo) || null;

  // Every live number already in the book, so a re-import is a no-op rather than
  // a second copy of the list.
  const { data: existingRows, error: existingError } = await client
    .from("leads")
    .select("phone")
    .is("deleted_at", null);
  if (existingError) {
    return Response.json({ error: existingError.message }, { status: 500 });
  }
  const seen = new Set(
    ((existingRows ?? []) as { phone: string }[])
      .map((r) => phoneKey(r.phone ?? ""))
      .filter(Boolean),
  );

  const insert: Record<string, unknown>[] = [];
  let missingPhone = 0;
  let duplicates = 0;

  for (const row of rows) {
    const phone = str(row.phone);
    if (!phone) {
      missingPhone += 1;
      continue;
    }
    const key = phoneKey(phone);
    // Guards both against the book and against repeats inside the file itself.
    if (!key || seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);

    insert.push({
      first_name: str(row.firstName),
      last_name: str(row.lastName),
      phone,
      email: str(row.email),
      timezone: str(row.timezone),
      source: str(row.source),
      notes: str(row.notes),
      business_name: str(row.businessName),
      niche: str(row.niche),
      website: str(row.website),
      city: str(row.city),
      state: str(row.state),
      status: "New Lead",
      no_answer: 0,
      // first_contact_date and last_contact stay null on purpose: an imported
      // row has never been called, and stamping today would tell the caller a
      // prospect was worked when nobody has spoken to them.
      admin_id: admin.id,
      assigned_to: assignedTo,
    });
  }

  if (insert.length === 0) {
    return Response.json({
      imported: 0,
      skippedNoPhone: missingPhone,
      skippedDuplicate: duplicates,
    });
  }

  const { data: inserted, error } = await client
    .from("leads")
    .insert(insert)
    .select("id, first_name, last_name, phone, email, source, business_name, website");
  if (error) {
    console.error("[leads/import] insert failed", error.message);
    return Response.json({ error: "Could not import those rows." }, { status: 500 });
  }

  // Into the CRM, tagged. Sequential rather than parallel: GoHighLevel rate
  // limits, and a burst that trips the limit fails rows that would otherwise
  // have landed.
  //
  // What happened is written back onto each row (ghl_contact_id / ghl_synced_at
  // / ghl_error), which is what those columns were added for in 0053. Counting
  // the failures in the response and nowhere else made "3 did not reach
  // GoHighLevel" a sentence that vanished when the wizard closed, and a prospect
  // in the book but not in the CRM is invisible to the workflow, so nobody ever
  // calls them. Stamped, they can be found again and pushed from the Assign
  // page without re-importing the file.
  let pushed = 0;
  let pushFailed = 0;
  let notConfigured = false;
  for (const row of (inserted ?? []) as ImportedRow[]) {
    const result = await pushImportedLead(ctx.env, {
      id: row.id,
      firstName: row.first_name ?? "",
      lastName: row.last_name ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      source: row.source ?? "",
      businessName: row.business_name ?? "",
      website: row.website ?? "",
      ghlContactId: null,
    });
    // Not connected is a state of the whole install, not a fact about this
    // prospect. Stamping it on every row would be the same noise 500 times.
    if (result.notConfigured) {
      notConfigured = true;
      break;
    }
    if (result.ok) pushed += 1;
    else pushFailed += 1;

    await client
      .from("leads")
      .update({
        ghl_contact_id: result.contactId,
        // Only a clean push counts as synced. A half-push (contact made, tag
        // refused) leaves synced_at null so the row still reads as unfinished.
        ...(result.ok ? { ghl_synced_at: new Date().toISOString() } : {}),
        ghl_error: result.error,
      })
      .eq("id", row.id);
  }

  await logAdminAction(client, admin.id, "leads.import", null, {
    imported: insert.length,
    skippedNoPhone: missingPhone,
    skippedDuplicate: duplicates,
    assignedTo,
    pushed,
    pushFailed,
  });

  return Response.json({
    imported: insert.length,
    skippedNoPhone: missingPhone,
    skippedDuplicate: duplicates,
    pushed,
    pushFailed,
    notConfigured,
  });
};
