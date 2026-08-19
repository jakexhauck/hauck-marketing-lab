import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import { agencyTimezone } from "./agencyGhl";
import {
  fetchAgencyContact,
  fetchConversationCalls,
  fetchRecentConversations,
} from "./agencyCallLog";
import { callStamp } from "./coldCallBridge";
import { dateStringInZone } from "./tz";
import {
  PENDING_OUTCOME,
  conversationsToOpen,
  matchCall,
  splitContactName,
  type KnownDial,
} from "./powerDialer";

// Reading the power dialer's wake, in the one place that does it.
//
// This was inside the /live endpoint, which meant recording a call only ever
// happened while somebody had a calling page open in a browser. That held right
// up until it did not: on 2026-08-19 a tab went to the background behind
// GoHighLevel, Chrome throttled its timers, and three real calls sat unrecorded
// for eight minutes before one late poll caught them all up. Every call before
// the gap landed within seventeen seconds; the three in it took 468, 292 and
// 253. Nothing was broken. Nobody was looking.
//
// So the reading moved here, and TWO callers do it: the browser poll, which
// still records what it sees because a caller watching the page should not wait
// a minute for the card to move, and a cron, which is what makes the record
// unconditional. Both write through the same unique index on call_message_id,
// so the two of them racing over one call produces one row.
//
// This module is the talking and the writing. The rules it applies are pure and
// tested in powerDialer.ts, which is where they stay.

// The columns the sync reads back, in one place so every query agrees.
export const DIAL_COLUMNS =
  "id, lead_id, outcome, dialed_at, call_message_id, call_status, duration_seconds";

export interface DialRecord {
  id: string;
  lead_id: string | null;
  outcome: string;
  dialed_at: string;
  call_message_id: string | null;
  call_status: string | null;
  duration_seconds: number | null;
}

export interface LeadRecord {
  id: string;
  ghl_contact_id: string | null;
  business_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  status: string | null;
  no_answer: number | null;
}

export async function readWindowRows(
  client: SupabaseClient,
  since: number,
): Promise<{ dials: DialRecord[]; leads: LeadRecord[] }> {
  const { data } = await client
    .from("cold_call_dials")
    .select(DIAL_COLUMNS)
    .gte("dialed_at", new Date(since).toISOString())
    .order("dialed_at", { ascending: false });
  const dials = (data ?? []) as DialRecord[];

  const leadIds = [...new Set(dials.map((d) => d.lead_id).filter(Boolean))] as string[];
  if (leadIds.length === 0) return { dials, leads: [] };

  const { data: leadRows } = await client
    .from("leads")
    .select("id, ghl_contact_id, business_name, first_name, last_name, phone, status, no_answer")
    .in("id", leadIds);
  return { dials, leads: (leadRows ?? []) as LeadRecord[] };
}

export interface SyncInput {
  dials: DialRecord[];
  leads: LeadRecord[];
  since: number;
  callerId: string;
}

export interface SyncCounts {
  /** Calls nobody had recorded, now rows of their own. */
  created: number;
  /** Calls the caller had already logged by hand, now carrying their call id. */
  stamped: number;
}

/** True when anything changed, which is the signal to re-read the window. */
export function syncChanged(counts: SyncCounts): boolean {
  return counts.created > 0 || counts.stamped > 0;
}

// Read the wake the dialer left, and write what is new.
export async function runPowerDialerSync(
  env: Env,
  client: SupabaseClient,
  { dials, leads, since, callerId }: SyncInput,
): Promise<SyncCounts> {
  const counts: SyncCounts = { created: 0, stamped: 0 };

  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const known: KnownDial[] = dials.map((dial) => ({
    id: dial.id,
    contactId: dial.lead_id ? (leadById.get(dial.lead_id)?.ghl_contact_id ?? null) : null,
    callMessageId: dial.call_message_id,
    dialedAtMs: Date.parse(dial.dialed_at),
  }));

  const conversations = await fetchRecentConversations(env);
  const toOpen = conversationsToOpen(conversations, known, since);
  if (toOpen.length === 0) return counts;

  const zone = agencyTimezone(env);

  for (const conv of toOpen) {
    const contactId = conv.contactId as string;
    const calls = await fetchConversationCalls(env, conv.id, since);

    for (const { message, atMs } of calls) {
      const match = matchCall(known, { callMessageId: message.id, contactId, atMs });
      if (match.kind === "known") continue;

      const stamp = callStamp(message);

      if (match.kind === "stamp") {
        // The caller recorded this call by hand seconds after it ended. Same
        // call, so it is completed rather than repeated, and it gains the
        // duration it could not have had.
        await client
          .from("cold_call_dials")
          .update({
            call_message_id: stamp.callMessageId,
            call_sid: stamp.callSid,
            call_status: stamp.callStatus,
            duration_seconds: stamp.durationSeconds,
          })
          .eq("id", match.dialId);
        const row = known.find((k) => k.id === match.dialId);
        if (row) row.callMessageId = stamp.callMessageId;
        counts.stamped += 1;
        continue;
      }

      const leadId = await resolveLead(env, client, contactId, conv);
      const { data, error } = await client
        .from("cold_call_dials")
        .insert({
          lead_id: leadId,
          caller_id: callerId,
          // The call's own day in the agency's timezone, not today's: a sync
          // running at 12:04am must not file the 11:58pm call under tomorrow.
          day: dateStringInZone(zone, atMs),
          dialed_at: new Date(atMs).toISOString(),
          spoke: false,
          pitched: false,
          outcome: PENDING_OUTCOME,
          call_message_id: stamp.callMessageId,
          call_sid: stamp.callSid,
          call_status: stamp.callStatus,
          duration_seconds: stamp.durationSeconds,
        })
        .select("id")
        .single();

      // A duplicate here is the unique index doing its job: two polls raced over
      // the same call and one of them lost. Not an error, and not a reason to
      // stop reading the rest of the conversation. With the cron running beside
      // the browser poll this is now the ordinary case rather than a rare one.
      if (!error && data) {
        known.push({
          id: (data as { id: string }).id,
          contactId,
          callMessageId: stamp.callMessageId,
          dialedAtMs: atMs,
        });
        counts.created += 1;
      }
    }
  }

  return counts;
}

