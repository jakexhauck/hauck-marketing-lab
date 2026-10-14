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
// migration 0076_cold_call_stage_names.sql. All three must stay in step; the unit
// test guards the client copy.
//
// Exported for the GoHighLevel sync (./leads/sync-ghl.ts), which matches these
// names against the live board's stages VERBATIM: a status this list does not
// contain is one the CHECK constraint would reject, so the sync skips the card
// rather than importing something the insert would refuse.
//
// Every name except "Booked" is a live stage on the agency's Cold Calling
// pipeline. "Brushed Off" used to be here and was wrong twice over: 0056 deleted
// the stage, so the sync was accepting a name the constraint would then reject.
// "Booked" is app-side only, because a booked demo moves to the Sales pipeline;
// it stays in the vocabulary so the book can record that a lead has left dialing.
export const LEAD_STATUSES = [
  "New Lead",
  "No Answer Day 1",
  "No Answer Day 2",
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
  // Who the prospect actually is (0059). Optional for the same reason as the
  // GHL columns below: a database that has not run the migration yet.
  business_name?: string | null;
  niche?: string | null;
  website?: string | null;
  city?: string | null;
  state?: string | null;
  // The time of day agreed for the callback (0064). Optional for the same
  // reason as the columns above and below.
  follow_up_time?: string | null;
  // The link into the agency's own GHL account (0053). Written by the push,
  // never by a client.
  // Optional: absent on a database that has not run 0053 yet.
  ghl_contact_id?: string | null;
  ghl_synced_at?: string | null;
  ghl_error?: string | null;
}

// The one place the table's columns and the browser's field names are paired.
//
// Everything that needs either reads it from here: the aliased select the list
// is streamed to the browser with, the snake_case select the GoHighLevel sync
// reads rows into, and toLead below. Two copies of this pairing would be two
// things to keep in step, and a column added to one and not the other would
// send the list one shape and a written row another.
//
// Grouped because code deploys and database migrations are separate steps, so
// there is a window where this file wants columns the table does not have yet.
// The groups are dropped newest-first when that happens.

// The columns that have always been here.
const BASE_COLUMNS = {
  id: "id",
  firstName: "first_name",
  lastName: "last_name",
  phone: "phone",
  timezone: "timezone",
  status: "status",
  firstContactDate: "first_contact_date",
  source: "source",
  appointmentDate: "appointment_date",
  noAnswer: "no_answer",
  lastContact: "last_contact",
  followUpDate: "follow_up_date",
  email: "email",
  notes: "notes",
  assignedTo: "assigned_to",
  createdAt: "created_at",
} as const;

// The link into the agency's own GHL account (0053).
const GHL_COLUMNS = {
  ghlContactId: "ghl_contact_id",
  ghlSyncedAt: "ghl_synced_at",
  ghlError: "ghl_error",
} as const;

// Who the prospect is (0059).
const BUSINESS_COLUMNS = {
  businessName: "business_name",
  niche: "niche",
  website: "website",
  city: "city",
  state: "state",
} as const;

// The time of day agreed for a callback (0064).
const TIME_COLUMNS = { followUpTime: "follow_up_time" } as const;

// Everything, then the optional groups dropped one at a time, newest first. The
// lead book is the surface a caller works all day: loading it without a sync
// marker or without a niche is a small loss, and not loading it at all is the
// whole job stopped.
const COLUMN_LADDER: Record<string, string>[] = [
  { ...BASE_COLUMNS, ...GHL_COLUMNS, ...BUSINESS_COLUMNS, ...TIME_COLUMNS },
  { ...BASE_COLUMNS, ...GHL_COLUMNS, ...BUSINESS_COLUMNS },
  { ...BASE_COLUMNS, ...GHL_COLUMNS },
  { ...BASE_COLUMNS },
];

// PostgREST renames a column on the way out with `alias:column`. That one piece
// of syntax is what lets the list reach the browser without this Worker reading
// a row of it: what Postgres sends back is already the shape the client wants,
// so it can be piped through untouched. See onRequestGet.
function aliased(columns: Record<string, string>): string {
  return Object.entries(columns)
    .map(([field, column]) => (field === column ? column : `${field}:${column}`))
    .join(",");
}

export const LIST_SELECT = aliased(COLUMN_LADDER[0]);
const LIST_FALLBACKS = COLUMN_LADDER.map(aliased);

// The client-side names an aliased select asks for. Exported for the test that
// holds this and toLead to the same shape; nothing at runtime needs it.
export function listSelectKeys(select: string): string[] {
  return select.split(",").map((part) => part.split(":")[0]);
}

// The same columns under their real names, for the callers that read rows into
// JavaScript rather than streaming them (./leads/sync-ghl.ts, and the writes
// below, which return one row).
export const SELECT = Object.values(COLUMN_LADDER[0]).join(", ");

// Postgres "undefined_column". Seen exactly once per migration: between this
// code shipping and the migration running.
const UNDEFINED_COLUMN = "42703";

const FALLBACKS = COLUMN_LADDER.map((columns) => Object.values(columns).join(", "));

