import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { agencyTimezone, isAgencyGhlConfigured } from "../../../lib/agencyGhl";
import { dateStringInZone } from "../../../lib/tz";
import {
  PENDING_OUTCOME,
  isLiveCall,
  readWindowMinutes,
  tallyDials,
  type DialTally,
} from "../../../lib/powerDialer";
import {
  DialReadError,
  readWindowRows,
  runPowerDialerSync,
  syncChanged,
} from "../../../lib/powerDialerSync";

// GET /api/admin/cold-call/live  (admin session gated in _middleware.ts)
//
// Who the power dialer just rang, and which of those calls nobody has judged yet.
//
// GoHighLevel's power dialer works a list without telling this app anything: the
// session is not on any API, and the softphone cannot be brought over here (see
// docs/connections/cold-call-dialer.md for why that was settled). What it leaves
// behind is a call message on each prospect's conversation, and that is enough.
// This endpoint reads the conversations that just moved, turns any outbound call
// in them into a dial row, and hands the caller back a short list: the call
// happening now, and the ones still waiting on an outcome.
//
// It WRITES on a GET, which is unusual and deliberate. The alternative is a
// separate sync the browser has to remember to call, and a caller mid-shift with
// a dialer running is exactly who would not. The write is idempotent (one row
// per GoHighLevel call message, enforced by a unique index in 0113), so a poll
// that runs twice, or two tabs polling at once, cannot double count.
//
// Every branch is best effort. A poll that cannot reach GoHighLevel returns what
// the table already holds rather than an error: the next one is seconds away and
// nobody on the phones can act on a failed request.

interface LiveCall {
  dialId: string;
  leadId: string | null;
  businessName: string;
  name: string;
  phone: string;
  status: string;
  // How many times this prospect has gone unanswered before this call. Carried
  // so the panel's own buttons can move a lead through the two dial stages
  // exactly as the call card does, rather than a second, looser rule.
  noAnswer: number;
  startedAt: string;
  // True for the call that is, as far as a poll can tell, happening now.
  live: boolean;
  callStatus: string | null;
  durationSeconds: number | null;
  // The prospect was created from the GoHighLevel contact by this sync, so
  // nothing but the call itself is known about them yet.
  isNew: boolean;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const url = new URL(ctx.request.url);
  const windowMinutes = readWindowMinutes(url.searchParams.get("window"));
  const now = Date.now();
  const since = now - windowMinutes * 60_000;

  // The table first, always. It is the answer even when GoHighLevel is
  // unreachable, and it is what tells the sync which calls it has already seen.
  //
  // A read that FAILS is answered as a failure, never as a quiet window. These
  // rows are the cards on the dialer, so "the database did not answer" and
  // "nobody is on the phone" render identically, and only one of them is true:
  // an empty list wiped the caller's cards mid-call, an error leaves the last
  // good answer on screen and asks again in eight seconds.
  let dials: Awaited<ReturnType<typeof readWindowRows>>["dials"];
  let leads: Awaited<ReturnType<typeof readWindowRows>>["leads"];
  try {
    ({ dials, leads } = await readWindowRows(client, since));
  } catch (err) {
    if (!(err instanceof DialReadError)) throw err;
    console.error("[cold-call/live]", err.message);
    return Response.json({ error: "dials_unavailable" }, { status: 503 });
  }

  if (isAgencyGhlConfigured(ctx.env)) {
    const counts = await runPowerDialerSync(ctx.env, client, {
      dials,
      leads,
      since,
      callerId: ctx.data.admin!.id,
    });
    // A re-read that fails leaves the rows read above standing. They are one
    // sync behind rather than wrong, which is what this whole endpoint already
    // is between polls, and far better than throwing away a good answer.
    if (syncChanged(counts)) {
      try {
        ({ dials, leads } = await readWindowRows(client, since));
      } catch (err) {
        if (!(err instanceof DialReadError)) throw err;
        console.error("[cold-call/live] re-read after sync", err.message);
      }
    }
  }

  // Read AFTER the sync, so a call the dialer placed twenty seconds ago is in
  // the number the caller is looking at. Same rows the tracker derives from.
  const today = await readDayTally(client, agencyTimezone(ctx.env), now);

  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const calls: LiveCall[] = dials
    .filter((dial) => dial.outcome === PENDING_OUTCOME)
    .sort((a, b) => Date.parse(b.dialed_at) - Date.parse(a.dialed_at))
    .map((dial) => {
      const lead = dial.lead_id ? leadById.get(dial.lead_id) : undefined;
      const atMs = Date.parse(dial.dialed_at);
      const name = `${lead?.first_name ?? ""} ${lead?.last_name ?? ""}`.trim();
      return {
        dialId: dial.id,
        leadId: dial.lead_id,
        businessName: (lead?.business_name ?? "").trim(),
        name,
        phone: lead?.phone ?? "",
        status: lead?.status ?? "",
        noAnswer: lead?.no_answer ?? 0,
        startedAt: dial.dialed_at,
        live: isLiveCall(atMs, now),
        callStatus: dial.call_status,
        durationSeconds: dial.duration_seconds,
        // A prospect the sync itself stood up carries the source it wrote.
        isNew: (lead?.business_name ?? "").trim() === "" && name === "",
      };
    });

  return Response.json({
    configured: isAgencyGhlConfigured(ctx.env),
    calls,
    today,
  });
};

// How many dials the day has, and who made them.
//
// Counted from the rows rather than kept as a total anywhere: the tracker's own
// numbers are derived from this table for exactly the same reason, and a second
// place to store a count is a second number to argue over.
//
// The day is the agency's day, and it is compared against the row's own `day`
// column, which the writer stamped in that same zone. A call at 11.58pm stays on
// the shift that made it.
async function readDayTally(
  client: SupabaseClient,
  zone: string,
  now: number,
): Promise<DialTally | null> {
  const day = dateStringInZone(zone, now);
  // The outcome comes back with the caller because the tally decides from it
  // whether the row is a dial at all (0117).
  const { data, error } = await client
    .from("cold_call_dials")
    .select("caller_id, outcome")
    .eq("day", day);
  // A failed read here used to render as a day with no dials on it, so the
  // counter on every calling page dropped to zero and climbed back eight
  // seconds later. Null says "not known" and the counter holds its last value.
  if (error) return null;
  const rows = (data ?? []) as { caller_id: string | null; outcome: string | null }[];

  const ids = [...new Set(rows.map((row) => row.caller_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: accounts } = await client
      .from("admin_accounts")
      .select("id, name")
      .in("id", ids);
    for (const account of (accounts ?? []) as { id: string; name: string | null }[]) {
      names.set(account.id, account.name ?? "");
    }
  }

  return tallyDials(rows, names, day);
}
