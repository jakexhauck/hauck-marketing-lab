import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";

// GET /api/admin/cold-call/callback-slots  (admin-only, gated in _middleware.ts)
//
// Every callback already promised, so the picker can stop a caller agreeing two
// prospects the same time. Booking a demo cannot collide because GoHighLevel
// owns those slots and stops offering one the moment it is taken; a callback is
// a promise made out loud on the phone and lives only in this book, so nothing
// was stopping it being made twice.
//
// AGENCY-WIDE on purpose, not per caller. Two people on the phones agreeing the
// same 1pm is exactly the clash this exists to prevent, and scoping it to the
// signed-in caller would leave the commonest version of the problem in place.
//
// Times only. A callback with no time is a DAY ("call me Thursday"), which
// blocks nothing: treating it as a slot would grey out an hour nobody agreed to.
// Filtered in SQL rather than in the browser so a book with a thousand dayless
// callbacks does not ship them all to a picker that ignores every one.
//
// Past days are dropped for the same reason the queue drops them: a slot last
// Tuesday cannot clash with anything anyone is about to agree.

interface Row {
  id: string;
  business_name: string | null;
  first_name: string | null;
  last_name: string | null;
  follow_up_date: string;
  follow_up_time: string;
}

// Who holds the slot, for the tooltip on a blocked time. The business first: on
// a cold call board the company is what a caller recognises, and the person is
// often blank because a scraped prospect has no name on it until somebody asks.
function holderName(row: Row): string {
  const business = (row.business_name ?? "").trim();
  if (business) return business;
  const person = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  return person || "another prospect";
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  // "Today" by the server's clock rather than the browser's: a caller whose
  // machine is a day behind must not be shown yesterday's slots as live.
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await client
    .from("leads")
    .select("id, business_name, first_name, last_name, follow_up_date, follow_up_time")
    .is("deleted_at", null)
    .not("follow_up_date", "is", null)
    .not("follow_up_time", "is", null)
    .gte("follow_up_date", today)
    .order("follow_up_date", { ascending: true });

  if (error) {
    console.error("[cold-call/callback-slots] read failed", error.message);
    return Response.json({ error: "could not read the callbacks" }, { status: 500 });
  }

  const taken = ((data ?? []) as Row[]).map((row) => ({
    leadId: row.id,
    date: row.follow_up_date,
    // Postgres hands a `time` column back as "14:30:00"; the picker compares
    // against "14:30". Normalised on the client (normalizeTime) rather than
    // here, so both halves reduce it through exactly one function.
    time: row.follow_up_time,
    name: holderName(row),
  }));

  return Response.json({ taken });
};
