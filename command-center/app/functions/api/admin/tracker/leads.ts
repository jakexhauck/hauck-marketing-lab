import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";

// Leads (Acquisition > Leads): Jake's agency-internal manual lead book.
// Agency-global, so there is no tenant scoping here: one shared list gated to
// admins by functions/api/_middleware.ts, which also puts the live admin on
// ctx.data.admin. Rows are soft-deleted (deleted_at) and never hard-erased.
//
// Phase 1 is manual entry: the app DB is the source of truth and nothing here
// reads from GHL or Meta.

// Mirrors LEAD_STATUSES in src/lib/adminLeads.ts and the CHECK constraint in
// migration 0055_lead_stage_vocabulary.sql. All three must stay in step; the unit test guards
// the client copy.
const LEAD_STATUSES = [
  "New Lead",
  "1st Dial (Day 1)",
  "2nd Dial (Day 2)",
  "Brushed Off",
  "Call Back",
  "Booked",
  "Not Interested",
] as const;

type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface LeadRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  timezone: string;
  status: LeadStatus;
  first_contact_date: string | null;
  source: string;
  appointment_date: string | null;
  no_answer: number;
  last_contact: string | null;
  follow_up_date: string | null;
  email: string;
  notes: string;
  assigned_to: string | null;
  created_at: string;
  // The link into the agency's own GHL account (0053). Written by the push,
  // never by a client.
  // Optional: absent on a database that has not run 0053 yet.
  ghl_contact_id?: string | null;
  ghl_synced_at?: string | null;
  ghl_error?: string | null;
}

// The columns that have always been here. Kept separate from the GHL link
// columns below because the two can be out of step: code deploys and database
// migrations are separate steps, so there is a window where this file wants
// columns the table does not have yet.
const SELECT_BASE =
  "id, first_name, last_name, phone, timezone, status, first_contact_date, source, appointment_date, no_answer, last_contact, follow_up_date, email, notes, assigned_to, created_at";

const SELECT_GHL = "ghl_contact_id, ghl_synced_at, ghl_error";

export const SELECT = `${SELECT_BASE}, ${SELECT_GHL}`;

// Postgres "undefined_column". Seen exactly once: between this code shipping and
// migration 0053 running.
const UNDEFINED_COLUMN = "42703";

// Run a query with the GHL columns, and again without them if the table has not
// been migrated yet. The lead book is the surface a caller works all day; it
// loading without a sync marker is a small loss, and it not loading at all is
// the whole job stopped.
async function withGhlFallback<T>(
  run: (select: string) => PromiseLike<{ data: T; error: { code?: string } | null }>,
): Promise<{ data: T; error: { code?: string } | null }> {
  const first = await run(SELECT);
  if (!first.error || first.error.code !== UNDEFINED_COLUMN) return first;
  return run(SELECT_BASE);
}

export function toLead(row: LeadRow) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    timezone: row.timezone,
    status: row.status,
    firstContactDate: row.first_contact_date,
    source: row.source,
    appointmentDate: row.appointment_date,
    noAnswer: row.no_answer,
    lastContact: row.last_contact,
    followUpDate: row.follow_up_date,
    email: row.email,
    notes: row.notes,
    // Whose queue this sits in (0049). Null = in the book, on nobody's list.
    assignedTo: row.assigned_to,
    createdAt: row.created_at,
    // Where this prospect stands in the agency's GHL account (0053). The id is
    // exposed so the console can link straight to the record; the error so a
    // failed push is visible next to the prospect rather than buried in a log.
    ghlContactId: row.ghl_contact_id ?? null,
    ghlSyncedAt: row.ghl_synced_at ?? null,
    ghlError: row.ghl_error ?? null,
  };
}

// The only columns a client may write, in camelCase-to-snake_case pairs. Any
// other key in the body is dropped, so a stray field can never reach the table.
const TEXT_FIELDS: Record<string, string> = {
  firstName: "first_name",
  lastName: "last_name",
  phone: "phone",
  timezone: "timezone",
  source: "source",
  email: "email",
  notes: "notes",
};

const DATE_FIELDS: Record<string, string> = {
  firstContactDate: "first_contact_date",
  appointmentDate: "appointment_date",
  lastContact: "last_contact",
  followUpDate: "follow_up_date",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// A date cell is either a clean YYYY-MM-DD or empty (stored null). Anything else
// is a client bug, so it is rejected rather than silently blanked.
function dateOrNull(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return null;
  if (!ISO_DATE.test(s) || Number.isNaN(Date.parse(s))) return undefined;
  return s;
}

// The running attempt counter: a non-negative integer, blank reads as 0.
function intOrNull(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}

function isStatus(v: unknown): v is LeadStatus {
  return typeof v === "string" && (LEAD_STATUSES as readonly string[]).includes(v);
}

// Build the snake_case update from a body, dropping keys that were not sent.
// Returns null when a supplied value fails validation.
function whitelist(body: Record<string, unknown>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};

  for (const [key, column] of Object.entries(TEXT_FIELDS)) {
    if (key in body) out[column] = str(body[key]);
  }

  for (const [key, column] of Object.entries(DATE_FIELDS)) {
    if (!(key in body)) continue;
    const parsed = dateOrNull(body[key]);
    if (parsed === undefined) return null;
    out[column] = parsed;
  }

  if ("noAnswer" in body) {
    const parsed = intOrNull(body.noAnswer);
    if (parsed === undefined) return null;
    out.no_answer = parsed;
  }

  if ("status" in body) {
    if (!isStatus(body.status)) return null;
    out.status = body.status;
  }

  return out;
}