async function withGhlFallback<T>(
  run: (select: string) => PromiseLike<{ data: T; error: { code?: string } | null }>,
): Promise<{ data: T; error: { code?: string } | null }> {
  let last: { data: T; error: { code?: string } | null } | null = null;
  for (const select of FALLBACKS) {
    last = await run(select);
    if (!last.error || last.error.code !== UNDEFINED_COLUMN) return last;
  }
  return last!;
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
    // The time agreed for that callback (0064), or null for "that day, some
    // time". Postgres hands a `time` column back as "14:30:00"; the client
    // reduces it to "14:30" rather than this file guessing at a format.
    followUpTime: row.follow_up_time ?? null,
    email: row.email,
    notes: row.notes,
    // Who the prospect actually is (0059). Coalesced rather than passed
    // through: the fallback SELECT below drops these columns on a database that
    // predates them, and a caller's table should render blanks rather than
    // "undefined".
    businessName: row.business_name ?? "",
    niche: row.niche ?? "",
    website: row.website ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
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
  // Who the prospect actually is (0059). A caller edits these mid-call as often
  // as anything else on the row: half of what a bought list says about a
  // business turns out to be wrong the moment somebody picks up.
  businessName: "business_name",
  niche: "niche",
  website: "website",
  city: "city",
  state: "state",
};

const DATE_FIELDS: Record<string, string> = {
  firstContactDate: "first_contact_date",
  appointmentDate: "appointment_date",
  lastContact: "last_contact",
  followUpDate: "follow_up_date",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// "14:30" or "14:30:00". Postgres accepts far more than this; the narrow shape
// is what the picker sends, and anything else is a client bug.
const ISO_TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

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

// A callback time is either a clean HH:MM or empty (stored null). Empty is a
// real answer here, not a missing one: it means a day was agreed and no time.
function timeOrNull(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return null;
  return ISO_TIME.test(s) ? s : undefined;
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

  if ("followUpTime" in body) {
    const parsed = timeOrNull(body.followUpTime);
    if (parsed === undefined) return null;
    out.follow_up_time = parsed;
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
// The ids a caller may ask for by name, from ?ids=a,b,c.
//
// The Power dialer wants the two or three prospects the phone has just been on,
// not the book. Reading the whole book to find them is what broke it: at 746
// rows this handler builds and serialises about 450KB per request, and
// Cloudflare kills the Worker for exceeding its CPU budget (error 1102) before a
// line of this file runs. The page then says "Could not load the book" for a
// list it was going to throw away.
//
// Capped, because an unbounded id list is the same request wearing a hat.
export const MAX_IDS = 60;

export function parseIds(raw: string | null): string[] | null {
  if (raw === null) return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Deduped: the live-calls list can name the same prospect twice, and asking
  // for them twice would cost twice.
  return [...new Set(ids)].slice(0, MAX_IDS);
}

// PostgREST answers with a bare array; the browser has always been given
// {leads:[...]}. Wrapping it is two writes around the upstream chunks rather
// than a re-serialisation, so the envelope costs nothing per row.
export function leadsEnvelope(rows: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const reader = rows.getReader();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('{"leads":'));
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.enqueue(encoder.encode("}"));
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

// A PostgREST value used inside `in.(...)`. Quoted, because an id carrying a
// comma or a bracket would otherwise be read as more filter syntax.
function quoted(id: string): string {
  return `"${id.replace(/["\\]/g, "")}"`;
}

// GET /api/admin/tracker/leads, streamed.
//
// This handler does NOT read the rows it returns. Postgres is asked for the
// camelCase field names the client already wants (LIST_SELECT), and its answer
// is piped to the browser a chunk at a time.
//
// That is the whole point of it, and it is worth stating plainly because the
// obvious version of this code is what broke. Reading the book into JavaScript
// costs three full passes over it: supabase-js parses the JSON, .map(toLead)
// allocates a second object per row, and Response.json serialises it all again.
// At 746 rows that is ~460KB three times over, which lands on the far side of
// the CPU budget Cloudflare allows one request on this plan. The Worker was
// killed before a line of this file ran (error 1102), and the page reported it
// as "Could not load the book" for a request that never reached the app. It was
// intermittent rather than dead, which is what made it look like anything else:
// the same request passes on a warm isolate and fails on a busy one.
//
// Streaming makes the cost of this endpoint independent of how many leads there
// are, which matters because the scraper adds rows every day and any fix that
// merely made the book smaller would have been a fix with an expiry date.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = ctx.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "supabase not configured" }, { status: 503 });
  }

  const ids = parseIds(new URL(ctx.request.url).searchParams.get("ids"));
  // Asked for nothing by name: answer without touching the database. The Power
  // dialer sits here most of the day, between calls.
  if (ids?.length === 0) return Response.json({ leads: [] });

  const admin = ctx.data.admin!;
  let last: Response | null = null;
  // Same ladder as the writes below, for the same reason: a database that has
  // not run the newest migration yet answers 42703 rather than the book.
  for (const select of LIST_FALLBACKS) {
    const params = new URLSearchParams();
    params.set("select", select);
    params.set("deleted_at", "is.null");
    if (ids) params.set("id", `in.(${ids.map(quoted).join(",")})`);
    // Scoped by role (0049). A caller sees only the rows assigned to them,
    // filtered HERE rather than in the browser: a caller must not be one
    // devtools request away from the entire prospect list.
    if (admin.role !== "owner") params.set("assigned_to", `eq.${admin.id}`);
    params.set("order", "created_at.desc");

    last = await fetch(`${SUPABASE_URL}/rest/v1/leads?${params}`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json",
      },
    });
    if (last.ok && last.body) {
      return new Response(leadsEnvelope(last.body), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    // Only a missing column is worth asking again for. Anything else is the
    // same answer however many times it is requested.
    const body = await last.text();
    if (!body.includes(UNDEFINED_COLUMN)) {
      return Response.json({ error: "could not load leads" }, { status: 500 });
    }
  }

  console.error("[tracker/leads] no column set the database accepted", last?.status);
  return Response.json({ error: "could not load leads" }, { status: 500 });
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
