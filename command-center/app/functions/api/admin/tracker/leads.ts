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
// migration 0030_leads.sql. All three must stay in step; the unit test guards
// the client copy.
const LEAD_STATUSES = [
  "New",
  "Contacted",
  "No Answer",
  "Booked",
  "Qualified",
  "Closed",
  "Dead",
] as const;

type LeadStatus = (typeof LEAD_STATUSES)[number];

interface LeadRow {
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
  created_at: string;
}

const SELECT =
  "id, first_name, last_name, phone, timezone, status, first_contact_date, source, appointment_date, no_answer, last_contact, follow_up_date, email, notes, created_at";

function toLead(row: LeadRow) {
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
    createdAt: row.created_at,
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
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await client
    .from("leads")
    .select(SELECT)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

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
    status: "New",
    first_contact_date: today,
    last_contact: today,
    no_answer: 0,
    admin_id: admin.id,
    ...fields,
  };

  const { data, error } = await client.from("leads").insert(insert).select(SELECT).single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "could not create lead" }, { status: 500 });
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
  if (!Object.keys(fields).length) {
    return Response.json({ error: "no fields to update" }, { status: 400 });
  }

  const { data, error } = await client
    .from("leads")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select(SELECT)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "lead not found" }, { status: 404 });

  const admin = ctx.data.admin!;
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