// Which prospect this call belongs to, creating them if the dialer was pointed
// at a list this app has never seen.
//
// A found lead is also BACKFILLED with the contact id when it does not have one:
// matching on the number is how a prospect imported here and dialled over there
// gets tied to their own calls, and doing it once means the next call resolves
// on the id alone.
async function resolveLead(
  env: Env,
  client: SupabaseClient,
  contactId: string,
  conv: { fullName?: string | null; contactName?: string | null; phone?: string | null },
): Promise<string | null> {
  const { data: byContact } = await client
    .from("leads")
    .select("id")
    .eq("ghl_contact_id", contactId)
    .is("deleted_at", null)
    .maybeSingle();
  if (byContact) return (byContact as { id: string }).id;

  const contact = await fetchAgencyContact(env, contactId);
  const phone = (contact?.phone || conv.phone || "").trim();

  // Same prospect, dialled from the other side. Matched on the last ten digits,
  // because the book holds numbers the way a scrape wrote them and GoHighLevel
  // holds E.164, and neither is going to change to suit the other.
  const digits = phone.replace(/\D/g, "").slice(-10);
  if (digits.length === 10) {
    const { data: byPhone } = await client
      .from("leads")
      .select("id")
      .is("deleted_at", null)
      .is("ghl_contact_id", null)
      .ilike("phone", `%${digits.slice(0, 3)}%${digits.slice(3, 6)}%${digits.slice(6)}%`)
      .limit(1)
      .maybeSingle();
    if (byPhone) {
      const id = (byPhone as { id: string }).id;
      await client.from("leads").update({ ghl_contact_id: contactId }).eq("id", id);
      return id;
    }
  }

  const displayed = (contact?.name || conv.fullName || conv.contactName || "").trim();
  const { firstName, lastName } = splitContactName(
    contact?.firstName || contact?.lastName
      ? `${contact?.firstName ?? ""} ${contact?.lastName ?? ""}`.trim()
      : displayed,
  );

  const { data: created } = await client
    .from("leads")
    .insert({
      first_name: firstName,
      last_name: lastName,
      phone,
      email: contact?.email ?? "",
      business_name: contact?.companyName ?? "",
      website: contact?.website ?? "",
      // Named for where it came from, because that is the only provenance there
      // is: nobody here typed this prospect in, a dialer rang them.
      source: "Power dialer",
      status: "New Lead",
      ghl_contact_id: contactId,
      ghl_synced_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  return created ? (created as { id: string }).id : null;
}

// ---------------------------------------------------------------------------
// Who a call belongs to when nobody is at the keyboard.
//
// caller_id is NOT NULL (0052), so the cron cannot decline to answer this. Nor
// should it: a dial with no caller drops out of the per-caller breakdown on
// every calling page, and a shift that reads "117 dials, nobody made them" is
// worse than a reasonable attribution.
//
// The reasonable attribution is the person who has been pressing outcomes. A
// power dialer session is one caller working a list, and the last row written is
// the best evidence of who that is. The guess is also SELF-CORRECTING: an
// outcome press stamps caller_id onto the row it completes (see dials.ts), so
// the moment somebody judges the call, their id replaces this one.
//
// The lookback is a working day rather than an hour. It has to survive a lunch
// break, and the alternative when it expires is not a better guess, it is no
// row at all.
const CALLER_LOOKBACK_MS = 12 * 60 * 60_000;

export async function resolveCronCaller(client: SupabaseClient): Promise<string | null> {
  const since = new Date(Date.now() - CALLER_LOOKBACK_MS).toISOString();

  const { data: recent } = await client
    .from("cold_call_dials")
    .select("caller_id")
    .gte("dialed_at", since)
    .order("dialed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const recentId = (recent as { caller_id: string | null } | null)?.caller_id ?? null;
  if (recentId) return recentId;

  // Nobody has dialled today. Fall back to the last person who ever did, which
  // on a single-caller account is always the right answer and on a shared one is
  // corrected by the first press.
  const { data: ever } = await client
    .from("cold_call_dials")
    .select("caller_id")
    .order("dialed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (ever as { caller_id: string | null } | null)?.caller_id ?? null;
}
