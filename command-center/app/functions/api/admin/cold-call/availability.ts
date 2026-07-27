import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { normalizeSlots } from "../../../lib/coldCallAvailability";

// GET/PUT /api/admin/cold-call/availability (admin session gated in
// _middleware.ts, role gated in lib/adminRoles.ts).
//
// When each cold caller is on the phones (0057). One row per person per day,
// holding that day's half-hour slot indices.
//
// WHOSE availability a request touches is decided here, not by the body:
//   - a cold caller is pinned to themselves, always, on both read and write.
//     There is deliberately no way for a caller to read or edit a colleague's
//     week, and no ?callerId= they can send changes that.
//   - an owner may name anyone via ?callerId= / callerId, because setting the
//     phone rota is the job the owner does on this page.
//
// A caller sending ?callerId= for someone else is not an error worth arguing
// with: the parameter is simply ignored and they get their own week, which is
// the same answer they would get with no parameter at all.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// The person this request is about. Exported for its own test: this one
// function is the whole boundary between "a caller edits their week" and "a
// caller edits somebody else's", so it is tested directly rather than only
// through the two handlers that call it.
export function resolveTarget(
  ctx: { data: ApiData },
  requested: string | null,
): string | null {
  const admin = ctx.data.admin;
  if (!admin) return null;
  if (admin.role !== "owner") return admin.id;
  const wanted = (requested ?? "").trim();
  return wanted || admin.id;
}

interface Row {
  day: string;
  slots: number[] | null;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!DAY_RE.test(from) || !DAY_RE.test(to)) {
    return Response.json({ error: "bad_range" }, { status: 400 });
  }
  // An unbounded or inverted range is a bug in the caller, not a query to run.
  if (to < from) return Response.json({ error: "bad_range" }, { status: 400 });

  const callerId = resolveTarget(ctx, url.searchParams.get("callerId"));
  if (!callerId) return Response.json({ error: "forbidden" }, { status: 403 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await client
    .from("cold_call_availability")
    .select("day, slots")
    .eq("admin_id", callerId)
    .gte("day", from)
    .lte("day", to);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const days: Record<string, number[]> = {};
  for (const row of (data ?? []) as Row[]) {
    // Re-normalise on the way out: smallint[] arrives as numbers, but a row
    // written before this handler existed has no such guarantee.
    days[row.day] = normalizeSlots(row.slots);
  }

  return Response.json({ callerId, days });
};

interface Body {
  callerId?: string | null;
  day?: string;
  slots?: unknown;
}

// PUT replaces ONE day. The grid edits a day at a time (painting a range never
// crosses a column), so a whole-week write would send six untouched days on
// every drag and turn two people editing different days into a lost update.
export const onRequestPut: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<Body>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const day = (body.day ?? "").trim();
  if (!DAY_RE.test(day)) return Response.json({ error: "bad_day" }, { status: 400 });

  const callerId = resolveTarget(ctx, body.callerId ?? null);
  if (!callerId) return Response.json({ error: "forbidden" }, { status: 403 });

  // Whatever the client sent, what gets stored is a sorted, de-duplicated list
  // of in-range slots. The grid cannot produce anything else; a hand-rolled
  // request can, and this is the boundary that stops it.
  const slots = normalizeSlots(body.slots);

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { error } = await client.from("cold_call_availability").upsert(
    {
      admin_id: callerId,
      day,
      slots,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "admin_id,day" },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // The empty day is kept rather than deleted: "asked, and not available" is a
  // different answer from "never filled in", and only the row preserves it.
  return Response.json({ callerId, day, slots });
};