// Today as a UTC YYYY-MM-DD, matching the date columns' day precision.
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

// GET /api/admin/tracker/leads: every live lead, newest first.
//
// Scoped by role (0049). An owner sees the whole book. Anyone else sees only the
// rows assigned to them, filtered HERE rather than in the browser: a caller must
// not be one devtools request away from the entire prospect list.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const admin = ctx.data.admin!;
  const { data, error } = await withGhlFallback((select) => {
    let query = client.from("leads").select(select).is("deleted_at", null);
    if (admin.role !== "owner") query = query.eq("assigned_to", admin.id);
    return query.order("created_at", { ascending: false });
  });
  if (error) {
    return Response.json({ error: (error as { message?: string }).message ?? "could not load leads" }, { status: 500 });
  }

  const leads = ((data ?? []) as unknown as LeadRow[]).map(toLead);
  return Response.json({ leads });
};

// POST /api/admin/tracker/leads: add a row. A bare {} creates the blank New
// lead the "Add lead" button inserts; any whitelisted fields sent override the
// server defaults.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const body = (await readBody(ctx.request)) ?? {};
  const fields = whitelist(body);
  if (!fields) return Response.json({ error: "invalid field value" }, { status: 400 });

  const today = todayIso();
  const admin = ctx.data.admin!;
  const insert = {
    status: "New Lead",
    first_contact_date: today,
    last_contact: today,
    no_answer: 0,
    admin_id: admin.id,
    ...fields,
  };

  const { data, error } = await withGhlFallback((select) =>
    client.from("leads").insert(insert).select(select).single(),
  );
  if (error || !data) {
    return Response.json(
      { error: (error as { message?: string } | null)?.message ?? "could not create lead" },
      { status: 500 },
    );
  }

  const lead = toLead(data as unknown as LeadRow);
  await logAdminAction(client, admin.id, "leads.create", null, { id: lead.id });
  return Response.json({ lead }, { status: 201 });
};

// PATCH /api/admin/tracker/leads: edit one row by id. Only the fields sent are
// touched, so an inline cell edit is a one-column write.
export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const body = await readBody(ctx.request);
  if (!body) return Response.json({ error: "invalid body" }, { status: 400 });

  const id = str(body.id);
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  const fields = whitelist(body);
  if (!fields) return Response.json({ error: "invalid field value" }, { status: 400 });

  const admin = ctx.data.admin!;

  // Who a lead belongs to is the owner's call, never the caller's: handing
  // yourself work, or handing your work to someone else, is not an edit.
  if ("assignedTo" in body) {
    if (admin.role !== "owner") {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    const value = body.assignedTo;
    if (value !== null && typeof value !== "string") {
      return Response.json({ error: "invalid field value" }, { status: 400 });
    }
    fields.assigned_to = value === null || value === "" ? null : value.trim();
  }

  if (!Object.keys(fields).length) {
    return Response.json({ error: "no fields to update" }, { status: 400 });
  }

  const { data, error } = await withGhlFallback((select) => {
    let update = client
      .from("leads")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null);
    // A caller may only write rows on their own queue. Scoping the UPDATE itself
    // means a guessed id changes nothing and reports not found.
    if (admin.role !== "owner") update = update.eq("assigned_to", admin.id);
    return update.select(select).maybeSingle();
  });
  if (error) {
    return Response.json(
      { error: (error as { message?: string }).message ?? "could not save lead" },
      { status: 500 },
    );
  }
  if (!data) return Response.json({ error: "lead not found" }, { status: 404 });

  await logAdminAction(client, admin.id, "leads.update", null, {
    id,
    fields: Object.keys(fields),
  });
  return Response.json({ lead: toLead(data as unknown as LeadRow) });
};

// DELETE /api/admin/tracker/leads: soft delete by id. The row stays in the
// table with deleted_at set and drops out of every list.
export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const body = await readBody(ctx.request);
  if (!body) return Response.json({ error: "invalid body" }, { status: 400 });

  const id = str(body.id);
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  const now = new Date().toISOString();
  const { data, error } = await client
    .from("leads")
    .update({ deleted_at: now, updated_at: now })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "lead not found" }, { status: 404 });

  const admin = ctx.data.admin!;
  await logAdminAction(client, admin.id, "leads.delete", null, { id });
  return Response.json({ ok: true });
};
