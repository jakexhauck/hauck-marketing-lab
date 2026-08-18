import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { agencyTimezone, isAgencyGhlConfigured } from "../../../lib/agencyGhl";
import {
  fetchAgencyContact,
  fetchConversationCalls,
  fetchRecentConversations,
} from "../../../lib/agencyCallLog";
import { callStamp } from "../../../lib/coldCallBridge";
import { dateStringInZone } from "../../../lib/tz";
import {
  PENDING_OUTCOME,
  conversationsToOpen,
  isLiveCall,
  matchCall,
  readWindowMinutes,
  splitContactName,
  tallyDials,
  type DialTally,
  type KnownDial,
} from "../../../lib/powerDialer";

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

// The columns the sync reads back, in one place so the two queries agree.
const DIAL_COLUMNS = "id, lead_id, outcome, dialed_at, call_message_id, call_status, duration_seconds";

interface DialRecord {
  id: string;
  lead_id: string | null;
  outcome: string;
  dialed_at: string;
  call_message_id: string | null;
  call_status: string | null;
  duration_seconds: number | null;
}

interface LeadRecord {
  id: string;
  ghl_contact_id: string | null;
  business_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  status: string | null;
  no_answer: number | null;
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
  let { dials, leads } = await readWindowRows(client, since);

  if (isAgencyGhlConfigured(ctx.env)) {
    const synced = await syncRecentCalls(ctx, client, { dials, leads, since, callerId: ctx.data.admin!.id });
    if (synced) ({ dials, leads } = await readWindowRows(client, since));
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
): Promise<DialTally> {
  const day = dateStringInZone(zone, now);
  const { data } = await client.from("cold_call_dials").select("caller_id").eq("day", day);
  const rows = (data ?? []) as { caller_id: string | null }[];

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

async function readWindowRows(
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

interface SyncInput {
  dials: DialRecord[];
  leads: LeadRecord[];
  since: number;
  callerId: string;
}

// Read the wake the dialer left, and write what is new. True when anything
// changed, which is the signal to re-read the window before answering.
async function syncRecentCalls(
  ctx: Parameters<PagesFunction<Env, string, ApiData>>[0],
  client: SupabaseClient,
  { dials, leads, since, callerId }: SyncInput,
): Promise<boolean> {
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const known: KnownDial[] = dials.map((dial) => ({
    id: dial.id,
    contactId: dial.lead_id ? (leadById.get(dial.lead_id)?.ghl_contact_id ?? null) : null,
    callMessageId: dial.call_message_id,
    dialedAtMs: Date.parse(dial.dialed_at),
  }));

  const conversations = await fetchRecentConversations(ctx.env);
  const toOpen = conversationsToOpen(conversations, known, since);
  if (toOpen.length === 0) return false;

  const zone = agencyTimezone(ctx.env);
  let changed = false;

  for (const conv of toOpen) {
    const contactId = conv.contactId as string;
    const calls = await fetchConversationCalls(ctx.env, conv.id, since);

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
        changed = true;
        continue;
      }

      const leadId = await resolveLead(ctx, client, contactId, conv);
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
      // stop reading the rest of the conversation.
      if (!error && data) {
        known.push({
          id: (data as { id: string }).id,
          contactId,
          callMessageId: stamp.callMessageId,
          dialedAtMs: atMs,
        });
        changed = true;
      }
    }
  }

  return changed;
}

// Which prospect this call belongs to, creating them if the dialer was pointed
// at a list this app has never seen.
//
// A found lead is also BACKFILLED with the contact id when it does not have one:
// matching on the number is how a prospect imported here and dialled over there
// gets tied to their own calls, and doing it once means the next call resolves
// on the id alone.
async function resolveLead(
  ctx: Parameters<PagesFunction<Env, string, ApiData>>[0],
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

  const contact = await fetchAgencyContact(ctx.env, contactId);
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
